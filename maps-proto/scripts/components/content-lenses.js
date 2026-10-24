import { createMaterialIcon } from "./material-icon.js";

const LENSES = [
  { id: "image", label: "Image" },
  { id: "people", label: "People" },
  { id: "graph", label: "Graph" },
];

export function createContentLenses(onChange) {
  const root = document.createElement("div");
  root.className = "content-lenses";
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar content-lenses__toolbar frame-material--floating";
  toolbar.dataset.open = "false";

  const trigger = document.createElement("button");
  trigger.className = "toolbar__menu-item content-lenses__trigger";
  trigger.type = "button";
  trigger.setAttribute("aria-haspopup", "true");
  trigger.setAttribute("aria-expanded", "false");
  const lensIcon = createMaterialIcon("visibility", "toolbar__icon");
  const activeLabel = document.createElement("span");
  activeLabel.className = "content-lenses__active-label";
  const chevron = createMaterialIcon("expand_more", "toolbar__icon");
  trigger.append(lensIcon, activeLabel, chevron);

  const panel = document.createElement("div");
  panel.className = "content-lenses__panel frame-material--floating";
  panel.hidden = true;
  panel.setAttribute("role", "group");
  panel.setAttribute("aria-label", "Content views");
  const buttons = new Map();

  LENSES.forEach(({ id, label }) => {
    const button = document.createElement("button");
    button.className = "toolbar__option content-lenses__option";
    button.type = "button";
    button.dataset.lens = id;
    button.setAttribute("aria-pressed", "false");
    const optionLabel = document.createElement("span");
    optionLabel.className = "toolbar__option-label";
    optionLabel.textContent = label;
    const check = document.createElement("span");
    check.className = "content-lenses__check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = "✓";
    button.append(check, optionLabel);
    button.addEventListener("click", () => {
      onChange(id);
      closeMenu();
      trigger.focus();
    });
    buttons.set(id, button);
    panel.append(button);
  });

  const view = document.createElement("section");
  view.className = "content-lenses__view";
  view.setAttribute("aria-live", "polite");
  toolbar.append(trigger, panel);
  root.append(toolbar, view);

  function closeMenu() {
    toolbar.dataset.open = "false";
    trigger.setAttribute("aria-expanded", "false");
    panel.hidden = true;
  }

  trigger.addEventListener("click", () => {
    const isOpen = toolbar.dataset.open !== "true";
    toolbar.dataset.open = String(isOpen);
    trigger.setAttribute("aria-expanded", String(isOpen));
    panel.hidden = !isOpen;
    if (isOpen) buttons.get(toolbar.dataset.lens)?.focus();
  });

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || toolbar.dataset.open !== "true") return;
    event.preventDefault();
    closeMenu();
    trigger.focus();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!root.contains(event.target)) closeMenu();
  });

  function setState({ lens, selection }) {
    const activeLens = LENSES.find(({ id }) => id === lens) || LENSES[0];
    toolbar.dataset.lens = activeLens.id;
    activeLabel.textContent = activeLens.label;
    buttons.forEach((button, id) => {
      button.setAttribute("aria-pressed", String(id === lens));
      button.classList.toggle("is-active", id === lens);
    });
    view.replaceChildren();

    if (lens === "image" && selection?.image) {
      view.hidden = true;
      return;
    }

    view.hidden = false;
    const heading = document.createElement("h1");
    heading.className = "content-lenses__heading";
    heading.textContent = LENSES.find(({ id }) => id === lens)?.label || "Content";
    const subject = selection?.label || "this selection";
    view.append(heading);

    if (lens === "image") {
      const message = document.createElement("p");
      message.className = "content-lenses__empty-state";
      message.textContent = `No image is available for ${subject}.`;
      view.append(message);
      return;
    }

    if (lens === "people" && selection?.content?.people?.length) {
      const people = document.createElement("ul");
      people.className = "content-lenses__people";
      selection.content.people.forEach((person) => {
        const item = document.createElement("li");
        const name = document.createElement("strong");
        name.textContent = person.name || "Unnamed person";
        item.append(name);
        if (person.role) {
          const role = document.createElement("span");
          role.textContent = person.role;
          item.append(role);
        }
        people.append(item);
      });
      view.append(people);
      return;
    }

    if (lens === "graph" && selection?.content?.results?.length) {
      const results = document.createElement("ul");
      results.className = "content-lenses__results";
      const maximum = Math.max(1, ...selection.content.results.map(({ value }) => Number(value) || 0));
      selection.content.results.forEach((result) => {
        const item = document.createElement("li");
        const label = document.createElement("span");
        label.textContent = result.label || "Result";
        const bar = document.createElement("span");
        bar.className = "content-lenses__bar";
        bar.setAttribute("aria-hidden", "true");
        bar.style.width = `${Math.max(0, (Number(result.value) || 0) / maximum * 100)}%`;
        const value = document.createElement("strong");
        value.textContent = String(result.value ?? "");
        item.append(label, bar, value);
        results.append(item);
      });
      view.append(results);
      return;
    }

    const message = document.createElement("p");
    message.className = "content-lenses__empty-state";
    message.textContent = lens === "people"
      ? `Personnel directory data is not available for ${subject}.`
      : `CBC results data is not available for ${subject}.`;
    view.append(message);
  }

  return { element: root, setState };
}
