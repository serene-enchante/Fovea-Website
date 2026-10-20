import { createMaterialIcon } from "./material-icon.js";
import appStateMachine from "../state/app-state.js";

let toolbarInstance = 0;

export function createToolbar(items = []) {
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  toolbar.dataset.open = "false";

  const panelId = `toolbar-panel-${++toolbarInstance}`;
  const menu = document.createElement("nav");
  menu.className = "toolbar__menu";
  menu.setAttribute("aria-label", "Toolbar menu");

  const panel = document.createElement("div");
  panel.className = "toolbar__panel";
  panel.id = panelId;
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-hidden", "true");
  panel.inert = true;

  const panelInner = document.createElement("div");
  panelInner.className = "toolbar__panel-inner";
  panel.append(panelInner);

  let pinnedItem = null;
  let hoveredItem = null;
  let renderedItem = null;
  let hoverSuppressed = false;
  let hoverUnlockTimer = null;
  const menuButtons = [];

  function renderMenu(activeItem = hoveredItem || pinnedItem) {
    const isOpen = Boolean(activeItem);
    toolbar.dataset.open = String(isOpen);
    panel.inert = !isOpen;
    panel.setAttribute("aria-hidden", String(!isOpen));
    const frame = toolbar.closest(".app-frame");
    if (frame) frame.dataset.toolbarOpen = String(isOpen);

    menuButtons.forEach(({ button, item }) => {
      const isActive = isOpen && item === activeItem;
      button.setAttribute("aria-expanded", String(isActive));
      button.classList.toggle("is-active", isActive);
    });

    if (isOpen && renderedItem !== activeItem) {
      panel.setAttribute("aria-label", `${activeItem.label} options`);
      panelInner.replaceChildren(createToolbarGroups(activeItem));
      renderedItem = activeItem;
    }
  }

  function suppressHoverDuringTransition() {
    hoverSuppressed = true;
    toolbar.dataset.hoverSuppressed = "true";
    window.clearTimeout(hoverUnlockTimer);
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 50 : 500;
    hoverUnlockTimer = window.setTimeout(() => {
      hoverSuppressed = false;
      toolbar.dataset.hoverSuppressed = "false";
    }, delay);
  }

  function createViewToggle(item) {
    const button = document.createElement("button");
    button.className = "toolbar__menu-item toolbar__menu-item--view-toggle";
    button.type = "button";
    let icon = null;
    if (item.icon) {
      icon = createMaterialIcon(item.icon, "toolbar__icon toolbar__icon--directional");
      button.append(icon);
    }
    const label = document.createElement("span");
    label.className = "toolbar__menu-item-label";
    if (item.font === "serif") label.classList.add("toolbar__menu-item-label--serif");
    label.textContent = item.label;
    button.append(label);

    function updateViewState() {
      const isDirectoryView = appStateMachine.getState() === appStateMachine.states.DIRECTORY_VIEW;
      const destination = isDirectoryView ? "content" : "directory";
      if (icon) icon.dataset.direction = isDirectoryView ? "north-west" : "south-east";
      button.setAttribute("aria-pressed", String(isDirectoryView));
      button.setAttribute("aria-label", `${item.label}, switch to ${destination} view`);
    }

    button.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      if (hoverSuppressed) return;
      document.documentElement.dataset.viewPreview = "true";
    });
    button.addEventListener("pointerleave", () => {
      document.documentElement.removeAttribute("data-view-preview");
    });
    button.addEventListener("click", () => {
      suppressHoverDuringTransition();
      document.documentElement.removeAttribute("data-view-preview");
      pinnedItem = null;
      hoveredItem = null;
      renderMenu();
      const nextState = appStateMachine.getState() === appStateMachine.states.CONTENT_VIEW
        ? appStateMachine.states.DIRECTORY_VIEW
        : appStateMachine.states.CONTENT_VIEW;
      appStateMachine.transition(nextState);
    });
    updateViewState();
    appStateMachine.subscribe(updateViewState);
    return button;
  }

  items.forEach((item) => {
    if (item.action === "toggle-view") {
      menu.append(createViewToggle(item));
      return;
    }

    const button = document.createElement("button");
    button.className = "toolbar__menu-item";
    button.type = "button";
    if (item.icon) button.append(createMaterialIcon(item.icon, "toolbar__icon"));
    const label = document.createElement("span");
    label.className = "toolbar__menu-item-label";
    label.textContent = item.label;
    button.append(label);
    button.setAttribute("aria-controls", panelId);
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      if (hoverSuppressed) return;
      hoveredItem = item;
      renderMenu();
    });
    button.addEventListener("click", () => {
      pinnedItem = pinnedItem === item ? null : item;
      hoveredItem = null;
      renderMenu();
    });
    menuButtons.push({ button, item });
    menu.append(button);
  });

  toolbar.addEventListener("pointerleave", () => {
    hoveredItem = null;
    renderMenu();
  });
  toolbar.append(menu, panel);
  return toolbar;
}

function createToolbarGroups(item) {
  const groups = document.createElement("div");
  groups.className = "toolbar__groups";

  (item.groups || []).forEach((group) => {
    const section = document.createElement("section");
    section.className = "toolbar__group";

    const heading = document.createElement("h2");
    heading.className = "toolbar__group-title";
    heading.textContent = group.label;

    const options = document.createElement("div");
    options.className = "toolbar__options";
    options.setAttribute("role", "group");
    options.setAttribute("aria-label", group.label);

    (group.options || []).forEach((option) => {
      const button = document.createElement("button");
      button.className = "toolbar__option";
      button.type = "button";
      button.textContent = option.label;
      button.addEventListener("click", () => {
        groups.dispatchEvent(new CustomEvent("toolbaraction", {
          bubbles: true,
          detail: { menuId: item.id, optionId: option.id },
        }));
      });
      options.append(button);
    });

    section.append(heading, options);
    groups.append(section);
  });

  return groups;
}
