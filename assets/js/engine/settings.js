import { createStore } from "./storage.js";

export const COLOR_OPTIONS = [
  { id: "green", label: "GREEN" },
  { id: "amber", label: "AMBER" },
  { id: "white", label: "WHITE" },
  { id: "cyan", label: "CYAN" },
  { id: "pink", label: "PINK" },
];

const DEFAULTS = { sound: true, color: COLOR_OPTIONS[0].id };

function sanitizeSettings(raw) {
  return {
    sound: typeof raw.sound === "boolean" ? raw.sound : DEFAULTS.sound,
    color: COLOR_OPTIONS.some((option) => option.id === raw.color) ? raw.color : DEFAULTS.color,
  };
}

function colorLabel(colorId) {
  return COLOR_OPTIONS.find((option) => option.id === colorId)?.label ?? COLOR_OPTIONS[0].label;
}

function parseRgb(value) {
  const channels = value.split(",").map((channel) => Number.parseFloat(channel) / 255);
  return channels.length === 3 && channels.every(Number.isFinite) ? channels : null;
}

export function readPalette() {
  const style = window.getComputedStyle(document.documentElement);
  const read = (name) => parseRgb(style.getPropertyValue(name));
  const palette = { phosphor: read("--phosphor-rgb"), ghost: read("--ghost-rgb"), background: read("--background-rgb") };
  return palette.phosphor && palette.ghost && palette.background ? palette : null;
}

function applyColor(colorId) {
  const root = document.documentElement;
  root.dataset.color = colorId;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.content = window.getComputedStyle(root).getPropertyValue("--color-background").trim() || themeColor.content;
  }
}

export function createSettings() {
  const store = createStore("settings", 1, DEFAULTS);
  const listeners = new Set();
  let current = sanitizeSettings(store.load());

  function notify() {
    applyColor(current.color);
    listeners.forEach((listener) => listener({ ...current }));
  }

  function update(changes) {
    current = sanitizeSettings({ ...current, ...changes });
    store.save(current);
    notify();
  }

  function toggleSound() {
    update({ sound: !current.sound });
  }

  function cycleColor(step = 1) {
    const index = COLOR_OPTIONS.findIndex((option) => option.id === current.color);
    const nextIndex = (index + step + COLOR_OPTIONS.length) % COLOR_OPTIONS.length;
    update({ color: COLOR_OPTIONS[nextIndex].id });
  }

  function menuItems() {
    return [
      { id: "sound", name: "SOUND", value: current.sound ? "ON" : "OFF" },
      { id: "color", name: "COLOR", value: colorLabel(current.color) },
    ].map((item) => ({ ...item, label: `${item.name}: ${item.value}` }));
  }

  function activate(itemId, step = 1) {
    if (itemId === "sound") {
      toggleSound();
      return true;
    }
    if (itemId === "color") {
      cycleColor(step);
      return true;
    }
    return false;
  }

  function onChange(listener) {
    listeners.add(listener);
    listener({ ...current });
    return () => listeners.delete(listener);
  }

  window.addEventListener("storage", () => {
    current = sanitizeSettings(store.load());
    notify();
  });

  applyColor(current.color);

  return { get: () => ({ ...current }), toggleSound, cycleColor, menuItems, activate, onChange };
}
