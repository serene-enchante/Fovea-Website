import { createMaterialIcon } from "./material-icon.js";
import { createPageList, initializeTileStrips } from "./page-list.js";

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

  function restoreUnderlay() {
    if (!underlayFrame) return;
    underlayFrame.classList.remove("is-context-underlay");
    underlayFrame.removeAttribute("aria-hidden");
    underlayFrame.inert = false;
    underlayFrame = null;
  }

  function setSheetState(state) {
    const frame = element.closest(".app-frame--context");
    if (!frame) return;
    frame.classList.remove("is-sheet-dragging");
    frame.style.removeProperty("top");
    frame.classList.remove("is-sheet-expanded", "is-sheet-half", "is-sheet-collapsed");
    if (!window.matchMedia("(max-width: 700px)").matches) return;
    if (state === "expanded") frame.classList.add("is-sheet-expanded");
    if (state === "half") frame.classList.add("is-sheet-half");
    if (state === "collapsed") frame.classList.add("is-sheet-collapsed");
  }

  function stepSheet(direction) {
    const frame = element.closest(".app-frame--context");
    if (!frame || !window.matchMedia("(max-width: 700px)").matches) return;

    const state = frame.classList.contains("is-sheet-expanded")
      ? "expanded"
      : frame.classList.contains("is-sheet-collapsed")
        ? "collapsed"
        : "half";
    const states = ["collapsed", "half", "expanded"];
    const currentIndex = states.indexOf(state);
    const nextIndex = Math.max(0, Math.min(states.length - 1, currentIndex + direction));
    setSheetState(states[nextIndex]);
  }

  async function setContext(context, dataUrl = document.baseURI) {
    const version = ++renderVersion;
    activeContext = context;
    activeDataUrl = dataUrl;
    const content = buildContext(context, dataUrl);
    sectionFrame?.remove();
    sectionFrame = null;
    restoreUnderlay();
    element.dispatchEvent(new CustomEvent("contextopen", { bubbles: true }));
    setSheetState("half");
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
    enableFrameDrag(openingFrame, ".context-pane__section-header");
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

  enableFrameDrag(element, ".context-pane__hero");

  let wheelDistance = 0;
  let wheelHandled = false;
  let wheelResetTimer;
  element.addEventListener("wheel", (event) => {
    if (!window.matchMedia("(max-width: 700px)").matches) return;
    const frame = element.closest(".app-frame--context");
    const content = element.querySelector(".context-pane__content");
    wheelDistance += event.deltaY;
    clearTimeout(wheelResetTimer);
    wheelResetTimer = window.setTimeout(() => {
      wheelDistance = 0;
      wheelHandled = false;
    }, 180);
    if (!wheelHandled && wheelDistance >= 36 && !frame?.classList.contains("is-sheet-expanded")) {
      stepSheet(1);
      wheelHandled = true;
    } else if (!wheelHandled && wheelDistance <= -36 && content?.scrollTop <= 1) {
      stepSheet(-1);
      wheelHandled = true;
    }
  }, { passive: true });

  let touchStart = null;
  let pendingTop = null;
  let dragFrame = null;
  let dragFrameId = 0;
  element.addEventListener("touchstart", (event) => {
    if (!window.matchMedia("(max-width: 700px)").matches || event.touches.length !== 1) {
      touchStart = null;
      dragFrame = null;
      return;
    }
    const touch = event.touches[0];
    dragFrame = element.closest(".app-frame--context");
    if (!dragFrame) return;
    const bounds = dragFrame.getBoundingClientRect();
    const content = element.querySelector(".context-pane__content");
    touchStart = {
      identifier: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      top: bounds.top,
      anchorY: touch.clientY,
      anchorTop: bounds.top,
      scrollTop: content?.scrollTop || 0,
      maxTop: Math.max(0, dragFrame.parentElement.clientHeight - 68),
      startState: dragFrame.classList.contains("is-sheet-collapsed")
        ? "collapsed"
        : dragFrame.classList.contains("is-sheet-expanded")
          ? "expanded"
          : "half",
      dragging: false,
    };
  }, { passive: true });

  element.addEventListener("touchmove", (event) => {
    if (!touchStart || !window.matchMedia("(max-width: 700px)").matches) return;
    const touch = Array.from(event.touches).find(({ identifier }) => identifier === touchStart.identifier)
      || event.touches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;
    if (Math.abs(deltaY) <= 6 || Math.abs(deltaY) <= Math.abs(deltaX) * 1.25) return;

    const content = element.querySelector(".context-pane__content");
    const isMovingDown = deltaY > 0;
    if (!touchStart.dragging) {
      if (isMovingDown && content?.scrollTop > 1) return;
      if (!isMovingDown && touchStart.startState === "expanded") return;

      const reachedScrollTopDuringGesture = isMovingDown && touchStart.scrollTop > 1;
      touchStart.anchorY = reachedScrollTopDuringGesture ? touch.clientY : touchStart.y;
      touchStart.anchorTop = reachedScrollTopDuringGesture
        ? dragFrame.getBoundingClientRect().top
        : touchStart.top;
      touchStart.dragging = true;
      dragFrame.classList.add("is-sheet-dragging");
    }
    if (touchStart.dragging) {
      event.preventDefault();
      pendingTop = Math.max(
        0,
        Math.min(touchStart.maxTop, touchStart.anchorTop + touch.clientY - touchStart.anchorY),
      );
      if (!dragFrameId) {
        dragFrameId = requestAnimationFrame(() => {
          dragFrame.style.top = `${pendingTop}px`;
          dragFrameId = 0;
        });
      }
    }
  }, { passive: false });

  function finishSheetDrag() {
    if (!touchStart?.dragging || !dragFrame) {
      touchStart = null;
      dragFrame = null;
      return;
    }
    if (dragFrameId) cancelAnimationFrame(dragFrameId);
    dragFrameId = 0;
    const progress = dragFrame.parentElement.clientHeight > 68
      ? 1 - (pendingTop ?? touchStart.top) / (dragFrame.parentElement.clientHeight - 68)
      : 0.5;
    setSheetState(resolveDraggedSheetState(progress, touchStart.startState));
    touchStart = null;
    dragFrame = null;
    pendingTop = null;
  }

  element.addEventListener("touchend", finishSheetDrag, { passive: true });

  element.addEventListener("touchcancel", finishSheetDrag, { passive: true });

  return { element, setContext, setSection };
}

function enableFrameDrag(target, handleSelector) {
  target.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 700px)").matches
      || event.button !== 0
      || !event.target.closest(handleSelector)
      || event.target.closest("button")) return;

    const frame = target.matches(".app-frame--context")
      ? target
      : target.closest(".app-frame--context");
    const stage = frame?.parentElement;
    if (!frame || !stage) return;

    event.preventDefault();
    const frameRect = frame.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const pointerId = event.pointerId;
    const offsetX = event.clientX - frameRect.left;
    const offsetY = event.clientY - frameRect.top;
    let dragging = false;

    function getTopBounds() {
      const maxTop = Math.max(0, stage.clientHeight - frame.offsetHeight);
      const padding = Math.min(16, maxTop / 2);
      return { maxTop, padding };
    }

    function move(moveEvent) {
      if (moveEvent.pointerId !== pointerId) return;
      const deltaX = moveEvent.clientX - event.clientX;
      const deltaY = moveEvent.clientY - event.clientY;
      if (!dragging && Math.hypot(deltaX, deltaY) < 4) return;

      if (!dragging) {
        dragging = true;
        frame.style.right = "auto";
        frame.style.bottom = "auto";
        frame.classList.add("is-context-positioned", "is-context-dragging");
      }

      moveEvent.preventDefault();
      const maxLeft = Math.max(0, stage.clientWidth - frame.offsetWidth);
      const left = Math.max(0, Math.min(maxLeft, moveEvent.clientX - stageRect.left - offsetX));
      const { maxTop } = getTopBounds();
      const top = Math.max(0, Math.min(maxTop, moveEvent.clientY - stageRect.top - offsetY));
      frame.style.left = `${left}px`;
      frame.style.top = `${top}px`;
    }

    function end(endEvent) {
      if (endEvent.pointerId !== pointerId) return;
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      if (!dragging) return;

      const maxLeft = Math.max(0, stage.clientWidth - frame.offsetWidth);
      const draggedRect = frame.getBoundingClientRect();
      const currentStageRect = stage.getBoundingClientRect();
      const frameCenter = draggedRect.left + draggedRect.width / 2;
      const snapLeft = frameCenter < currentStageRect.left + currentStageRect.width / 2
        ? Math.min(16, maxLeft)
        : Math.max(0, maxLeft - 16);
      const { maxTop, padding } = getTopBounds();
      const top = Math.max(padding, Math.min(maxTop - padding, draggedRect.top - currentStageRect.top));
      frame.style.left = `${snapLeft}px`;
      frame.style.top = `${top}px`;
      frame.classList.remove("is-context-dragging");
    }

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
  });
}

function buildContext(context, dataUrl) {
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
  const close = createControlButton("close", "Close context");
  close.dataset.contextClose = "true";
  controls.append(share, close);
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

  const zones = createPageList({
    label: `${context.title} context`,
    sections: context.sections,
  }, dataUrl);
  zones.classList.add("context-pane__zones");
  content.append(hero, actions, zones);
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

function resolveDraggedSheetState(progress, startState) {
  const releaseStep = 0.03;
  if (startState === "collapsed") {
    if (progress >= 0.52) return "expanded";
    return progress >= releaseStep ? "half" : "collapsed";
  }
  if (startState === "expanded") {
    if (progress <= 0.48) return "collapsed";
    return progress <= 1 - releaseStep ? "half" : "expanded";
  }
  if (progress >= 0.5 + releaseStep) return "expanded";
  if (progress <= 0.5 - releaseStep) return "collapsed";
  return "half";
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
