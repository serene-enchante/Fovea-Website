import { createMaterialIcon } from "./material-icon.js";
import { createContextContent } from "./context-pane.js";

export function createTabsFrame() {
  const element = document.createElement("aside");
  element.className = "tabs-frame";
  element.dataset.open = "false";

  const trigger = document.createElement("button");
  trigger.className = "tabs-frame__trigger";
  trigger.type = "button";
  trigger.setAttribute("aria-label", "Open tabs frame");
  trigger.setAttribute("aria-expanded", "false");
  trigger.append(createMaterialIcon("chevron_left", "tabs-frame__trigger-icon"));

  const panel = document.createElement("section");
  panel.className = "tabs-frame__panel";
  panel.setAttribute("aria-label", "Open tabs");
  panel.setAttribute("aria-hidden", "true");
  panel.inert = true;

  const cards = document.createElement("div");
  cards.className = "tabs-frame__cards";
  cards.addEventListener("wheel", (event) => {
    if (!event.deltaY) return;
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? cards.clientHeight
        : 1;
    cards.scrollTop += event.deltaY * unit;
    event.preventDefault();
  }, { passive: false });
  panel.append(cards);
  element.append(trigger, panel);

  let pinnedOpen = false;
  let closeTimer;
  let configuredItems = [];
  let itemsDataUrl = document.baseURI;
  let currentContext = null;
  let currentDataUrl = document.baseURI;
  let sourceFrame = null;
  let drawerHidContextFrame = false;

  function setOpen(open) {
    if (element.dataset.open === String(open)) return;
    if (open) {
      if (isContextFrameVisible()) hideContextFrame();
    }
    element.dataset.open = String(open);
    trigger.setAttribute("aria-expanded", String(open));
    trigger.setAttribute("aria-label", open ? "Close tabs frame" : "Open tabs frame");
    panel.setAttribute("aria-hidden", String(!open));
    panel.inert = !open;
    if (!open) restoreContextFrame();
  }

  element.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "mouse") return;
    clearTimeout(closeTimer);
    setOpen(true);
  });
  element.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "mouse" || pinnedOpen) return;
    closeTimer = window.setTimeout(() => setOpen(false), 420);
  });
  element.addEventListener("focusin", () => setOpen(true));
  element.addEventListener("focusout", (event) => {
    if (pinnedOpen || element.contains(event.relatedTarget)) return;
    setOpen(false);
  });
  trigger.addEventListener("click", () => {
    pinnedOpen = !pinnedOpen;
    setOpen(pinnedOpen);
  });

  function setItems(nextItems = [], dataUrl = document.baseURI) {
    itemsDataUrl = dataUrl;
    configuredItems = nextItems;
    renderCards();
  }

  function setCurrentContext(context, dataUrl = document.baseURI, frame = null) {
    currentContext = context;
    currentDataUrl = dataUrl;
    sourceFrame = frame;
    if (!context) drawerHidContextFrame = false;
    renderCards();
    if (context && element.dataset.open === "true") {
      requestAnimationFrame(() => {
        if (currentContext === context && element.dataset.open === "true") {
          hideContextFrame();
        }
      });
    }
  }

  function renderCards() {
    const sampleItems = configuredItems.filter((item) => item.id !== currentContext?.id);
    const currentCard = currentContext
      ? createContextCard(currentContext, currentDataUrl, true)
      : null;
    cards.replaceChildren(
      ...(currentCard ? [currentCard] : []),
      ...sampleItems.map((item) => createContextCard(item, itemsDataUrl)),
    );
  }

  function isContextFrameVisible() {
    if (!currentContext || !sourceFrame || sourceFrame.classList.contains("is-closed")) return false;
    const style = getComputedStyle(sourceFrame);
    const rect = sourceFrame.getBoundingClientRect();
    return style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
  }

  function hideContextFrame() {
    if (!currentContext || !sourceFrame || sourceFrame.classList.contains("is-closed")) return;
    sourceFrame.classList.add("is-closed");
    drawerHidContextFrame = true;
  }

  function restoreContextFrame() {
    if (!drawerHidContextFrame || !sourceFrame) return;
    sourceFrame.classList.remove("is-closed");
    drawerHidContextFrame = false;
  }

  return { element, setItems, setCurrentContext };
}

function createContextCard(item, dataUrl, isCurrent = false) {
  const frame = document.createElement("article");
  frame.className = "app-frame app-frame--context frame-material--floating tabs-frame__card";
  frame.setAttribute("aria-label", item.title);
  if (isCurrent) frame.dataset.currentContext = "true";

  const content = document.createElement("div");
  content.className = "app-frame__content";
  const pane = document.createElement("div");
  pane.className = "context-pane";
  pane.append(createContextContent({
    ...item,
    imageAlt: item.imageAlt || "",
    actions: item.actions || [],
    sections: [],
  }, dataUrl, { includeSections: false }));
  content.append(pane);
  frame.append(content);
  return frame;
}
