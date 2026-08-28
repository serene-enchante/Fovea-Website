/**
 * settings.js
 * Handles settings page interactions, light/dark mode switch, and corner transitions.
 */

export function initSettingsPage() {
    const themeSelect = document.getElementById("theme-select");

    if (themeSelect) {
        // Read stored theme preference (default to dark)
        const storedTheme = localStorage.getItem("fovea-theme") || "dark";
        themeSelect.value = storedTheme;

        themeSelect.addEventListener("change", () => {
            const selectedTheme = themeSelect.value;
            localStorage.setItem("fovea-theme", selectedTheme);

            const labels = {
                dark: "Dark theme active",
                light: "Light theme selected (active theme is dark)",
                auto: "Auto system theme selected (active theme is dark)"
            };

            showToast(labels[selectedTheme] || `${selectedTheme} theme selected`);
        });
    }

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
