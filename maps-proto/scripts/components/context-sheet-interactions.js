export function createContextSheetController(element) {
  function setState(state) {
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

  function step(direction) {
    const frame = element.closest(".app-frame--context");
    if (!frame || !window.matchMedia("(max-width: 700px)").matches) return;

    const state = frame.classList.contains("is-sheet-expanded")
      ? "expanded"
      : frame.classList.contains("is-sheet-collapsed")
        ? "collapsed"
        : "half";
    const states = ["collapsed", "half", "expanded"];
    const nextIndex = Math.max(0, Math.min(states.length - 1, states.indexOf(state) + direction));
    setState(states[nextIndex]);
  }

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
      step(1);
      wheelHandled = true;
    } else if (!wheelHandled && wheelDistance <= -36 && content?.scrollTop <= 1) {
      step(-1);
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
    if (!touchStart.dragging) return;

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
  }, { passive: false });

  function finishDrag() {
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
    setState(resolveDraggedState(progress, touchStart.startState));
    touchStart = null;
    dragFrame = null;
    pendingTop = null;
  }

  element.addEventListener("touchend", finishDrag, { passive: true });
  element.addEventListener("touchcancel", finishDrag, { passive: true });

  return { setState, step };
}

function resolveDraggedState(progress, startState) {
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
