/**
 * mobile-bottom-nav.js
 * Shared mobile bottom navigation — inject HTML, wire tabs, animate capsule, handle scroll.
 *
 * Usage (add as the last element inside <body>):
 *   <script src="/scripts/mobile-bottom-nav.js?v=1"
 *           data-active-page="home|info|maps"
 *           data-root="./">
 *   </script>
 *
 *   Add data-no-scroll-listener on maps page (maps-tile.js manages scroll there).
 */
(function () {
    const scriptEl = document.currentScript;
    const activePage = scriptEl.dataset.activePage || "home";
    const root = scriptEl.dataset.root || "./";
    const noScrollListener = scriptEl.hasAttribute("data-no-scroll-listener");

    const isHome = activePage === "home";
    const isMaps = activePage === "maps";

    // ─── 1. Build and inject HTML ──────────────────────────────────────────────

    const exploreHref  = isMaps ? "#explore"  : `${root}maps/`;
    const toolsHref    = isMaps ? "#tools"    : `${root}maps/#tools`;
    const settingsHref = isMaps ? "#settings" : `${root}maps/#settings`;
    const homeHref     = isHome ? "#"         : `${root}`;

    const iconStyle = (name) =>
        `-webkit-mask-image: url('${root}svg/${name}'); mask-image: url('${root}svg/${name}');`;

    const tabs = [
        { id: "mobile-nav-tab-explore",  label: "Explore",  icon: "binoculars-1-svgrepo-com.svg",  href: exploreHref,  active: isMaps },
        { id: "mobile-nav-tab-tools",    label: "Tools",    icon: "hammer-tool-svgrepo-com.svg",   href: toolsHref,    active: false  },
        { id: "mobile-nav-tab-settings", label: "Settings", icon: "settings-svgrepo-com.svg",      href: settingsHref, active: false  },
    ];

    const baseItems = tabs.map(t =>
        `<a id="${t.id}" class="mobile-bottom-nav-item${t.active ? " is-active" : ""}" href="${t.href}" aria-label="${t.label}" title="${t.label}"><span class="mobile-bottom-nav-item__icon" style="${iconStyle(t.icon)}"></span></a>`
    ).join("\n");

    const overlayItems = tabs.map(t =>
        `<div class="mobile-bottom-nav-item"><span class="mobile-bottom-nav-item__icon" style="${iconStyle(t.icon)}"></span></div>`
    ).join("\n");

    const navHTML = `
    <div class="mobile-bottom-nav-container">
        <nav class="mobile-bottom-nav" aria-label="Mobile navigation">
            <div class="mobile-bottom-nav__capsule"></div>
            <div class="mobile-bottom-nav__base">
                ${baseItems}
            </div>
            <div class="mobile-bottom-nav__overlay" aria-hidden="true">
                ${overlayItems}
            </div>
        </nav>
        <a id="mobile-nav-tab-home" class="mobile-bottom-nav-home${isHome ? " is-active" : ""}" href="${homeHref}" aria-label="Home" title="Home">
            <span class="mobile-bottom-nav-home__icon" style="${iconStyle("home-svgrepo-com.svg")}"></span>
        </a>
    </div>`;

    document.body.insertAdjacentHTML("beforeend", navHTML);

    // ─── 2. Wire tab click handlers ────────────────────────────────────────────

    function showToast(featureName) {
        const toast = document.getElementById("toast-notification");
        if (!toast) return;
        toast.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:#00d5a4;flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span><strong>${featureName}</strong> will be available soon</span>`;
        toast.classList.add("is-visible");
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
    }

    document.addEventListener("DOMContentLoaded", function () {
        const homeTab = document.getElementById("mobile-nav-tab-home");
        if (homeTab) {
            homeTab.addEventListener("click", (e) => {
                if (isHome) {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                }
                // Else: let href navigate naturally to root
            });
        }

        const exploreTab = document.getElementById("mobile-nav-tab-explore");
        if (exploreTab && !isMaps) {
            exploreTab.addEventListener("click", (e) => {
                e.preventDefault();
                window.location.href = `${root}maps/`;
            });
        }

        const toolsTab = document.getElementById("mobile-nav-tab-tools");
        if (toolsTab && !isMaps) {
            toolsTab.addEventListener("click", (e) => {
                e.preventDefault();
                showToast("Tools");
            });
        }

        const settingsTab = document.getElementById("mobile-nav-tab-settings");
        if (settingsTab && !isMaps) {
            settingsTab.addEventListener("click", (e) => {
                e.preventDefault();
                showToast("Settings");
            });
        }

        // ─── 3. Capsule animation (skip on maps — maps-tile.js owns this) ───────
        if (!isMaps) {
            initMobileBottomNavAnimation();

            if (!noScrollListener) {
                const bottomNav = document.querySelector(".mobile-bottom-nav");
                window.addEventListener("scroll", () => {
                    if (window.innerWidth > 768) return;
                    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                    if (bottomNav) bottomNav.classList.toggle("is-hidden", scrollTop > 12);
                }, { passive: true });
            }
        }
    });

    // ─── 4. Animation engine ──────────────────────────────────────────────────

    function initMobileBottomNavAnimation() {
        const nav = document.querySelector(".mobile-bottom-nav");
        if (!nav) return;

        const navBaseItems = nav.querySelectorAll(".mobile-bottom-nav__base .mobile-bottom-nav-item");
        const capsule      = nav.querySelector(".mobile-bottom-nav__capsule");
        const overlay      = nav.querySelector(".mobile-bottom-nav__overlay");
        if (!navBaseItems.length || !capsule || !overlay) return;

        let activeIndex = -1;
        navBaseItems.forEach((item, index) => {
            if (item.classList.contains("is-active")) activeIndex = index;
        });

        const prevIndexStr = sessionStorage.getItem("prev-nav-index");
        const prevIndex    = prevIndexStr !== null ? parseInt(prevIndexStr, 10) : -1;
        sessionStorage.removeItem("prev-nav-index");

        function updateCapsule(targetEl, immediate) {
            if (!targetEl) return;
            if (immediate) {
                capsule.style.transition = "none";
                overlay.style.transition = "none";
            } else {
                capsule.style.transition = "transform 0.35s cubic-bezier(0.16,1,0.3,1), width 0.35s cubic-bezier(0.16,1,0.3,1), height 0.35s cubic-bezier(0.16,1,0.3,1)";
                overlay.style.transition = "clip-path 0.35s cubic-bezier(0.16,1,0.3,1), -webkit-clip-path 0.35s cubic-bezier(0.16,1,0.3,1)";
            }
            const navRect    = nav.getBoundingClientRect();
            const targetRect = targetEl.getBoundingClientRect();
            const left   = targetRect.left - navRect.left;
            const top    = targetRect.top  - navRect.top;
            const width  = targetRect.width;
            const height = targetRect.height;

            capsule.style.transform = `translate(${left}px, ${top}px)`;
            capsule.style.width     = `${width}px`;
            capsule.style.height    = `${height}px`;

            nav.style.setProperty("--active-x", `${left + width  / 2}px`);
            nav.style.setProperty("--active-y", `${top  + height / 2}px`);

            const clipVal = `inset(${top}px ${navRect.width - (left + width)}px ${navRect.height - (top + height)}px ${left}px round 17px)`;
            overlay.style.clipPath       = clipVal;
            overlay.style.webkitClipPath = clipVal;

            if (immediate) {
                capsule.offsetHeight;
                capsule.style.transition = "";
                overlay.style.transition = "";
            }
        }

        if (prevIndex !== -1 && prevIndex !== activeIndex && navBaseItems[prevIndex]) {
            updateCapsule(navBaseItems[prevIndex], true);
            requestAnimationFrame(() => updateCapsule(navBaseItems[activeIndex]));
        } else if (activeIndex !== -1) {
            updateCapsule(navBaseItems[activeIndex], true);
        }

        let isDragging  = false;
        let hasMoved    = false;
        let startX      = 0;
        let initialLeft = 0;
        let currentLeft = 0;

        navBaseItems.forEach((item, index) => {
            item.addEventListener("click", (e) => {
                if (hasMoved) { e.preventDefault(); e.stopPropagation(); return; }
                sessionStorage.setItem("prev-nav-index", index);
                updateCapsule(item);
            });
        });

        nav.addEventListener("touchstart", (e) => {
            const touch       = e.touches[0];
            const capsuleRect = capsule.getBoundingClientRect();
            if (
                touch.clientX >= capsuleRect.left &&
                touch.clientX <= capsuleRect.right &&
                touch.clientY >= capsuleRect.top  &&
                touch.clientY <= capsuleRect.bottom
            ) {
                isDragging = true;
                hasMoved   = false;
                capsule.style.cursor = "grabbing";
                capsule.classList.add("is-dragging");
                startX = touch.clientX;
                const DOMMatrixClass = window.DOMMatrix || window.WebKitCSSMatrix;
                const matrix = new DOMMatrixClass(window.getComputedStyle(capsule).transform);
                initialLeft = matrix.m41;
                currentLeft = initialLeft;
                capsule.style.transition = "none";
                overlay.style.transition = "none";
            }
        }, { passive: true });

        window.addEventListener("touchmove", (e) => {
            if (!isDragging) return;
            const touch  = e.touches[0];
            const deltaX = touch.clientX - startX;
            if (Math.abs(deltaX) > 4) hasMoved = true;

            let newLeft       = initialLeft + deltaX;
            const navRect     = nav.getBoundingClientRect();
            const capsuleRect = capsule.getBoundingClientRect();
            const padding     = 4;
            newLeft = Math.max(padding, Math.min(newLeft, navRect.width - padding - capsuleRect.width));
            currentLeft = newLeft;

            const top    = 4;
            const width  = capsuleRect.width;
            const height = capsuleRect.height;
            capsule.style.transform = `translate(${newLeft}px, ${top}px)`;
            nav.style.setProperty("--active-x", `${newLeft + width  / 2}px`);
            nav.style.setProperty("--active-y", `${top    + height / 2}px`);
            const clipVal = `inset(${top}px ${navRect.width - (newLeft + width)}px ${navRect.height - (top + height)}px ${newLeft}px round 17px)`;
            overlay.style.clipPath       = clipVal;
            overlay.style.webkitClipPath = clipVal;
        }, { passive: true });

        window.addEventListener("touchend", () => {
            if (!isDragging) return;
            isDragging = false;
            capsule.style.cursor = "grab";
            capsule.classList.remove("is-dragging");

            capsule.style.transition = "transform 0.35s cubic-bezier(0.16,1,0.3,1), width 0.35s cubic-bezier(0.16,1,0.3,1), height 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.25s ease";
            overlay.style.transition  = "clip-path 0.35s cubic-bezier(0.16,1,0.3,1), -webkit-clip-path 0.35s cubic-bezier(0.16,1,0.3,1)";

            const navRect       = nav.getBoundingClientRect();
            const capsuleRect   = capsule.getBoundingClientRect();
            const capsuleCenter = currentLeft + capsuleRect.width / 2;

            let closestItem  = null;
            let closestDist  = Infinity;
            let closestIndex = -1;

            navBaseItems.forEach((item, index) => {
                const itemRect   = item.getBoundingClientRect();
                const itemCenter = (itemRect.left - navRect.left) + itemRect.width / 2;
                const dist       = Math.abs(capsuleCenter - itemCenter);
                if (dist < closestDist) { closestDist = dist; closestItem = item; closestIndex = index; }
            });

            if (closestItem) {
                sessionStorage.setItem("prev-nav-index", closestIndex);
                const itemRect = closestItem.getBoundingClientRect();
                const left   = itemRect.left - navRect.left;
                const top    = itemRect.top  - navRect.top;
                const width  = itemRect.width;
                const height = itemRect.height;
                capsule.style.transform = `translate(${left}px, ${top}px)`;
                capsule.style.width     = `${width}px`;
                capsule.style.height    = `${height}px`;
                nav.style.setProperty("--active-x", `${left + width  / 2}px`);
                nav.style.setProperty("--active-y", `${top  + height / 2}px`);
                const clipVal = `inset(${top}px ${navRect.width - (left + width)}px ${navRect.height - (top + height)}px ${left}px round 17px)`;
                overlay.style.clipPath       = clipVal;
                overlay.style.webkitClipPath = clipVal;
                if (hasMoved) closestItem.click();
            }

            setTimeout(() => { hasMoved = false; }, 50);
        });

        window.addEventListener("resize", () => {
            const activeTab = nav.querySelector(".mobile-bottom-nav__base .mobile-bottom-nav-item.is-active");
            if (activeTab) updateCapsule(activeTab, true);
        });
    }

    // Expose so maps-tile.js can call it after HTML is injected
    window.initMobileBottomNavAnimation = initMobileBottomNavAnimation;
})();
