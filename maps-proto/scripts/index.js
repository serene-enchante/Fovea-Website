import { createAppFrame, initializeFrameLayout } from "./layout/frame-layout.js";
import {
  createPageList,
  initializePageSelection,
  initializeTileStrips,
  updatePageTabNames,
} from "./components/page-list.js";
import { createContextPane } from "./components/context-pane.js";
import { createTabsFrame } from "./components/tabs-frame.js";
import { createOrganizationRail } from "./components/organization-rail.js";
import { createToolbar } from "./components/toolbar.js";
import { createUserProfile } from "./components/user-profile.js";
import { loadJsonData } from "./data/load-json-data.js";
import appStateMachine from "./state/app-state.js";

const frameLayout = document.getElementById("frame-layout");

if (frameLayout) {
  const organizationContent = document.createElement("div");
  const directoryContent = document.createElement("div");
  const userContent = createUserProfile({ name: "User" });
  const contextPane = createContextPane();
  let tabsFrame;
  let disposeDirectoryEnhancements = () => {};

  const contentColumn = document.createElement("div");
  contentColumn.className = "content-column";

  const mapStage = document.createElement("div");
  mapStage.className = "map-stage";
  const mapContainer = document.createElement("div");
  mapContainer.id = "map";
  const contextFrame = createAppFrame({
    id: "context-frame",
    variant: "context",
    layout: "floating",
    material: "floating",
    label: "Context",
    content: contextPane.element,
  });
  let activeContextTitle = "New tab";
  contextFrame.addEventListener("contextclose", () => {
    contextFrame.classList.add("is-closed");
    contextFrame.setAttribute("aria-hidden", "true");
    contextFrame.inert = true;
    activeContextTitle = "New tab";
    updatePageTabNames(directoryContent, activeContextTitle);
    tabsFrame.setCurrentContext(null);
  });
  contextFrame.addEventListener("contextopen", () => {
    contextFrame.classList.remove("is-closed");
    contextFrame.removeAttribute("aria-hidden");
    contextFrame.inert = false;
  });
  contextFrame.addEventListener("contexttitlechange", (event) => {
    activeContextTitle = event.detail?.title || "New tab";
    updatePageTabNames(directoryContent, activeContextTitle);
    tabsFrame.setCurrentContext(
      event.detail?.context,
      event.detail?.dataUrl || document.baseURI,
      contextFrame,
    );
  });
  mapStage.append(mapContainer, contextFrame);

  const contentFrame = createAppFrame({
    id: "content-frame",
    variant: "content",
    label: "Content",
    content: mapStage,
  });
  contentColumn.append(contentFrame);
  tabsFrame = createTabsFrame();

  frameLayout.append(
    createAppFrame({
      id: "organization-frame",
      variant: "organization",
      material: "bare",
      label: "Organization",
      content: organizationContent,
    }),
    createAppFrame({
      id: "directory-frame",
      variant: "directory",
      material: null,
      label: "Directory",
      content: directoryContent,
    }),
    createAppFrame({
      id: "user-frame",
      variant: "user",
      material: "floating",
      label: "User",
      content: userContent,
    }),
    contentColumn,
  );
  document.body.append(tabsFrame.element);
  initializeFrameLayout();

  directoryContent.addEventListener("sectionexpand", (event) => {
    const { section, dataUrl } = event.detail || {};
    if (!section) return;
    if (window.matchMedia("(max-width: 700px)").matches) {
      appStateMachine.transition(appStateMachine.states.CONTENT_VIEW);
    }
    contextPane.setSection(section, dataUrl);
  });

  function showContext(context, dataUrl) {
    contextPane.element.dataset.contextId = context.id || "";
    contextPane.setContext(context, dataUrl);
  }

  frameLayout.addEventListener("contextchange", (event) => {
    const { context, source } = event.detail || {};
    if (context) {
      showContext(context, source ? new URL(source, document.baseURI) : document.baseURI);
    } else if (source) {
      loadJsonData(source)
        .then(({ data, dataUrl }) => showContext(data, dataUrl))
        .catch((error) => console.error("Unable to load context data", error));
    }
  });

  loadJsonData(frameLayout.dataset.contextSrc)
    .then(({ data, dataUrl }) => showContext(data, dataUrl))
    .catch((error) => {
      console.error("Unable to load context data", error);
      contextPane.element.textContent = "Context unavailable";
    });
  loadJsonData(frameLayout.dataset.directorySrc)
    .then(({ data, dataUrl }) => {
      disposeDirectoryEnhancements();
      directoryContent.replaceChildren(createPageList(data, dataUrl));
      const disposePageSelection = initializePageSelection(directoryContent);
      updatePageTabNames(directoryContent, activeContextTitle);
      organizationContent.replaceChildren(
        createOrganizationRail(data.organizations, data.organizationActions, dataUrl),
      );
      const disposeTileStrips = initializeTileStrips(directoryContent);
      disposeDirectoryEnhancements = () => {
        disposePageSelection();
        disposeTileStrips();
      };
    })
    .catch((error) => {
      console.error("Unable to load directory data", error);
      directoryContent.textContent = "Pages unavailable";
      organizationContent.textContent = "Organizations unavailable";
    });

  loadJsonData(frameLayout.dataset.toolbarSrc)
    .then(({ data }) => {
      contentColumn.append(
        createAppFrame({
          id: "toolbar-frame",
          variant: "toolbar",
          layout: "toolbar",
          material: "floating",
          label: "Toolbar",
          content: createToolbar(data.items),
        }),
      );
    })
    .catch((error) => {
      console.error("Unable to load toolbar data", error);
    });

  loadJsonData(frameLayout.dataset.tabsSrc)
    .then(({ data, dataUrl }) => tabsFrame.setItems(data.items, dataUrl))
    .catch((error) => console.error("Unable to load tabs data", error));
}
