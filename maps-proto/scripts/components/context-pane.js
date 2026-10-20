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
  const overlayFrames = [];
  let overlaySequence = 0;
  let activeContext = null;
  let activeDataUrl = document.baseURI;
  const sheet = createContextSheetController(element);

  function setFrameUnderlay(frame, isUnderlay) {
    if (!frame) return;
    frame.classList.toggle("is-context-underlay", isUnderlay);
    if (isUnderlay) {
      frame.setAttribute("aria-hidden", "true");
      frame.inert = true;
    } else {
      frame.removeAttribute("aria-hidden");
      frame.inert = false;
    }
  }

  function clearOverlayFrames() {
    overlayFrames.splice(0).forEach(({ frame, disposeTileStrips }) => {
      disposeTileStrips();
      frame.remove();
    });
    setFrameUnderlay(element.closest(".app-frame--context"), false);
  }

  async function setContext(context, dataUrl = document.baseURI) {
    const version = ++renderVersion;
    activeContext = context;
    activeDataUrl = dataUrl;
    const content = createContextContent(context, dataUrl);
    clearOverlayFrames();
    element.dispatchEvent(new CustomEvent("contexttitlechange", {
      bubbles: true,
      detail: { title: context.title, context, dataUrl },
    }));
    element.dispatchEvent(new CustomEvent("contextopen", { bubbles: true }));
    sheet.setState("half");
    element.classList.add("is-changing");
    await waitForTransition(element);
    if (version !== renderVersion) return;
    disposeTileStrips();
    element.replaceChildren(content);
    disposeTileStrips = initializeTileStrips(element);
    requestAnimationFrame(() => {
      if (version === renderVersion) element.classList.remove("is-changing");
    });
  }

  function setSection(section, dataUrl = document.baseURI) {
    const contextTitle = activeContext?.title || "Context";
    openOverlayFrame(
      section.title,
      buildSectionContext(contextTitle, section, dataUrl),
    );
  }

  function setDownloads() {
    if (!activeContext) return;
    const downloadSections = Array.isArray(activeContext.downloads) ? activeContext.downloads : [];
    openOverlayFrame(
      "Downloads",
      buildDownloadsContext(activeContext.title, downloadSections, activeDataUrl),
    );
  }

  function setSuggest() {
    if (!activeContext?.suggest) return;
    openOverlayFrame(
      "Suggest",
      buildSuggestContext(activeContext.title, activeContext.suggest),
    );
  }

  function openOverlayFrame(title, content) {
    const baseFrame = element.closest(".app-frame--context");
    const stage = baseFrame?.parentElement;
    if (!baseFrame || !stage) return;

    const previousFrame = overlayFrames.at(-1)?.frame || baseFrame;
    setFrameUnderlay(previousFrame, true);
    const openingFrame = baseFrame.cloneNode(false);
    openingFrame.id = `context-child-frame-${++overlaySequence}`;
    openingFrame.setAttribute("aria-label", title);
    openingFrame.removeAttribute("aria-hidden");
    openingFrame.removeAttribute("inert");
    openingFrame.inert = false;
    [
      "is-closed",
      "is-context-underlay",
      "is-context-dragging",
      "is-sheet-dragging",
    ].forEach((className) => openingFrame.classList.remove(className));
    openingFrame.classList.add("app-frame--context-section", "is-context-section-entering");
    const frameContent = document.createElement("div");
    frameContent.className = "app-frame__content";
    frameContent.append(content);
    openingFrame.append(frameContent);
    element.dispatchEvent(new CustomEvent("contextopen", { bubbles: true }));
    stage.append(openingFrame);
    const disposeTileStrips = initializeTileStrips(openingFrame);
    overlayFrames.push({ frame: openingFrame, disposeTileStrips });
    enableContextFrameDrag(openingFrame, ".context-pane__section-header");
    openingFrame.addEventListener("click", (event) => {
      const close = event.target.closest("[data-context-close]");
      if (close) {
        closeOverlayFrame();
        return;
      }

      const item = event.target.closest("[data-page-id]");
      if (item) {
        if (item.dataset.downloadFormat) {
          openingFrame.dispatchEvent(new CustomEvent("contextdownload", {
            bubbles: true,
            detail: {
              contextId: element.dataset.contextId,
              format: item.dataset.downloadFormat,
              itemId: item.dataset.pageId,
            },
          }));
          return;
        }
        openingFrame.dispatchEvent(new CustomEvent("contextitemselect", {
          bubbles: true,
          detail: { contextId: element.dataset.contextId, itemId: item.dataset.pageId },
        }));
      }

      const geometry = event.target.closest("[data-suggest-geometry]");
      if (geometry && openingFrame.contains(geometry)) {
        openingFrame.dispatchEvent(new CustomEvent("contextsuggest", {
          bubbles: true,
          detail: {
            contextId: element.dataset.contextId,
            geometry: geometry.dataset.suggestGeometry,
          },
        }));
      }
    });
    openingFrame.addEventListener("sectionexpand", (event) => {
      const { section, dataUrl: sectionDataUrl } = event.detail || {};
      if (section) setSection(section, sectionDataUrl || activeDataUrl);
    });
    openingFrame.getBoundingClientRect();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      openingFrame.classList.remove("is-context-section-entering");
    }));
  }

  function closeOverlayFrame() {
    const current = overlayFrames.pop();
    if (!current) return;
    const { frame: closingFrame, disposeTileStrips } = current;
    disposeTileStrips();
    const previousFrame = overlayFrames.at(-1)?.frame || element.closest(".app-frame--context");
    setFrameUnderlay(previousFrame, false);
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
      if (overlayFrames.length) {
        closeOverlayFrame();
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
    setDownloads,
    setSuggest,
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
  const content = createChildContextContent(contextTitle);

  const sectionTitle = document.createElement("h3");
  sectionTitle.className = "context-pane__section-title";
  sectionTitle.textContent = section.title;
  const list = createPageList({
    label: `${section.title} items`,
    sections: [{ ...section, view: "list", selectable: false, expandable: false }],
  }, dataUrl);
  list.classList.add("context-pane__section-list");
  content.append(sectionTitle, list);
  return content;
}

function buildDownloadsContext(contextTitle, downloadSections, dataUrl) {
  const content = createChildContextContent(contextTitle);
  if (!downloadSections?.length) {
    const empty = document.createElement("p");
    empty.className = "context-pane__downloads-empty";
    empty.textContent = "No downloads available.";
    content.append(empty);
    return content;
  }

  const formats = createPageList({
    label: `${contextTitle} downloads`,
    sections: downloadSections.map((section) => ({
      ...section,
      view: "tiles",
      selectable: false,
      expandable: true,
      items: section.items.map((format) => ({
        ...format,
        downloadFormat: format.downloadFormat || format.id,
      })),
    })),
  }, dataUrl);
  formats.classList.add("context-pane__download-formats");
  content.append(formats);
  return content;
}

function buildSuggestContext(contextTitle, suggestion) {
  const content = createChildContextContent(contextTitle);
  const body = document.createElement("p");
  body.className = "context-pane__suggestion-body";
  body.textContent = suggestion.body || "Choose a feature type to suggest a change to the map.";

  const actions = document.createElement("div");
  actions.className = "context-pane__suggestion-actions";
  actions.setAttribute("aria-label", "Feature types");
  (suggestion.options || []).forEach(({ id, label }) => {
    const button = document.createElement("button");
    button.className = "context-pane__action";
    button.type = "button";
    button.dataset.suggestGeometry = id;
    button.append(createGeometryIcon(id));
    const text = document.createElement("span");
    text.textContent = label;
    button.append(text);
    actions.append(button);
  });

  content.append(body, actions);
  return content;
}

function createGeometryIcon(type) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("context-pane__geometry-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  if (type === "point") {
    const pin = document.createElementNS(svg.namespaceURI, "path");
    pin.setAttribute("d", "M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z");
    const center = document.createElementNS(svg.namespaceURI, "circle");
    center.setAttribute("cx", "12");
    center.setAttribute("cy", "10");
    center.setAttribute("r", "2");
    svg.append(pin, center);
  } else if (type === "line") {
    const line = document.createElementNS(svg.namespaceURI, "path");
    line.setAttribute("d", "M5 19 19 5");
    const endpoints = document.createElementNS(svg.namespaceURI, "path");
    endpoints.setAttribute("d", "M3.5 19h3M17.5 5h3");
    svg.append(line, endpoints);
  } else if (type === "polygon") {
    const polygon = document.createElementNS(svg.namespaceURI, "polygon");
    polygon.setAttribute("points", "12,3 21,8 19,18 11,21 4,14 5,7");
    svg.append(polygon);
  }

  return svg;
}

function createChildContextContent(contextTitle) {
  const content = document.createElement("div");
  content.className = "context-pane__content context-pane__section-content";

  const header = document.createElement("header");
  header.className = "context-pane__section-header";
  const title = document.createElement("h2");
  title.textContent = contextTitle;
  const close = createControlButton("close", "Close context");
  close.dataset.contextClose = "true";
  header.append(title, close);
  content.append(header);
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
