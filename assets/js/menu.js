import { createAudio } from "./engine/audio.js";
import { createSettings } from "./engine/settings.js";

const POWER_OFF_MS = 350;

const terminal = document.querySelector(".terminal");
const allItems = Array.from(document.querySelectorAll(".menu__item"));
const settingsToggle = document.querySelector('[data-action="settings"]');
const settingsList = document.getElementById("settings-list");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const audio = createAudio();
const settings = createSettings();
let selectedIndex = 0;
let isNavigating = false;

const click = () => audio.tone({ frequency: 880, duration: 0.03, volume: 0.05 });

function visibleItems() {
  return allItems.filter((item) => !item.closest("[hidden]"));
}

function select(index) {
  const items = visibleItems();
  if (items.length === 0) {
    return;
  }
  selectedIndex = (index + items.length) % items.length;
  allItems.forEach((item) => item.classList.toggle("is-selected", item === items[selectedIndex]));
}

function selectItem(item) {
  select(visibleItems().indexOf(item));
}

function launch(item) {
  if (isNavigating) {
    return;
  }
  isNavigating = true;
  click();
  if (prefersReducedMotion) {
    window.location.assign(item.href);
    return;
  }
  terminal.classList.add("is-powering-off");
  window.setTimeout(() => window.location.assign(item.href), POWER_OFF_MS);
}

function toggleSettingsList() {
  const isExpanded = settingsList.hidden;
  settingsList.hidden = !isExpanded;
  settingsToggle.setAttribute("aria-expanded", String(isExpanded));
  selectItem(settingsToggle);
  click();
}

function changeSetting(item, step) {
  settings.activate(item.dataset.setting, step);
  click();
}

function activate(item, step = 1) {
  audio.unlock();
  if (item.dataset.setting) {
    changeSetting(item, step);
  } else if (item === settingsToggle) {
    toggleSettingsList();
  } else if (item.href) {
    launch(item);
  }
}

function renderSettings() {
  settings.menuItems().forEach(({ id, value }) => {
    const valueElement = settingsList.querySelector(`[data-setting="${id}"] [data-setting-value]`);
    if (valueElement) {
      valueElement.textContent = value;
    }
  });
}

function moveSelection(step) {
  audio.unlock();
  select(selectedIndex + step);
  click();
}

function handleKeydown(event) {
  const selectedItem = visibleItems()[selectedIndex];
  if (event.code === "ArrowDown" || event.code === "KeyS") {
    event.preventDefault();
    moveSelection(1);
  } else if (event.code === "ArrowUp" || event.code === "KeyW") {
    event.preventDefault();
    moveSelection(-1);
  } else if ((event.code === "Enter" || event.code === "Space") && selectedItem) {
    event.preventDefault();
    activate(selectedItem);
  } else if ((event.code === "ArrowLeft" || event.code === "KeyA") && selectedItem?.dataset.setting) {
    event.preventDefault();
    activate(selectedItem, -1);
  } else if ((event.code === "ArrowRight" || event.code === "KeyD") && selectedItem?.dataset.setting) {
    event.preventDefault();
    activate(selectedItem, 1);
  } else if (event.code === "Escape" && !settingsList.hidden) {
    event.preventDefault();
    toggleSettingsList();
  }
}

function showSystemMessage(text) {
  const message = document.createElement("p");
  message.className = "system-message glow";
  message.textContent = text;
  document.body.append(message);
}

function startMenu() {
  allItems.forEach((item) => {
    item.addEventListener("pointerenter", () => selectItem(item));
    item.addEventListener("focus", () => selectItem(item));
    item.addEventListener("click", (event) => {
      event.preventDefault();
      selectItem(item);
      activate(item);
    });
  });

  window.addEventListener("keydown", handleKeydown);

  window.addEventListener("pageshow", () => {
    isNavigating = false;
    terminal.classList.remove("is-powering-off");
  });

  settings.onChange(({ sound }) => {
    audio.setMuted(!sound);
    renderSettings();
  });

  select(0);
}

try {
  startMenu();
} catch (error) {
  console.error("Unable to start menu", error);
  showSystemMessage("SYSTEM FAILURE :: RELOAD PAGE");
}
