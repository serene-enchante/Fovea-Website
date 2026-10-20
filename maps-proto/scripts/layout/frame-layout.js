import appStateMachine from "../state/app-state.js";

export function createAppFrame({ id, variant, layout = "standard", material = "plain", label, content }) {
  const template = document.getElementById("app-frame-template");
  const templateFrame = template?.content.firstElementChild;
  if (!templateFrame) {
    throw new Error("App frame template is missing or empty");
  }

  const frame = templateFrame.cloneNode(true);
  frame.id = id;
  frame.classList.add(`app-frame--${variant}`, `frame-layout--${layout}`);
  if (material) {
    frame.classList.add(`frame-material--${material}`);
  }
  frame.setAttribute("aria-label", label);
  frame.querySelector(".app-frame__content").append(content);
  return frame;
}

export function initializeFrameLayout() {
  const viewToggle = document.getElementById("view-toggle");
  const directoryFrames = document.querySelectorAll(
    ".app-frame--organization, .app-frame--directory, .app-frame--user",
  );
  const contentTitlebar = document.querySelector(".content-titlebar");

  function renderViewState({ state }) {
    const isDirectoryView = state === appStateMachine.states.DIRECTORY_VIEW;
    document.documentElement.dataset.view = state;

    if (viewToggle) {
      viewToggle.setAttribute("aria-pressed", String(isDirectoryView));
      viewToggle.textContent = isDirectoryView ? "Open content" : "Open directory";
    }

    directoryFrames.forEach((frame) => {
      frame.setAttribute("aria-hidden", String(!isDirectoryView));
      frame.inert = !isDirectoryView;
    });

    if (contentTitlebar) {
      contentTitlebar.setAttribute("aria-hidden", String(!isDirectoryView));
      contentTitlebar.inert = !isDirectoryView;
    }
  }

  appStateMachine.subscribe(renderViewState);
  renderViewState({ state: appStateMachine.getState() });

  function toggleView() {
    const nextState = appStateMachine.getState() === appStateMachine.states.CONTENT_VIEW
      ? appStateMachine.states.DIRECTORY_VIEW
      : appStateMachine.states.CONTENT_VIEW;
    appStateMachine.transition(nextState);
  }

  viewToggle?.addEventListener("click", toggleView);
  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isEditing = target instanceof HTMLElement && (
      target.isContentEditable || target.matches("input, textarea, select")
    );

    if (
      event.key.toLowerCase() !== "f" || event.repeat || event.altKey || event.ctrlKey ||
      event.metaKey || isEditing
    ) return;

    event.preventDefault();
    toggleView();
  });
}
