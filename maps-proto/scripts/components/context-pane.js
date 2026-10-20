import { createMaterialIcon } from "./material-icon.js";
import { createPageList, initializeTileStrips } from "./page-list.js";

export function createContextPane() {
  const element = document.createElement("div");
  element.className = "context-pane";
  element.setAttribute("aria-live", "polite");
  let renderVersion = 0;
  let disposeTileStrips = () => {};

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
    const content = buildContext(context, dataUrl);
    element.dispatchEvent(new CustomEvent("contextopen", { bubbles: true }));
    setSheetState("half");
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

  return { element, setContext };
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
  let logo;
  if (context.logo) {
    logo = document.createElement("img");
    logo.className = "context-pane__hero-logo";
    logo.src = new URL(context.logo, dataUrl).href;
    logo.alt = "";
    logo.decoding = "async";
  }
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
  if (logo) hero.append(logo);
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
