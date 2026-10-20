import { createAppFrame, initializeFrameLayout } from "./layout/frame-layout.js";
import { createPageList, initializePageSelection, initializeTileStrips } from "./components/page-list.js";
import { createContextPane } from "./components/context-pane.js";
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
  contextFrame.addEventListener("contextclose", () => {
    contextFrame.classList.add("is-closed");
    contextFrame.setAttribute("aria-hidden", "true");
    contextFrame.inert = true;
  });
  contextFrame.addEventListener("contextopen", () => {
    contextFrame.classList.remove("is-closed");
    contextFrame.removeAttribute("aria-hidden");
    contextFrame.inert = false;
  });
  mapStage.append(mapContainer, contextFrame);

  contentColumn.append(
    createAppFrame({
      id: "content-frame",
      variant: "content",
      label: "Content",
      content: mapStage,
    }),
  );

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
      directoryContent.replaceChildren(createPageList(data, dataUrl));
      initializePageSelection(directoryContent);
      organizationContent.replaceChildren(
        createOrganizationRail(data.organizations, data.organizationActions, dataUrl),
      );
      initializeTileStrips(directoryContent);
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
}
