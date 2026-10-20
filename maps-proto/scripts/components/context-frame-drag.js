export function enableContextFrameDrag(target, handleSelector) {
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
