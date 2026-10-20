let paletteZIndex = 20;

export function createFloatingPalette(label, content, { x, y, onClose = () => {} }) {
  const palette = document.createElement("section");
  palette.className = "toolbar-palette frame-material--floating";
  palette.setAttribute("role", "dialog");
  palette.setAttribute("aria-label", `${label} palette`);
  palette.tabIndex = -1;
  palette.style.left = `${x - 40}px`;
  palette.style.top = `${y - 18}px`;

  const header = document.createElement("header");
  header.className = "toolbar-palette__header";

  const title = document.createElement("h2");
  title.className = "toolbar-palette__title";
  title.textContent = label;

  const close = document.createElement("button");
  close.className = "toolbar-palette__close";
  close.type = "button";
  close.setAttribute("aria-label", `Close ${label} palette`);
  close.textContent = "×";
  close.addEventListener("click", () => {
    onClose();
    palette.remove();
  });

  const body = document.createElement("div");
  body.className = "toolbar-palette__body";
  body.append(content);
  header.append(title, close);
  palette.append(header, body);
  document.body.append(palette);

  function placeAt(left, top) {
    const margin = 8;
    const rect = palette.getBoundingClientRect();
    palette.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin))}px`;
    palette.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin))}px`;
  }

  function beginWindowDrag(event) {
    if (event.button !== 0 || event.target.closest("button")) return;
    event.preventDefault();
    const pointerId = event.pointerId;
    paletteZIndex += 1;
    palette.style.zIndex = String(paletteZIndex);
    const start = palette.getBoundingClientRect();
    const offsetX = event.clientX - start.left;
    const offsetY = event.clientY - start.top;

    function move(moveEvent) {
      if (moveEvent.pointerId !== pointerId) return;
      placeAt(moveEvent.clientX - offsetX, moveEvent.clientY - offsetY);
    }

    function end(endEvent) {
      if (endEvent.pointerId !== pointerId) return;
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
    }

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
  }

  header.addEventListener("pointerdown", beginWindowDrag);
  palette.addEventListener("pointerdown", () => {
    paletteZIndex += 1;
    palette.style.zIndex = String(paletteZIndex);
  });
  placeAt(x - 40, y - 18);
  return palette;
}

export function focusFloatingPalette(palette) {
  paletteZIndex += 1;
  palette.style.zIndex = String(paletteZIndex);
  palette.focus({ preventScroll: true });
}

export function makePaletteHeadingDetachable(heading, onDragStateChange, onDetach) {
  let suppressClick = false;
  heading.addEventListener("click", (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
  }, true);

  heading.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.pointerType === "touch") return;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let detachedPalette = null;
    onDragStateChange(true);

    function move(moveEvent) {
      if (moveEvent.pointerId !== pointerId) return;
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      if (!detachedPalette && Math.hypot(deltaX, deltaY) > 28) {
        moveEvent.preventDefault();
        suppressClick = true;
        detachedPalette = onDetach(startX, startY);
      }
      if (detachedPalette) {
        const rect = detachedPalette.getBoundingClientRect();
        detachedPalette.style.left = `${Math.max(8, Math.min(moveEvent.clientX - 40, window.innerWidth - rect.width - 8))}px`;
        detachedPalette.style.top = `${Math.max(8, Math.min(moveEvent.clientY - 18, window.innerHeight - rect.height - 8))}px`;
      }
    }

    function end(endEvent) {
      if (endEvent.pointerId !== pointerId) return;
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      onDragStateChange(false);
      if (suppressClick) window.setTimeout(() => { suppressClick = false; }, 0);
    }

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
  });
}
