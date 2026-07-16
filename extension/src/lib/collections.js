import { parseSharePointSite } from "./sharepoint-site.js";

const STORAGE_KEY = "savedCollections";
const LEGACY_KEY = "sharepointSites";
const SCHEMA_VERSION = 1;

function cleanUrl(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function defaultName(url) {
  try {
    const parsed = new URL(url);
    const pathName = parsed.pathname.split("/").filter(Boolean).at(-1);
    return decodeURIComponent(pathName || parsed.hostname.replace(/^www\./, ""));
  } catch {
    return "Collection";
  }
}

export function classifyCollectionUrl(input, override = "auto") {
  const url = cleanUrl(input);
  if (!url) return { ok: false, reason: "Enter a valid website URL." };
  if (override && override !== "auto") return { ok: true, type: override, url };

  const sharepoint = parseSharePointSite(url);
  if (sharepoint.ok) return { ok: true, type: "sharepoint", url, sharepoint };

  const parsed = new URL(url);
  const confluence = parsed.hostname.endsWith(".atlassian.net") && parsed.pathname.startsWith("/wiki");
  return { ok: true, type: confluence ? "confluence" : "website", url };
}

export function normalizeCollection(collection) {
  const type = collection && collection.type || "sharepoint";
  const webUrl = cleanUrl(collection && (collection.webUrl || collection.url || collection.sourceUrl));
  const sourceMode = collection && collection.sourceMode || (type === "sharepoint" ? "sharepoint" : type === "custom" ? "list" : "auto");
  return {
    ...collection,
    id: collection && collection.id || generateCollectionId(),
    name: String(collection && collection.name || defaultName(webUrl)).trim() || "Collection",
    type,
    sourceMode,
    sourceUrl: cleanUrl(collection && (collection.sourceUrl || webUrl)),
    urls: Array.isArray(collection && collection.urls) ? [...new Set(collection.urls.filter((url) => /^https?:\/\//i.test(url)))] : [],
    url: webUrl,
    webUrl,
    addedAt: Number(collection && collection.addedAt) || Date.now(),
    collapsed: Boolean(collection && collection.collapsed)
  };
}

export function createCollectionFromUrl(input, { type = "auto", name = "", sourceMode = "auto" } = {}) {
  const classified = classifyCollectionUrl(input, type);
  if (!classified.ok) return classified;
  const sharepoint = classified.sharepoint || (classified.type === "sharepoint" ? parseSharePointSite(classified.url) : null);
  const collection = normalizeCollection({
    id: generateCollectionId(),
    name: name || (sharepoint && sharepoint.ok ? sharepoint.name : defaultName(classified.url)),
    type: classified.type,
    sourceMode: classified.type === "sharepoint" ? "sharepoint" : sourceMode,
    sourceUrl: classified.url,
    url: classified.url,
    webUrl: sharepoint && sharepoint.ok ? sharepoint.webUrl : classified.url,
    apiBase: sharepoint && sharepoint.ok ? sharepoint.apiBase : "",
    addedAt: Date.now()
  });
  return { ok: true, collection };
}

export function createCustomCollection(name, urls) {
  const clean = [...new Set((Array.isArray(urls) ? urls : []).filter((url) => /^https?:\/\//i.test(url)))];
  return normalizeCollection({
    id: generateCollectionId(),
    name: String(name || "Custom URL list").trim() || "Custom URL list",
    type: "custom",
    sourceMode: "list",
    sourceUrl: clean[0] || "",
    webUrl: clean[0] || "",
    urls: clean,
    addedAt: Date.now()
  });
}

export async function loadCollections() {
  const stored = await chrome.storage.sync.get({ [STORAGE_KEY]: null, [LEGACY_KEY]: [] });
  const current = stored[STORAGE_KEY];
  if (current && current.version === SCHEMA_VERSION && Array.isArray(current.items)) {
    return current.items.map(normalizeCollection);
  }

  const legacy = Array.isArray(stored[LEGACY_KEY]) ? stored[LEGACY_KEY] : [];
  const migrated = legacy.map((site) => normalizeCollection({ ...site, type: "sharepoint", sourceMode: "sharepoint" }));
  if (migrated.length) await saveCollections(migrated);
  return migrated;
}

export async function saveCollections(collections) {
  const items = (Array.isArray(collections) ? collections : []).map(normalizeCollection);
  await chrome.storage.sync.set({ [STORAGE_KEY]: { version: SCHEMA_VERSION, items } });
}

export function generateCollectionId() {
  return `collection-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const COLLECTION_SCHEMA_VERSION = SCHEMA_VERSION;
