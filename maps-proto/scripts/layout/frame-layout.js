import appStateMachine from "../state/app-state.js";

export function createAppFrame({ id, variant, layout = "standard", material = "plain", label, content }) {
  const template = document.getElementById("app-frame-template");
  const templateFrame = template?.content.firstElementChild;
  if (!templateFrame) {
    throw new Error("App frame template is missing or empty");
  }

  const frame = templateFrame.cloneNode(true);
  frame.id = id;
  frame.classList.add(`app-frame--${variant}`, `frame-layout--${layout}`);
  if (material) {
    frame.classList.add(`frame-material--${material}`);
  }
  frame.setAttribute("aria-label", label);
  frame.querySelector(".app-frame__content").append(content);
  return frame;
}

export function initializeFrameLayout() {
  const directoryFrames = document.querySelectorAll(
    ".app-frame--organization, .app-frame--directory, .app-frame--user",
  );
  function renderViewState({ state }) {
    const isDirectoryView = state === appStateMachine.states.DIRECTORY_VIEW;
    document.documentElement.dataset.view = state;

    directoryFrames.forEach((frame) => {
      frame.setAttribute("aria-hidden", String(!isDirectoryView));
      frame.inert = !isDirectoryView;
    });

  }

  appStateMachine.subscribe(renderViewState);
  renderViewState({ state: appStateMachine.getState() });

  function toggleView() {
    const nextState = appStateMachine.getState() === appStateMachine.states.CONTENT_VIEW
      ? appStateMachine.states.DIRECTORY_VIEW
      : appStateMachine.states.CONTENT_VIEW;
    appStateMachine.transition(nextState);
  }

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isEditing = target instanceof HTMLElement && (
      target.isContentEditable || target.matches("input, textarea, select")
    );

    if (
      event.key.toLowerCase() !== "f" || event.repeat || event.altKey || event.ctrlKey ||
      event.metaKey || isEditing
    ) return;

    event.preventDefault();
    toggleView();
  });

  let swipeStart = null;
  const root = document.documentElement;
  function clearDragStyles() {
    root.style.removeProperty("--content-drag-offset");
    root.style.removeProperty("--view-drag-progress");
    root.style.removeProperty("--directory-drag-offset");
  }

  function cancelDrag() {
    swipeStart = null;
    root.removeAttribute("data-view-dragging");
    requestAnimationFrame(clearDragStyles);
  }

  function canTileListScrollLeft(tileList) {
    return tileList && tileList.scrollLeft + tileList.clientWidth < tileList.scrollWidth - 1;
  }

  document.addEventListener("touchstart", (event) => {
    if (
      event.touches.length !== 1 ||
      !window.matchMedia("(max-width: 700px)").matches
    ) {
      if (swipeStart?.dragging) cancelDrag();
      else swipeStart = null;
      return;
    }

    const target = event.target;
    let surface = null;
    if (appStateMachine.getState() === appStateMachine.states.DIRECTORY_VIEW) {
      surface = "directory";
    } else if (target instanceof Element && target.closest(".app-frame--context")) {
      surface = "content";
    }

    if (!surface) {
      swipeStart = null;
      return;
    }

    const touch = event.changedTouches[0];
    swipeStart = {
      x: touch.clientX,
      y: touch.clientY,
      identifier: touch.identifier,
      state: appStateMachine.getState(),
      target,
      startedAt: performance.now(),
      dragging: false,
      tileList: target instanceof Element
        ? target.closest('.page-list__section[data-view="tiles"] .page-list__items')
        : null,
    };
  }, { passive: true });

  document.addEventListener("touchmove", (event) => {
    if (!swipeStart) return;
    const touch = Array.from(event.changedTouches)
      .find(({ identifier }) => identifier === swipeStart.identifier);
    if (!touch) return;

    const deltaX = touch.clientX - swipeStart.x;
    const deltaY = touch.clientY - swipeStart.y;
    if (Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX) * 1.25) {
      if (swipeStart.dragging) cancelDrag();
      else swipeStart = null;
      return;
    }
    if (Math.abs(deltaX) < 8) return;

    const isOpening = swipeStart.state === appStateMachine.states.CONTENT_VIEW;
    if (isOpening && deltaX > 0 && swipeStart.tileList) return;
    if ((isOpening && deltaX < 0) || (!isOpening && deltaX > 0)) {
      if (swipeStart.dragging) {
        root.style.setProperty("--content-drag-offset", "0px");
        root.style.setProperty("--view-drag-progress", isOpening ? "0" : "1");
        root.style.setProperty("--directory-drag-offset", "-12px");
        if (event.cancelable) event.preventDefault();
      }
      return;
    }
    if (!isOpening && deltaX < 0 && canTileListScrollLeft(swipeStart.tileList)) return;

    const progress = isOpening
      ? Math.min(1, deltaX / window.innerWidth)
      : Math.max(0, 1 + deltaX / window.innerWidth);
    root.setAttribute("data-view-dragging", "true");
    root.style.setProperty("--content-drag-offset", `${deltaX}px`);
    root.style.setProperty("--view-drag-progress", String(progress));
    root.style.setProperty("--directory-drag-offset", `${-12 * (1 - progress)}px`);
    swipeStart.dragging = true;
    if (event.cancelable) event.preventDefault();
  }, { passive: false });

  document.addEventListener("touchend", (event) => {
    if (!swipeStart) return;
    const touch = Array.from(event.changedTouches)
      .find(({ identifier }) => identifier === swipeStart.identifier);
    if (!touch) return;

    const start = swipeStart;
    swipeStart = null;
    if (!start.dragging) return;

    const deltaX = touch.clientX - start.x;
    const elapsed = Math.max(1, performance.now() - start.startedAt);
    const velocity = Math.abs(deltaX) / elapsed;
    const isOpening = start.state === appStateMachine.states.CONTENT_VIEW;
    const correctDirection = isOpening ? deltaX > 0 : deltaX < 0;
    const finishDistance = Math.min(96, window.innerWidth * 0.22);
    const shouldFinish = correctDirection && (
      Math.abs(deltaX) >= finishDistance || (Math.abs(deltaX) > 56 && velocity > 0.55)
    );

    if (!shouldFinish) {
      root.removeAttribute("data-view-dragging");
      requestAnimationFrame(clearDragStyles);
      return;
    }

    const nextState = isOpening
      ? appStateMachine.states.DIRECTORY_VIEW
      : appStateMachine.states.CONTENT_VIEW;
    const finalOffset = isOpening
      ? deltaX - window.innerWidth
      : window.innerWidth + deltaX;
    root.style.setProperty("--content-drag-offset", `${finalOffset}px`);
    appStateMachine.transition(nextState);
    root.removeAttribute("data-view-dragging");
    requestAnimationFrame(clearDragStyles);
    if (event.cancelable) event.preventDefault();
  }, { passive: false });

  document.addEventListener("touchcancel", () => {
    if (swipeStart?.dragging) cancelDrag();
    else swipeStart = null;
  }, { passive: true });
}
