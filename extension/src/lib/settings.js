// Settings persistence (chrome.storage.sync). DEFAULT_SETTINGS is the single
// source of truth for option keys/shape, shared by the popup and options page.

export const DEFAULT_SETTINGS = {
  mode: "auto", // auto | sharepoint | article | full
  scrollBeforeCapture: true,
  maxScrollMs: 12000,
  scrollPauseMs: 450,
  dropHidden: true,
  metadataStyle: "frontmatter", // frontmatter | list | none
  includeTitleHeading: true
};

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
