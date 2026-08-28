/**
 * settings.js
 * Handles settings page interactions, light/dark mode switch, and corner transitions.
 */

export function initSettingsPage() {
    setupThemeDropdownMenu();

    // Corner navigation fill-screen transition
    const cornerNavBtn = document.querySelector(".corner-nav-btn");
    if (cornerNavBtn) {
        cornerNavBtn.addEventListener("click", (e) => {
            e.preventDefault();
            if (document.body.className.includes("is-transitioning-")) return;

            const transitionClass = cornerNavBtn.classList.contains("corner-nav-right")
                ? "is-transitioning-right"
                : "is-transitioning-left";

            document.body.classList.add(transitionClass);

            setTimeout(() => {
                window.location.href = cornerNavBtn.getAttribute("href") || "../";
            }, 800);
        });
    }

    window.addEventListener("pageshow", () => {
        document.body.classList.remove("is-transitioning-left", "is-transitioning-right");
    });
}

function setupThemeDropdownMenu() {
    const toggleBtn = document.getElementById("settings-theme-toggle");
    const menuEl = document.getElementById("settings-theme-menu");
    const labelEl = document.getElementById("settings-theme-toggle-label");
    const iconWrapEl = document.getElementById("settings-theme-toggle-icon");
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

    const items = menuEl.querySelectorAll(".settings-view-menu__item");

    function applySelection(val, announce = true) {
        items.forEach(i => {
            const isActive = i.dataset.value === val;
            i.classList.toggle("is-active", isActive);
            const checkSvg = i.querySelector(".settings-view-menu__check");
            if (checkSvg) checkSvg.style.display = isActive ? "block" : "none";

            if (isActive) {
                // Update icon
                if (iconWrapEl) {
                    const itemIcon = i.querySelector(".settings-view-menu__icon");
                    if (itemIcon) {
                        iconWrapEl.innerHTML = itemIcon.outerHTML;
                    }
                }
                // Update label
                if (labelEl) {
                    const labelText = i.querySelector("span")?.textContent || val;
                    labelEl.textContent = labelText;
                }
            }
        });

        localStorage.setItem("fovea-theme", val);

        if (announce) {
            const labels = {
                dark: "Dark theme active",
                light: "Light theme selected (active theme is dark)",
                auto: "Auto system theme selected (active theme is dark)"
            };
            showToast(labels[val] || `${val} theme selected`);
        }
    }

    items.forEach(item => {
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            const val = item.dataset.value;
            applySelection(val, true);
            closeMenu();
        });
    });

    // Close when clicking anywhere outside
    document.addEventListener("click", (e) => {
        if (isOpen && !menuEl.contains(e.target) && !toggleBtn.contains(e.target)) {
            closeMenu();
        }
    });

    // Close on Escape
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && isOpen) {
            closeMenu();
            toggleBtn.focus();
        }
    });

    // Restore saved theme on load
    const storedTheme = localStorage.getItem("fovea-theme") || "dark";
    applySelection(storedTheme, false);
}

function showToast(message) {
    const toast = document.getElementById("toast-notification");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2400);
}

// Auto-initialize when DOM ready
if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initSettingsPage);
    } else {
        initSettingsPage();
    }
}
