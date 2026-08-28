/**
 * settings.js
 * Handles settings page interactions, light/dark mode switch, and corner transitions.
 */

export function initSettingsPage() {
    const themeSwitch = document.getElementById("theme-toggle-switch");
    const darkIcon = themeSwitch?.querySelector(".toggle-switch__icon--dark");
    const lightIcon = themeSwitch?.querySelector(".toggle-switch__icon--light");

    if (themeSwitch) {
        // Read stored theme preference (default to dark)
        const isLightMode = localStorage.getItem("fovea-theme") === "light";
        updateSwitchUI(isLightMode);

        themeSwitch.addEventListener("click", () => {
            const currentlyActive = themeSwitch.classList.contains("is-active"); // is-active means Dark Mode active
            const nextIsLight = currentlyActive; // if currently dark, toggle to light

            localStorage.setItem("fovea-theme", nextIsLight ? "light" : "dark");
            updateSwitchUI(nextIsLight);

            showToast(nextIsLight ? "Light mode selected (active theme is dark)" : "Dark mode active");
        });
    }

    function updateSwitchUI(isLight) {
        if (!themeSwitch) return;
        if (isLight) {
            themeSwitch.classList.remove("is-active");
            themeSwitch.setAttribute("aria-checked", "false");
            if (darkIcon) darkIcon.style.display = "none";
            if (lightIcon) lightIcon.style.display = "block";
        } else {
            themeSwitch.classList.add("is-active");
            themeSwitch.setAttribute("aria-checked", "true");
            if (darkIcon) darkIcon.style.display = "block";
            if (lightIcon) lightIcon.style.display = "none";
        }
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
