import { createAppFrame, initializeFrameLayout } from "./layout/frame-layout.js";
import { createPageList, initializeTileStrips } from "./components/page-list.js";
import { createOrganizationRail } from "./components/organization-rail.js";
import { loadDirectoryData } from "./data/load-directory-data.js";

const frameLayout = document.getElementById("frame-layout");

if (frameLayout) {
  const organizationContent = document.createElement("div");
  const directoryContent = document.createElement("div");
  const userContent = document.createElement("div");

  const contentColumn = document.createElement("div");
  contentColumn.className = "content-column";
  const titlebar = document.createElement("header");
  titlebar.className = "content-titlebar";
  titlebar.textContent = "new tab";

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
    content: document.createElement("div"),
  });
  mapStage.append(mapContainer, contextFrame);

  contentColumn.append(
    titlebar,
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
  loadDirectoryData(frameLayout.dataset.directorySrc)
    .then(({ data, dataUrl }) => {
      directoryContent.replaceChildren(createPageList(data, dataUrl));
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
}
