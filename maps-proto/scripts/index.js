import { createAppFrame, initializeFrameLayout } from "./layout/frame-layout.js";
import {
  createPageList,
  initializePageSelection,
  initializeTileStrips,
  updatePageSelection,
  updatePageTabNames,
} from "./components/page-list.js";
import { createContextPane } from "./components/context-pane.js";
import { createContentLenses } from "./components/content-lenses.js";
import { createSimpleMapLens } from "./components/simple-map-lens.js";
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
  let disposeDirectoryEnhancements = () => {};

  const contentColumn = document.createElement("div");
  contentColumn.className = "content-column";

  const mapStage = document.createElement("div");
  mapStage.className = "map-stage";
  const mapContainer = document.createElement("div");
  mapContainer.id = "map";
  const mapPreview = document.createElement("img");
  mapPreview.className = "map-stage__preview";
  mapPreview.hidden = true;
  mapContainer.append(mapPreview);
  const mapLens = createSimpleMapLens();
  frameLayout.insertBefore(mapLens.element, frameLayout.firstChild);
  const contentLenses = createContentLenses((lens) => {
    appStateMachine.setContentLens(lens);
  }, mapLens);
  mapContainer.append(contentLenses.element);
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
  contextFrame.addEventListener("contextaction", (event) => {
    if (event.detail?.actionId === "download") contextPane.setDownloads();
    if (event.detail?.actionId === "suggest") contextPane.setSuggest();
    if (event.detail?.actionId === "share") contextPane.setShare();
  });
  mapStage.addEventListener("contextitemselect", (event) => {
    if (event.detail?.selection?.type === "zone") {
      appStateMachine.selectZone(event.detail.selection);
    }
  });

  mapStage.append(mapContainer, contextFrame);

  const contentFrame = createAppFrame({
    id: "content-frame",
    variant: "content",
    label: "Content",
    content: mapStage,
  });
  contentColumn.append(contentFrame);

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
  mapLens.setFrameMask(
    contentFrame,
    () => [
      ...document.querySelectorAll(".app-frame--context"),
      document.getElementById("toolbar-frame"),
    ],
    contentColumn,
  );
  initializeFrameLayout();

  directoryContent.addEventListener("pageselect", (event) => {
    appStateMachine.select(event.detail);
  });

  appStateMachine.subscribeSelection(({ selection, tabName }) => {
    updatePageSelection(directoryContent, selection);
    updatePageTabNames(directoryContent, tabName);
    mapPreview.hidden = appStateMachine.getContentLens() !== "image" || !selection.image;
    mapPreview.removeAttribute("src");
    mapPreview.alt = selection.label ? `${selection.label} image` : "Selected image";
    if (selection.image) {
      mapPreview.src = new URL(selection.image, selection.dataUrl).href;
    } else {
      mapPreview.alt = selection.label || "Selected image";
    }
    contentLenses.setState({
      lens: appStateMachine.getContentLens(),
      selection,
    });

    const fallbackContext = {
      id: selection.id,
      title: selection.label || "New tab",
      actions: [],
      sections: [],
    };
    if (!selection.contextSrc) {
      contextPane.element.dataset.contextId = selection.id;
      contextPane.setContext(fallbackContext, selection.dataUrl || document.baseURI);
      return;
    }

    const contextUrl = new URL(selection.contextSrc, selection.dataUrl || document.baseURI);
    loadJsonData(contextUrl.href)
      .then(({ data, dataUrl }) => {
        if (appStateMachine.getSelection()?.id !== selection.id) return;
        contextPane.element.dataset.contextId = data.id || selection.id;
        contextPane.setContext(data, dataUrl);
      })
      .catch((error) => {
        console.error("Unable to load selected context", error);
        if (appStateMachine.getSelection()?.id === selection.id) {
          contextPane.setContext(fallbackContext, selection.dataUrl || document.baseURI);
        }
      });
  });

  appStateMachine.subscribeContentLens(({ lens, selection }) => {
    contentLenses.setState({ lens, selection });
    mapPreview.hidden = lens !== "image" || !selection?.image;
  });

  directoryContent.addEventListener("sectionexpand", (event) => {
    const { section, dataUrl } = event.detail || {};
    if (!section) return;
    if (window.matchMedia("(max-width: 700px)").matches) {
      appStateMachine.transition(appStateMachine.states.CONTENT_VIEW);
    }
    contextPane.setSection(section, dataUrl);
  });

  loadJsonData(frameLayout.dataset.directorySrc)
    .then(({ data, dataUrl }) => {
      disposeDirectoryEnhancements();
      directoryContent.replaceChildren(createPageList(data, dataUrl));
      const disposePageSelection = initializePageSelection(directoryContent);
      organizationContent.replaceChildren(
        createOrganizationRail(data.organizations, data.organizationActions, dataUrl),
      );
      const disposeTileStrips = initializeTileStrips(directoryContent);
      disposeDirectoryEnhancements = () => {
        disposePageSelection();
        disposeTileStrips();
      };
      const initialPage = data.sections.flatMap(({ items }) => items)
        .find(({ id }) => id === "eugene-cbc")
        || data.sections.flatMap(({ items }) => items).find(({ selected }) => selected);
      if (initialPage) {
        appStateMachine.select({
          id: initialPage.id,
          label: initialPage.label,
          image: initialPage.image || "",
          contextSrc: initialPage.contextSrc || "",
          content: initialPage.content || {},
          map: initialPage.map || {},
          dataUrl,
        });
      }
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
