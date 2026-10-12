import { state as appState } from '../state.js';
import { setMobileSnapState as updateMobileSnapState } from '../components/mobile-view.js';

export function setupSearch({
    state = appState,
    documentObject = globalThis.document,
    windowObject = globalThis.window,
    setMobileSnapState = updateMobileSnapState,
    setTimeoutFn = globalThis.setTimeout
} = {}) {
    const header = documentObject.getElementById("sidebar-header");
    const toggleBtn = documentObject.getElementById("btn-search-toggle");
    const closeBtn = documentObject.getElementById("btn-search-close");
    const searchInput = documentObject.getElementById("sidebar-search-input");
    const listContainer = documentObject.getElementById("sidebar-zone-list");

    if (!header || !toggleBtn || !closeBtn || !searchInput || !listContainer) return;

    let savedSnapState = null;

    const openSearch = (e) => {
        if (e) e.preventDefault();

        if (windowObject.innerWidth <= 768) {
            savedSnapState = state.snapState || "default";
            setMobileSnapState("selection-full", true);
        }

        header.classList.add("is-searching");
        header.classList.add("is-search-active");
        searchInput.value = "";
        filterList("");
        searchInput.focus();
        setTimeoutFn(() => searchInput.focus(), 100);
    };

    const closeSearch = () => {
        header.classList.remove("is-searching");
        header.classList.remove("is-search-active");
        searchInput.value = "";
        filterList("");

        if (windowObject.innerWidth <= 768 && savedSnapState) {
            setMobileSnapState(savedSnapState, true);
            savedSnapState = null;
        }
    };

    const filterList = (query) => {
        const q = query.trim().toLowerCase();
        const items = listContainer.querySelectorAll(".tile-zone-item");
        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            const id = (item.getAttribute("data-id") || "").toLowerCase();
            if (!q || text.includes(q) || id.includes(q)) {
                item.style.display = "";
            } else {
                item.style.display = "none";
            }
        });
    };

    toggleBtn.addEventListener("click", openSearch);
    toggleBtn.addEventListener("touchend", (e) => {
        e.preventDefault();
        openSearch(e);
    });
    closeBtn.addEventListener("click", closeSearch);

    searchInput.addEventListener("input", (e) => {
        filterList(e.target.value);
    });

    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeSearch();
        }
    });

    searchInput.addEventListener("focus", () => {
        if (windowObject.innerWidth <= 768) {
            windowObject.scrollTo(0, 0);
            documentObject.body.scrollTop = 0;
        }
    });

    searchInput.addEventListener("blur", () => {
        if (windowObject.innerWidth <= 768) {
            windowObject.scrollTo(0, 0);
            documentObject.body.scrollTop = 0;
        }
    });
}

export function setupAllAppsLiveSearch({ documentObject = globalThis.document } = {}) {
    const searchInput = documentObject.getElementById("all-apps-search-input");
    const clearBtn = documentObject.getElementById("all-apps-search-clear");
    const grid = documentObject.getElementById("all-apps-grid");
    const noResults = documentObject.getElementById("all-apps-no-results");

    if (!searchInput || !grid) return;

    const filterApps = () => {
        const query = searchInput.value.trim().toLowerCase();
        if (clearBtn) clearBtn.style.display = query ? "flex" : "none";

        const cards = grid.querySelectorAll(".suggested-app-card");
        let visibleCount = 0;

        cards.forEach(card => {
            const appName = (card.getAttribute("data-app-name") || "").toLowerCase();
            const label = card.querySelector(".suggested-app-label")?.textContent.toLowerCase() || "";

            if (!query || appName.includes(query) || label.includes(query)) {
                card.style.display = "";
                visibleCount++;
            } else {
                card.style.display = "none";
            }
        });

        if (noResults) {
            noResults.style.display = visibleCount === 0 ? "block" : "none";
        }
    };

    searchInput.addEventListener("input", filterApps);
    if (clearBtn) {
        clearBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            searchInput.value = "";
            filterApps();
            searchInput.focus();
        });
    }
}
