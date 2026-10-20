const tileResizeObservers = new WeakMap();

export function createPageList({ label, title, sections }, dataUrl) {
  const navigation = document.createElement("nav");
  navigation.className = "page-list";
  navigation.setAttribute("aria-label", label);

  const directoryTitle = document.createElement("h1");
  directoryTitle.className = "page-list__title";
  directoryTitle.textContent = title;
  navigation.append(directoryTitle);

  sections.forEach(({ id, title, view = "list", items }) => {
    const section = document.createElement("section");
    section.className = "page-list__section";
    section.dataset.view = view;

    const heading = document.createElement("h2");
    heading.className = "page-list__heading";
    heading.id = `page-list-${id}`;
    heading.textContent = title;

    const list = document.createElement("ul");
    list.className = "page-list__items";
    if (view === "tiles") {
      list.tabIndex = 0;
      list.setAttribute("aria-label", `${title} items`);
    }

    items.forEach(({ id: itemId, label: itemLabel, icon, image, selected }) => {
      const item = document.createElement("li");
      const link = document.createElement("button");
      link.className = "page-list__item";
      link.type = "button";
      link.dataset.pageId = itemId;

      if (icon) {
        const pageIcon = document.createElement("span");
        pageIcon.className = "material-symbols-rounded page-list__icon";
        pageIcon.setAttribute("aria-hidden", "true");
        pageIcon.textContent = icon;
        link.append(pageIcon);
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
      link.append(label);
      if (selected) link.setAttribute("aria-current", "page");
      item.append(link);
      list.append(item);
    });

    section.setAttribute("aria-labelledby", heading.id);
    section.append(heading);

    if (view === "tiles") {
      const viewport = document.createElement("div");
      viewport.className = "page-list__tile-viewport";

      const leftFade = document.createElement("span");
      leftFade.className = "page-list__edge-fade page-list__edge-fade--left";
      leftFade.setAttribute("aria-hidden", "true");

      const rightFade = document.createElement("span");
      rightFade.className = "page-list__edge-fade page-list__edge-fade--right";
      rightFade.setAttribute("aria-hidden", "true");

      const previous = createScrollButton("left", title);
      const next = createScrollButton("right", title);
      viewport.append(list, leftFade, rightFade, previous, next);
      section.append(viewport);
    } else {
      section.append(list);
    }

    navigation.append(section);
  });

  return navigation;
}

function createScrollButton(direction, label) {
  const button = document.createElement("button");
  button.className = `page-list__scroll page-list__scroll--${direction}`;
  button.type = "button";
  button.setAttribute("aria-label", `Scroll ${label} ${direction}`);
  button.textContent = direction === "left" ? "‹" : "›";
  return button;
}

function initializeTileStrips(root) {
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
    previous.addEventListener("click", () => {
      list.scrollBy({ left: -list.clientWidth * 0.8, behavior });
    });
    next.addEventListener("click", () => {
      list.scrollBy({ left: list.clientWidth * 0.8, behavior });
    });

    if ("ResizeObserver" in window) {
      const resizeObserver = new ResizeObserver(updateEdges);
      resizeObserver.observe(list);
      tileResizeObservers.set(viewport, resizeObserver);
    } else {
      window.addEventListener("resize", updateEdges);
    }
    requestAnimationFrame(updateEdges);
  });
}

export async function loadPageList(target, source) {
  try {
    if (!source) throw new Error("Directory source is not configured");
    const dataUrl = new URL(source, document.baseURI);
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error(`Directory data request failed (${response.status})`);
    target.replaceChildren(createPageList(await response.json(), dataUrl));
    initializeTileStrips(target);
  } catch (error) {
    console.error("Unable to load directory data", error);
    target.textContent = "Pages unavailable";
  }
}
