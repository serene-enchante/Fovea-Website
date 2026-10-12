/**
 * Map-page adapter for the site-wide mobile navigation.
 *
 * The classic navigation script injects the markup and owns capsule animation.
 * The map page only needs to suppress the Explore link's `#` navigation while
 * still letting the shared script handle all animation and drag behavior.
 */
export function setupMobileBottomNav() {
    const nav = document.querySelector(".mobile-bottom-nav");
    if (!nav) return;

    const exploreTab = document.getElementById("mobile-nav-tab-explore");
    if (exploreTab) {
        exploreTab.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
        });
    }

    // The shared classic script loads after the module tag and exposes this
    // initializer for the maps page, which otherwise skips its animation setup.
    window.initMobileBottomNavAnimation?.();
}
