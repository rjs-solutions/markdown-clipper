// Settings persistence (chrome.storage.sync). The option keys/shape live in
// settings-schema.js (the single source of truth); DEFAULT_SETTINGS is derived
// from it so the schema and the stored defaults cannot drift apart.

import { defaultsFromSchema } from "./settings-schema.js";

export const DEFAULT_SETTINGS = defaultsFromSchema();

export async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(values) {
  await chrome.storage.sync.set(values);
}

export async function resetSettings() {
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS };
}

// Shared numeric clamp for schema "number" fields (options page, and anywhere
// else a stored value needs to be coerced back into its field's range).
export function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}
