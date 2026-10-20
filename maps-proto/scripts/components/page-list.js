import { createMaterialIcon } from "./material-icon.js";

export function createPageList({ label, title, sections }, dataUrl) {
  const navigation = document.createElement("nav");
  navigation.className = "page-list";
  navigation.setAttribute("aria-label", label);

  if (title) {
    const directoryTitle = document.createElement("h1");
    directoryTitle.className = "page-list__title";
    directoryTitle.textContent = title;
    navigation.append(directoryTitle);
  }

  sections.forEach(({ id, title, view = "list", items, selectable = false, expandable = true }) => {
    const section = document.createElement("section");
    section.className = "page-list__section";
    section.dataset.view = view;

    const heading = document.createElement("h2");
    heading.className = "page-list__heading";
    heading.id = `page-list-${id}`;
    if (expandable) {
      const headingButton = document.createElement("button");
      headingButton.className = "page-list__heading-button";
      headingButton.type = "button";
      headingButton.dataset.expandSection = id;
      const headingLabel = document.createElement("span");
      headingLabel.textContent = title;
      headingButton.append(headingLabel, createMaterialIcon("chevron_right", "page-list__heading-arrow"));
      heading.append(headingButton);
    } else {
      heading.textContent = title;
    }

    const list = document.createElement("ul");
    list.className = "page-list__items";
    if (selectable) list.classList.add("page-list__items--selectable");
    if (view === "tiles") {
      list.tabIndex = 0;
      list.setAttribute("aria-label", `${title} items`);
    }

    items.forEach(({ id: itemId, label: itemLabel, icon, image, downloadFormat, selected, currentTab }) => {
      const item = document.createElement("li");
      const link = document.createElement("button");
      link.className = "page-list__item";
      link.type = "button";
      link.dataset.pageId = itemId;
      if (downloadFormat) link.dataset.downloadFormat = downloadFormat;

      if (icon) {
        link.append(createMaterialIcon(icon, "page-list__icon"));
      }

      if (image) {
        const thumbnail = document.createElement("img");
        thumbnail.className = "page-list__thumbnail";
        thumbnail.src = new URL(image, dataUrl).href;
        thumbnail.alt = "";
        thumbnail.loading = "lazy";
        link.append(thumbnail);
      }

      const label = document.createElement("span");
      label.className = "page-list__label";
      label.textContent = itemLabel;
      let tabLabel = null;
      if (currentTab) {
        label.textContent = "";
        const pageName = document.createElement("span");
        pageName.className = "page-list__page-name";
        pageName.textContent = itemLabel;
        tabLabel = document.createElement("span");
        tabLabel.className = "page-list__tab";
        const separator = document.createElement("span");
        separator.className = "page-list__separator";
        separator.textContent = "·";
        const tabName = document.createElement("span");
        tabName.className = "page-list__tab-name";
        tabName.textContent = currentTab;
        tabLabel.hidden = !selected;
        tabLabel.append(separator, tabName);
        label.append(pageName, tabLabel);
      }
      link.append(label);
      if (selected) link.setAttribute("aria-current", "page");
      item.append(link);
      list.append(item);
    });

    if (selectable) {
      const highlight = document.createElement("span");
      highlight.className = "page-list__selection-highlight";
      highlight.setAttribute("aria-hidden", "true");
      highlight.hidden = true;
      list.append(highlight);
    }

    section.setAttribute("aria-labelledby", heading.id);
    section.append(heading);

    if (view === "tiles") {
      const viewport = document.createElement("div");
      viewport.className = "page-list__tile-viewport";

      const previous = createScrollButton("left", title);
      const next = createScrollButton("right", title);
      viewport.append(list, previous, next);
      section.append(viewport);
    } else {
      section.append(list);
    }

    navigation.append(section);
  });

  navigation.addEventListener("click", (event) => {
    const button = event.target.closest("[data-expand-section]");
    if (!button || !navigation.contains(button)) return;
    const section = sections.find(({ id }) => id === button.dataset.expandSection);
    if (!section) return;
    navigation.dispatchEvent(new CustomEvent("sectionexpand", {
      bubbles: true,
      detail: { section, dataUrl },
    }));
  });

  return navigation;
}

function createScrollButton(direction, label) {
  const button = document.createElement("button");
  button.className = `page-list__scroll page-list__scroll--${direction}`;
  button.type = "button";
  button.setAttribute("aria-label", `Scroll ${label} ${direction}`);
  button.append(createMaterialIcon(direction === "left" ? "chevron_left" : "chevron_right"));
  return button;
}

export function initializeTileStrips(root) {
  const cleanups = [];

  root.querySelectorAll(".page-list__tile-viewport").forEach((viewport) => {
    const list = viewport.querySelector(".page-list__items");
    const previous = viewport.querySelector(".page-list__scroll--left");
    const next = viewport.querySelector(".page-list__scroll--right");

    function updateEdges() {
      const hasOverflow = list.scrollWidth > list.clientWidth + 1;
      const hasLeft = list.scrollLeft > 1;
      const hasRight = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
      viewport.classList.toggle("has-overflow-left", hasOverflow && hasLeft);
      viewport.classList.toggle("has-overflow-right", hasOverflow && hasRight);
      previous.disabled = !hasLeft;
      next.disabled = !hasRight;
    }

    list.addEventListener("scroll", updateEdges, { passive: true });
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
    const scrollPrevious = () => {
      list.scrollBy({ left: -list.clientWidth * 0.8, behavior });
    };
    const scrollNext = () => {
      list.scrollBy({ left: list.clientWidth * 0.8, behavior });
    };
    previous.addEventListener("click", scrollPrevious);
    next.addEventListener("click", scrollNext);

    let resizeObserver;
    const updateOnResize = () => updateEdges();
    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(updateEdges);
      resizeObserver.observe(list);
    } else {
      window.addEventListener("resize", updateOnResize);
    }
    requestAnimationFrame(updateEdges);

    cleanups.push(() => {
      list.removeEventListener("scroll", updateEdges);
      previous.removeEventListener("click", scrollPrevious);
      next.removeEventListener("click", scrollNext);
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener("resize", updateOnResize);
    });
  });

  return () => cleanups.forEach((cleanup) => cleanup());
}

export function initializePageSelection(root) {
  const cleanups = [];

  root.querySelectorAll(".page-list__items--selectable").forEach((list) => {
    const highlight = list.querySelector(".page-list__selection-highlight");

    function moveHighlight(button, animate = true) {
      if (!button || !highlight) return;
      const item = button.closest("li");
      if (!item) return;

      if (!animate) highlight.style.transition = "none";
      highlight.hidden = false;
      highlight.style.height = `${button.offsetHeight}px`;
      highlight.style.transform = `translateY(${item.offsetTop}px)`;
      if (!animate) {
        requestAnimationFrame(() => highlight.style.removeProperty("transition"));
      }
    }

    const selected = list.querySelector('.page-list__item[aria-current="page"]');
    moveHighlight(selected, false);

    const handleClick = (event) => {
      const button = event.target.closest(".page-list__item");
      if (!button || !list.contains(button)) return;

      list.querySelectorAll('.page-list__item[aria-current="page"]').forEach((current) => {
        current.removeAttribute("aria-current");
        const tab = current.querySelector(".page-list__tab");
        if (tab) tab.hidden = true;
      });
      button.setAttribute("aria-current", "page");
      const tab = button.querySelector(".page-list__tab");
      if (tab) tab.hidden = false;
      moveHighlight(button);
    };
    list.addEventListener("click", handleClick);

    let observer;
    if ("ResizeObserver" in window) {
      observer = new ResizeObserver(updateHighlight);
      observer.observe(list);
    } else {
      window.addEventListener("resize", updateHighlight);
    }

    function updateHighlight() {
      moveHighlight(list.querySelector('.page-list__item[aria-current="page"]'), false);
    }

    cleanups.push(() => {
      list.removeEventListener("click", handleClick);
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", updateHighlight);
    });
  });

  return () => cleanups.forEach((cleanup) => cleanup());
}

export function updatePageTabNames(root, title) {
  root.querySelectorAll(".page-list__tab-name").forEach((tabName) => {
    tabName.textContent = title;
  });
}
