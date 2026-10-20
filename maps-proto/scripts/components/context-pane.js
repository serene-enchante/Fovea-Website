import { createMaterialIcon } from "./material-icon.js";
import { createPageList, initializeTileStrips } from "./page-list.js";
import { enableContextFrameDrag } from "./context-frame-drag.js";
import { createContextSheetController } from "./context-sheet-interactions.js";

export function createContextPane() {
  const element = document.createElement("div");
  element.className = "context-pane";
  element.setAttribute("aria-live", "polite");
  let renderVersion = 0;
  let disposeTileStrips = () => {};
  let sectionFrame = null;
  let underlayFrame = null;
  let activeContext = null;
  let activeDataUrl = document.baseURI;
  const sheet = createContextSheetController(element);

  function restoreUnderlay() {
    if (!underlayFrame) return;
    underlayFrame.classList.remove("is-context-underlay");
    underlayFrame.removeAttribute("aria-hidden");
    underlayFrame.inert = false;
    underlayFrame = null;
  }

  async function setContext(context, dataUrl = document.baseURI) {
    const version = ++renderVersion;
    activeContext = context;
    activeDataUrl = dataUrl;
    const content = createContextContent(context, dataUrl);
    sectionFrame?.remove();
    sectionFrame = null;
    restoreUnderlay();
    element.dispatchEvent(new CustomEvent("contexttitlechange", {
      bubbles: true,
      detail: { title: context.title, context, dataUrl },
    }));
    element.dispatchEvent(new CustomEvent("contextopen", { bubbles: true }));
    sheet.setState("half");
    element.classList.add("is-changing");
    await waitForTransition(element);
    if (version !== renderVersion) return;
    sectionFrame = null;
    disposeTileStrips();
    element.replaceChildren(content);
    disposeTileStrips = initializeTileStrips(element);
    requestAnimationFrame(() => {
      if (version === renderVersion) element.classList.remove("is-changing");
    });
  }

  function setSection(section, dataUrl = document.baseURI) {
    if (sectionFrame) {
      sectionFrame.remove();
      sectionFrame = null;
      restoreUnderlay();
    }
    const baseFrame = element.closest(".app-frame--context");
    const stage = baseFrame?.parentElement;
    if (!baseFrame || !stage) return;

    const openingFrame = baseFrame.cloneNode(false);
    openingFrame.id = "context-section-frame";
    openingFrame.setAttribute("aria-label", section.title);
    openingFrame.removeAttribute("aria-hidden");
    openingFrame.removeAttribute("inert");
    openingFrame.inert = false;
    [
      "is-closed",
      "is-context-dragging",
      "is-sheet-dragging",
    ].forEach((className) => openingFrame.classList.remove(className));
    openingFrame.classList.add("app-frame--context-section", "is-context-section-entering");
    const frameContent = document.createElement("div");
    frameContent.className = "app-frame__content";
    const contextTitle = element.querySelector(".context-pane__hero-title")?.textContent?.trim() || "Context";
    frameContent.append(buildSectionContext(contextTitle, section, dataUrl));
    openingFrame.append(frameContent);
    sectionFrame = openingFrame;
    underlayFrame = baseFrame;
    baseFrame.classList.add("is-context-underlay");
    baseFrame.setAttribute("aria-hidden", "true");
    baseFrame.inert = true;
    element.dispatchEvent(new CustomEvent("contextopen", { bubbles: true }));
    stage.append(openingFrame);
    enableContextFrameDrag(openingFrame, ".context-pane__section-header");
    openingFrame.addEventListener("click", (event) => {
      const close = event.target.closest("[data-context-close]");
      if (close) {
        closeSection();
        return;
      }

      const item = event.target.closest("[data-page-id]");
      if (item) {
        openingFrame.dispatchEvent(new CustomEvent("contextitemselect", {
          bubbles: true,
          detail: { contextId: element.dataset.contextId, itemId: item.dataset.pageId },
        }));
      }
    });
    openingFrame.getBoundingClientRect();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      openingFrame.classList.remove("is-context-section-entering");
    }));
  }

  function closeSection() {
    if (!sectionFrame) return;
    const closingFrame = sectionFrame;
    sectionFrame = null;
    restoreUnderlay();
    closingFrame.classList.add("is-context-section-closing");
    const finish = (event) => {
      if (event && (event.target !== closingFrame || event.propertyName !== "transform")) return;
      clearTimeout(timeout);
      closingFrame.removeEventListener("transitionend", finish);
      closingFrame.remove();
    };
    closingFrame.addEventListener("transitionend", finish);
    const timeout = window.setTimeout(finish, 460);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) finish();
  }

  element.addEventListener("sectionexpand", (event) => {
    if (!element.contains(event.target)) return;
    setSection(event.detail.section, event.detail.dataUrl);
  });

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (
      target.isContentEditable || target.closest("input, textarea, select")
    )) return;

    const frame = element.closest(".app-frame--context");
    if (!frame || frame.classList.contains("is-closed")) return;

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (sectionFrame) {
        closeSection();
      } else {
        element.dispatchEvent(new CustomEvent("contextclose", { bubbles: true }));
      }
      return;
    }

    if (/^[1-9]$/.test(event.key)) {
      const section = activeContext?.sections?.[Number(event.key) - 1];
      if (!section) return;
      event.preventDefault();
      setSection(section, activeDataUrl);
    }
  });

  element.addEventListener("click", (event) => {
    const close = event.target.closest("[data-context-close]");
    if (close && element.contains(close)) {
      element.dispatchEvent(new CustomEvent("contextclose", { bubbles: true }));
      return;
    }

    const action = event.target.closest("[data-context-action]");
    if (action && element.contains(action)) {
      element.dispatchEvent(new CustomEvent("contextaction", {
        bubbles: true,
        detail: { contextId: element.dataset.contextId, actionId: action.dataset.contextAction },
      }));
      return;
    }

    const item = event.target.closest("[data-page-id]");
    if (item && element.contains(item)) {
      element.dispatchEvent(new CustomEvent("contextitemselect", {
        bubbles: true,
        detail: { contextId: element.dataset.contextId, itemId: item.dataset.pageId },
      }));
    }
  });

  enableContextFrameDrag(element, ".context-pane__hero");

  return {
    element,
    setContext,
    setSection,
  };
}

export function createContextContent(context, dataUrl, { includeSections = true } = {}) {
  const content = document.createElement("div");
  content.className = "context-pane__content";

  const hero = document.createElement("header");
  hero.className = "context-pane__hero";
  const image = document.createElement("img");
  image.className = "context-pane__hero-image";
  image.src = new URL(context.image, dataUrl).href;
  image.alt = context.imageAlt || "";
  image.loading = "lazy";
  const title = document.createElement("h2");
  title.className = "context-pane__hero-title";
  const titleText = document.createElement("span");
  titleText.textContent = context.title;
  title.append(titleText);
  const controls = document.createElement("div");
  controls.className = "context-pane__controls";
  const share = createControlButton("ios_share", "Share", "share");
  controls.append(share);
  hero.append(image);
  hero.append(title, controls);

  const actions = document.createElement("div");
  actions.className = "context-pane__actions";
  actions.setAttribute("aria-label", `${context.title} actions`);
  context.actions.forEach(({ id, label, icon, disabled = false }) => {
    const button = document.createElement("button");
    button.className = "context-pane__action";
    button.type = "button";
    button.dataset.contextAction = id;
    button.disabled = disabled;
    button.append(createMaterialIcon(icon, "context-pane__action-icon"));
    const text = document.createElement("span");
    text.textContent = label;
    button.append(text);
    actions.append(button);
  });

  content.append(hero, actions);
  if (includeSections) {
    const zones = createPageList({
      label: `${context.title} context`,
      sections: context.sections,
    }, dataUrl);
    zones.classList.add("context-pane__zones");
    content.append(zones);
  }
  return content;
}

function buildSectionContext(contextTitle, section, dataUrl) {
  const content = document.createElement("div");
  content.className = "context-pane__content context-pane__section-content";

  const header = document.createElement("header");
  header.className = "context-pane__section-header";
  const title = document.createElement("h2");
  title.textContent = contextTitle;
  const close = createControlButton("close", "Close context");
  close.dataset.contextClose = "true";
  header.append(title, close);

  const sectionTitle = document.createElement("h3");
  sectionTitle.className = "context-pane__section-title";
  sectionTitle.textContent = section.title;
  const list = createPageList({
    label: `${section.title} items`,
    sections: [{ ...section, view: "list", selectable: false, expandable: false }],
  }, dataUrl);
  list.classList.add("context-pane__section-list");
  content.append(header, sectionTitle, list);
  return content;
}

function createControlButton(iconName, label, action) {
  const button = document.createElement("button");
  button.className = "context-pane__control";
  button.type = "button";
  button.setAttribute("aria-label", label);
  if (action) button.dataset.contextAction = action;
  button.append(createMaterialIcon(iconName, "context-pane__control-icon"));
  return button;
}

function waitForTransition(element) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let timeout;
    const finish = (event) => {
      if (event && event.target !== element) return;
      clearTimeout(timeout);
      element.removeEventListener("transitionend", finish);
      resolve();
    };
    element.addEventListener("transitionend", finish);
    timeout = window.setTimeout(finish, 180);
  });
}
