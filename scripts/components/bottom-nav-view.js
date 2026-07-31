

export function setupMobileBottomNav() {
    const nav = document.querySelector(".mobile-bottom-nav");
    if (!nav) return;

    const baseItems = nav.querySelectorAll(".mobile-bottom-nav__base .mobile-bottom-nav-item");
    const exploreTab = document.getElementById("mobile-nav-tab-explore");
    const capsule = nav.querySelector(".mobile-bottom-nav__capsule");
    const overlay = nav.querySelector(".mobile-bottom-nav__overlay");

    if (!baseItems.length || !capsule || !overlay) return;

    // Explore tab: on mobile, do nothing to snap state when already on the maps page.
    if (exploreTab) {
        exploreTab.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    }

    let activeIndex = -1;
    baseItems.forEach((item, index) => {
        if (item.classList.contains("is-active")) {
            activeIndex = index;
        }
    });

    const prevIndexStr = sessionStorage.getItem("prev-nav-index");
    let prevIndex = prevIndexStr !== null ? parseInt(prevIndexStr, 10) : -1;
    sessionStorage.removeItem("prev-nav-index");

    function updateCapsule(targetEl, immediate = false) {
        if (!targetEl) return;
        
        if (immediate) {
            capsule.style.transition = "none";
            overlay.style.transition = "none";
        } else {
            capsule.style.transition = "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), width 0.35s cubic-bezier(0.16, 1, 0.3, 1), height 0.35s cubic-bezier(0.16, 1, 0.3, 1)";
            overlay.style.transition = "clip-path 0.35s cubic-bezier(0.16, 1, 0.3, 1), -webkit-clip-path 0.35s cubic-bezier(0.16, 1, 0.3, 1)";
        }

        const navRect = nav.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();

        const left = targetRect.left - navRect.left;
        const top = targetRect.top - navRect.top;
        const width = targetRect.width;
        const height = targetRect.height;

        capsule.style.transform = `translate(${left}px, ${top}px)`;
        capsule.style.width = `${width}px`;
        capsule.style.height = `${height}px`;

        nav.style.setProperty("--active-x", `${left + width / 2}px`);
        nav.style.setProperty("--active-y", `${top + height / 2}px`);

        const clipVal = `inset(${top}px ${navRect.width - (left + width)}px ${navRect.height - (top + height)}px ${left}px round 17px)`;
        overlay.style.clipPath = clipVal;
        overlay.style.webkitClipPath = clipVal;

        if (immediate) {
            capsule.offsetHeight;
            capsule.style.transition = "";
            overlay.style.transition = "";
        }
    }

    if (prevIndex !== -1 && prevIndex !== activeIndex && baseItems[prevIndex]) {
        updateCapsule(baseItems[prevIndex], true);
        requestAnimationFrame(() => {
            updateCapsule(baseItems[activeIndex]);
        });
    } else if (activeIndex !== -1) {
        updateCapsule(baseItems[activeIndex], true);
    }

    // Touch Dragging Logic for the capsule (bound to nav to bypass z-index blocking)
    let isDragging = false;
    let hasMoved = false;
    let startX = 0;
    let initialLeft = 0;
    let currentLeft = 0;

    baseItems.forEach((item, index) => {
        item.addEventListener("click", (e) => {
            if (hasMoved) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            sessionStorage.setItem("prev-nav-index", index);
            updateCapsule(item);
        });
    });

    nav.addEventListener("touchstart", (e) => {
        const touch = e.touches[0];
        const capsuleRect = capsule.getBoundingClientRect();
        
        // Check if touch starts within the bounds of the active capsule
        if (
            touch.clientX >= capsuleRect.left &&
            touch.clientX <= capsuleRect.right &&
            touch.clientY >= capsuleRect.top &&
            touch.clientY <= capsuleRect.bottom
        ) {
            isDragging = true;
            hasMoved = false;
            capsule.style.cursor = "grabbing";
            capsule.classList.add("is-dragging");
            startX = touch.clientX;
            
            const style = window.getComputedStyle(capsule);
            const DOMMatrixClass = window.DOMMatrix || window.WebKitCSSMatrix || window.MSCSSMatrix;
            const matrix = new DOMMatrixClass(style.transform);
            initialLeft = matrix.m41;
            currentLeft = initialLeft;

            capsule.style.transition = "none";
            overlay.style.transition = "none";
        }
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
        if (!isDragging) return;
        
        const touch = e.touches[0];
        const deltaX = touch.clientX - startX;
        
        if (Math.abs(deltaX) > 4) {
            hasMoved = true;
        }

        let newLeft = initialLeft + deltaX;

        const navRect = nav.getBoundingClientRect();
        const capsuleRect = capsule.getBoundingClientRect();
        const paddingLeft = 4;
        const minLeft = paddingLeft;
        const maxLeft = navRect.width - paddingLeft - capsuleRect.width;

        if (newLeft < minLeft) newLeft = minLeft;
        if (newLeft > maxLeft) newLeft = maxLeft;

        currentLeft = newLeft;

        capsule.style.transform = `translate(${newLeft}px, 4px)`;

        const top = 4;
        const width = capsuleRect.width;
        const height = capsuleRect.height;

        nav.style.setProperty("--active-x", `${newLeft + width / 2}px`);
        nav.style.setProperty("--active-y", `${top + height / 2}px`);
        const clipVal = `inset(${top}px ${navRect.width - (newLeft + width)}px ${navRect.height - (top + height)}px ${newLeft}px round 17px)`;
        overlay.style.clipPath = clipVal;
        overlay.style.webkitClipPath = clipVal;
    }, { passive: true });

    window.addEventListener("touchend", () => {
        if (!isDragging) return;
        isDragging = false;
        capsule.style.cursor = "grab";
        capsule.classList.remove("is-dragging");

        capsule.style.transition = "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), width 0.35s cubic-bezier(0.16, 1, 0.3, 1), height 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease";
        overlay.style.transition = "clip-path 0.35s cubic-bezier(0.16, 1, 0.3, 1), -webkit-clip-path 0.35s cubic-bezier(0.16, 1, 0.3, 1)";

        const navRect = nav.getBoundingClientRect();
        const capsuleRect = capsule.getBoundingClientRect();
        const capsuleCenter = currentLeft + capsuleRect.width / 2;

        let closestItem = null;
        let closestDist = Infinity;
        let closestIndex = -1;

        baseItems.forEach((item, index) => {
            const itemRect = item.getBoundingClientRect();
            const itemLeft = itemRect.left - navRect.left;
            const itemCenter = itemLeft + itemRect.width / 2;
            const dist = Math.abs(capsuleCenter - itemCenter);
            
            if (dist < closestDist) {
                closestDist = dist;
                closestItem = item;
                closestIndex = index;
            }
        });

        if (closestItem) {
            sessionStorage.setItem("prev-nav-index", closestIndex);
            
            const itemRect = closestItem.getBoundingClientRect();
            const left = itemRect.left - navRect.left;
            const top = itemRect.top - navRect.top;
            const width = itemRect.width;
            const height = itemRect.height;

            capsule.style.transform = `translate(${left}px, ${top}px)`;
            capsule.style.width = `${width}px`;
            capsule.style.height = `${height}px`;

            nav.style.setProperty("--active-x", `${left + width / 2}px`);
            nav.style.setProperty("--active-y", `${top + height / 2}px`);

            const clipVal = `inset(${top}px ${navRect.width - (left + width)}px ${navRect.height - (top + height)}px ${left}px round 17px)`;
            overlay.style.clipPath = clipVal;
            overlay.style.webkitClipPath = clipVal;

            if (hasMoved) {
                closestItem.click();
            }
        }
        
        // Reset hasMoved after a short delay to allow click cancellation to execute first
        setTimeout(() => {
            hasMoved = false;
        }, 50);
    });

    window.addEventListener("resize", () => {
        const activeTab = nav.querySelector(".mobile-bottom-nav__base .mobile-bottom-nav-item.is-active");
        if (activeTab) {
            updateCapsule(activeTab, true);
        }
    });
}
