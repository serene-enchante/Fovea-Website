export function createUserProfile({ name = "User", image } = {}) {
  const profile = document.createElement("div");
  profile.className = "user-profile";

  const identity = document.createElement("div");
  identity.className = "user-profile__identity";

  const avatar = document.createElement("div");
  avatar.className = "user-profile__avatar";
  if (image) {
    const portrait = document.createElement("img");
    portrait.src = image;
    portrait.alt = "";
    avatar.append(portrait);
  } else {
    const personIcon = createIcon("account_circle");
    avatar.append(personIcon);
  }

  const username = document.createElement("span");
  username.className = "user-profile__name";
  username.textContent = name;
  const dropdown = createIcon("expand_more");
  dropdown.classList.add("user-profile__dropdown");
  identity.append(avatar, username, dropdown);

  const actions = document.createElement("div");
  actions.className = "user-profile__actions";

  const themeToggle = document.createElement("button");
  themeToggle.className = "user-profile__action user-profile__theme-toggle";
  themeToggle.type = "button";
  themeToggle.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    try {
      localStorage.setItem("fovea-theme", nextTheme);
    } catch (_) {}
    updateThemeToggle(themeToggle, nextTheme);
  });
  updateThemeToggle(themeToggle, document.documentElement.dataset.theme || "dark");

  const settings = document.createElement("button");
  settings.className = "user-profile__settings";
  settings.classList.add("user-profile__action");
  settings.type = "button";
  settings.setAttribute("aria-label", "User settings");
  settings.append(createIcon("settings"));
  actions.append(themeToggle, settings);
  profile.append(identity, actions);

  return profile;
}

function updateThemeToggle(button, currentTheme) {
  const nextTheme = currentTheme === "light" ? "dark" : "light";
  button.replaceChildren(createIcon(currentTheme === "light" ? "light_mode" : "dark_mode"));
  button.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
  button.setAttribute("aria-pressed", String(currentTheme === "light"));
}

function createIcon(name) {
  const icon = document.createElement("span");
  icon.className = "material-symbols-rounded";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = name;
  return icon;
}
