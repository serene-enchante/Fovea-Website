import { createAppFrame, initializeFrameLayout } from "../../scripts/frame-layout.js";
import { loadPageList } from "./page-list.js";

const frameLayout = document.getElementById("frame-layout");

if (frameLayout) {
  const organizationContent = document.createElement("div");
  const directoryContent = document.createElement("div");
  const userContent = document.createElement("div");
  const organizationDivider = document.createElement("div");
  organizationDivider.className = "organization-divider";
  organizationDivider.setAttribute("aria-hidden", "true");

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
    organizationDivider,
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
  loadPageList(directoryContent, frameLayout.dataset.directorySrc);
}
