const STORAGE_KEY = "collectionPageHealth";

export async function saveCollectionHealth(collectionId, { results = [], errors = [], checkedAt = Date.now() } = {}) {
  const stored = await chrome.storage.local.get({ [STORAGE_KEY]: {} });
  const all = stored[STORAGE_KEY] && typeof stored[STORAGE_KEY] === "object" ? stored[STORAGE_KEY] : {};
  all[collectionId] = {
    checkedAt,
    pages: [
      ...results.map((page) => ({ url: page.url, title: page.title || "", status: "ok" })),
      ...errors.map((page) => ({ url: page.url, title: "", status: "error", error: page.error || "Capture failed" }))
    ]
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
  return all[collectionId];
}

export async function loadCollectionHealth(collectionId) {
  const stored = await chrome.storage.local.get({ [STORAGE_KEY]: {} });
  const value = stored[STORAGE_KEY]?.[collectionId];
  return value && typeof value === "object" ? value : { checkedAt: null, pages: [] };
}

export async function removeCollectionHealth(collectionId) {
  const stored = await chrome.storage.local.get({ [STORAGE_KEY]: {} });
  const all = stored[STORAGE_KEY] && typeof stored[STORAGE_KEY] === "object" ? stored[STORAGE_KEY] : {};
  delete all[collectionId];
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
}
