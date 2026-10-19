export function setupViewToggleMenu() {
    const toggleBtn = document.getElementById("header-view-toggle");
    const menuEl = document.getElementById("header-view-menu");
    const labelEl = document.getElementById("header-view-toggle-label");
    const iconWrapEl = document.getElementById("header-view-toggle-icon");
    if (!toggleBtn || !menuEl) return;

    let isOpen = false;

    function openMenu() {
        isOpen = true;
        menuEl.setAttribute("aria-hidden", "false");
        toggleBtn.setAttribute("aria-expanded", "true");
    }

    function closeMenu() {
        isOpen = false;
        menuEl.setAttribute("aria-hidden", "true");
        toggleBtn.setAttribute("aria-expanded", "false");
    }

    toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    const items = menuEl.querySelectorAll(".header-view-menu__item");
    items.forEach(item => {
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            const val = item.dataset.value;
            
            // Update active state inside popup
            items.forEach(i => {
                const isActive = i.dataset.value === val;
                i.classList.toggle("is-active", isActive);
                const checkSvg = i.querySelector(".header-view-menu__check");
                if (checkSvg) checkSvg.style.display = isActive ? "block" : "none";
            });

            // Update toggle button icon
            if (iconWrapEl) {
                const itemIcon = item.querySelector(".header-view-menu__icon");
                if (itemIcon) {
                    iconWrapEl.innerHTML = itemIcon.outerHTML;
                    const clonedSvg = iconWrapEl.querySelector("svg");
                    if (clonedSvg) {
                        clonedSvg.setAttribute("width", "12");
                        clonedSvg.setAttribute("height", "12");
                    }
                }
            }

            // Update toggle label text
            if (labelEl) {
                const labelMap = {
                    auto: "Auto",
                    map: "Map",
                    graph: "Graph",
                    table: "Table",
                    image: "Image",
                    people: "People",
                    network: "Network"
                };
                labelEl.textContent = labelMap[val] || (val.charAt(0).toUpperCase() + val.slice(1));
            }

            // Close popup
            closeMenu();
        });
    });

    // Close on click outside
    document.addEventListener("click", (e) => {
        if (isOpen && !toggleBtn.contains(e.target) && !menuEl.contains(e.target)) {
            closeMenu();
        }
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
        if (isOpen && e.key === "Escape") {
            closeMenu();
        }
    });
}
