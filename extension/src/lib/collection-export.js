import { comparableUrl } from "./discover.js";

function normalizedBase(collection) {
  return String(collection && (collection.webUrl || collection.url || collection.sourceUrl) || "").replace(/\/+$/, "");
}

export function matchSavedCollection(collections, pageUrl) {
  const target = String(pageUrl || "");
  return (Array.isArray(collections) ? collections : [])
    .map((collection) => {
      const base = normalizedBase(collection);
      const listed = Array.isArray(collection.urls)
        && collection.urls.some((url) => comparableUrl(url) === comparableUrl(target));
      const baseMatch = base && (target === base || target.startsWith(`${base}/`) || target.startsWith(`${base}?`));
      return { collection, base, listed, matches: listed || baseMatch };
    })
    .filter((candidate) => candidate.matches)
    .sort((a, b) => Number(b.listed) - Number(a.listed) || b.base.length - a.base.length)[0]?.collection || null;
}

export function collectionExportPreset(collection, inventory, { maxPages = 500 } = {}) {
  const inventoryUrls = (Array.isArray(inventory && inventory.pages) ? inventory.pages : [])
    .map((page) => String(page && page.url || "").trim());
  const storedUrls = Array.isArray(collection && collection.urls) ? collection.urls : [];
  const pageUrls = [...new Set([...inventoryUrls, ...storedUrls].filter((url) => /^https?:\/\//i.test(url)))];
  const startUrl = normalizedBase(collection);

  if (pageUrls.length) {
    return { mode: "list", urls: pageUrls, startUrl, maxPages: Math.min(pageUrls.length, maxPages), inventoryCount: pageUrls.length };
  }

  const mode = collection && collection.sourceMode;
  if (mode === "sitemap" || mode === "llms") {
    return { mode, urls: [], startUrl: collection.sourceUrl || startUrl, maxPages: 100, inventoryCount: 0 };
  }

  return {
    mode: "crawl",
    urls: [],
    startUrl,
    maxPages: 25,
    inventoryCount: 0,
    includePatterns: collection && (collection.type === "sharepoint" || /\.sharepoint\.com\//i.test(startUrl)) ? "/SitePages/" : ""
  };
}
