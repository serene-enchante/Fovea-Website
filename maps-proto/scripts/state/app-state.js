const STATES = Object.freeze({
  CONTENT_VIEW: "content-view",
  DIRECTORY_VIEW: "directory-view",
});
const CONTENT_LENSES = Object.freeze({
  MAPS: "maps",
  IMAGE: "image",
  PEOPLE: "people",
  GRAPH: "graph",
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [STATES.CONTENT_VIEW]: new Set([STATES.DIRECTORY_VIEW]),
  [STATES.DIRECTORY_VIEW]: new Set([STATES.CONTENT_VIEW]),
});

let currentState = document.documentElement.dataset.view === STATES.DIRECTORY_VIEW
  ? STATES.DIRECTORY_VIEW
  : STATES.CONTENT_VIEW;
const listeners = new Set();
const selectionListeners = new Set();
const lensListeners = new Set();
let currentSelection = null;
let currentLens = CONTENT_LENSES.MAPS;

const appStateMachine = Object.freeze({
  states: STATES,

  getState() {
    return currentState;
  },

  getSelection() {
    return currentSelection;
  },

  contentLenses: CONTENT_LENSES,

  getContentLens() {
    return currentLens;
  },

  setContentLens(nextLens) {
    if (!Object.values(CONTENT_LENSES).includes(nextLens)) {
      throw new Error(`Unknown content lens: ${nextLens}`);
    }
    if (nextLens === currentLens) return false;
    const previousLens = currentLens;
    currentLens = nextLens;
    const change = Object.freeze({
      lens: currentLens,
      previousLens,
      selection: currentSelection,
    });
    lensListeners.forEach((listener) => listener(change));
    window.dispatchEvent(new CustomEvent("contentlenschange", { detail: change }));
    return true;
  },

  select(selection) {
    if (!selection || typeof selection.id !== "string" || !selection.id) {
      throw new TypeError("A selection must have an id");
    }
    const previousSelection = currentSelection;
    if (previousSelection?.id === selection.id) return false;
    currentSelection = Object.freeze({ ...selection, type: selection.type || "page" });
    const change = Object.freeze({
      selection: currentSelection,
      previousSelection,
      tabName: selection.label || selection.title || "New tab",
    });
    selectionListeners.forEach((listener) => listener(change));
    window.dispatchEvent(new CustomEvent("appselectionchange", { detail: change }));
    return true;
  },

  selectZone(zone) {
    if (!zone || typeof zone.id !== "string" || !zone.id) {
      throw new TypeError("A zone selection must have an id");
    }
    if (!currentSelection) {
      throw new Error("A parent selection is required before selecting a zone");
    }
    const parentSelection = currentSelection.type === "zone" && currentSelection.parent
      ? { ...currentSelection, id: currentSelection.parent.id, label: currentSelection.parent.label }
      : currentSelection;
    const zoneId = zone.id.toUpperCase();
    const parentMap = { ...(parentSelection.map || {}) };
    delete parentMap.featureFilter;
    return this.select({
      id: `${parentSelection.id}/zone/${zoneId}`,
      type: "zone",
      zoneId,
      label: zone.label || `Zone ${zone.id}`,
      image: zone.image || "",
      contextSrc: parentSelection.contextSrc || "",
      content: parentSelection.content || {},
      map: {
        ...parentMap,
        featureFilter: { property: "zid", value: zoneId },
      },
      dataUrl: parentSelection.dataUrl,
      parent: Object.freeze({ id: parentSelection.id, label: parentSelection.label }),
    });
  },

  transition(nextState) {
    if (!Object.values(STATES).includes(nextState)) {
      throw new Error(`Unknown application state: ${nextState}`);
    }
    if (nextState === currentState) return false;
    if (!ALLOWED_TRANSITIONS[currentState].has(nextState)) {
      throw new Error(`Transition not allowed: ${currentState} → ${nextState}`);
    }

    const previousState = currentState;
    currentState = nextState;
    const change = Object.freeze({ state: currentState, previousState });
    listeners.forEach((listener) => listener(change));
    window.dispatchEvent(new CustomEvent("appstatechange", { detail: change }));
    return true;
  },

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("State listener must be a function");
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  subscribeSelection(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Selection listener must be a function");
    }
    selectionListeners.add(listener);
    return () => selectionListeners.delete(listener);
  },

  subscribeContentLens(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Content lens listener must be a function");
    }
    lensListeners.add(listener);
    return () => lensListeners.delete(listener);
  },
});

window.appStateMachine = appStateMachine;

export default appStateMachine;
