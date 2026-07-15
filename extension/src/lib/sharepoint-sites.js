// Saved SharePoint sites, stored under chrome.storage.sync's own key
// ("sharepointSites") -- deliberately kept separate from settings.js /
// settings-schema.js so the sites list never becomes a schema field, exactly
// like tag-rules.js's rules list (see options.js's bespoke sites editor).

const STORAGE_KEY = "sharepointSites";

// Site record: { id, name, url, webUrl, apiBase, addedAt }
export async function loadSites() {
  const stored = await chrome.storage.sync.get({ [STORAGE_KEY]: [] });
  return Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
}

export async function saveSites(sites) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: Array.isArray(sites) ? sites : [] });
}

export function generateSiteId() {
  return `site-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
