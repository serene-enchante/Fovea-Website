export function createMaterialIcon(name, className = "") {
  const icon = document.createElement("span");
  icon.className = ["material-symbols-rounded", className].filter(Boolean).join(" ");
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = name;
  return icon;
}
