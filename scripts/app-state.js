const STATES = Object.freeze({
  CONTENT_VIEW: "content-view",
  DIRECTORY_VIEW: "directory-view",
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [STATES.CONTENT_VIEW]: new Set([STATES.DIRECTORY_VIEW]),
  [STATES.DIRECTORY_VIEW]: new Set([STATES.CONTENT_VIEW]),
});

let currentState = STATES.CONTENT_VIEW;
const listeners = new Set();

const appStateMachine = Object.freeze({
  states: STATES,

  getState() {
    return currentState;
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
});

window.appStateMachine = appStateMachine;

export default appStateMachine;
