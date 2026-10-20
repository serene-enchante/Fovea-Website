import { createMaterialIcon } from "./material-icon.js";

export function createOrganizationRail(organizations = [], actions = [], dataUrl) {
  const rail = document.createElement("nav");
  rail.className = "organization-rail";
  rail.setAttribute("aria-label", "Organization switcher");

  const organizationList = document.createElement("ul");
  organizationList.className = "organization-rail__items";
  organizationList.setAttribute("aria-label", "Organizations");

  organizations.forEach(({ id, label, image, selected }) => {
    const item = document.createElement("li");
    item.className = "organization-rail__item";
    if (selected) item.classList.add("organization-rail__item--selected");
    const button = document.createElement("button");
    button.className = "organization-rail__button organization-rail__circle organization-rail__organization";
    button.type = "button";
    button.dataset.organizationId = id;
    button.setAttribute("aria-label", label);
    if (selected) button.setAttribute("aria-current", "page");

    if (image) {
      const logo = document.createElement("img");
      logo.className = "organization-rail__logo";
      logo.src = new URL(image, dataUrl).href;
      logo.alt = "";
      logo.decoding = "async";
      button.append(logo);
    }

    item.append(button);
    organizationList.append(item);
  });
  rail.append(organizationList);

  if (actions.length) {
    const divider = document.createElement("span");
    divider.className = "organization-rail__divider";
    divider.setAttribute("aria-hidden", "true");

    const actionList = document.createElement("ul");
    actionList.className = "organization-rail__items organization-rail__actions";
    actionList.setAttribute("aria-label", "Organization actions");

    actions.forEach(({ id, label, icon }) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.className = "organization-rail__button organization-rail__circle organization-rail__action";
      button.type = "button";
      button.dataset.actionId = id;
      button.setAttribute("aria-label", label);

      button.append(createMaterialIcon(icon, "organization-rail__icon"));

      item.append(button);
      actionList.append(item);
    });

    rail.append(divider, actionList);
  }

  return rail;
}
