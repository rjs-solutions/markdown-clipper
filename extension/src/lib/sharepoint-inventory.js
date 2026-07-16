// Persisted SharePoint page inventories. Site configuration stays in
// chrome.storage.sync (sharepoint-sites.js), while page lists live in local
// storage so a larger tenant cannot exhaust Chrome's small sync quota.

const STORAGE_KEY = "sharepointSiteInventories";

export function pageIdentity(page) {
  const fileRef = String(page && page.fileRef || "").trim().toLowerCase();
  if (fileRef) {
    return `path:${fileRef}`;
  }
  const guid = String(page && page.guid || "").trim().toLowerCase();
  if (guid) {
    return `guid:${guid}`;
  }
  const url = String(page && page.url || "").trim().toLowerCase();
  if (url) {
    return `url:${url}`;
  }
  return `id:${String(page && page.id || "").trim().toLowerCase()}`;
}

function dedupePages(pages) {
  const unique = new Map();
  for (const page of Array.isArray(pages) ? pages : []) {
    const key = pageIdentity(page);
    if (key !== "id:" && !unique.has(key)) {
      unique.set(key, page);
    }
  }
  return Array.from(unique.values());
}

function pageChanged(previous, next) {
  return ["title", "fileRef", "guid", "modified", "url"].some(
    (field) => String(previous && previous[field] || "") !== String(next && next[field] || "")
  );
}

// Replace the stored snapshot with the latest deduplicated discovery result,
// while reporting how it differs from the prior snapshot. Replacing (rather
// than appending) guarantees that refreshes never duplicate existing pages.
export function reconcileSitePages(previousPages, discoveredPages) {
  const previous = dedupePages(previousPages);
  const pages = dedupePages(discoveredPages);
  const previousByKey = new Map(previous.map((page) => [pageIdentity(page), page]));
  const currentKeys = new Set();
  const changeTypes = {};
  let newCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;

  for (const page of pages) {
    const key = pageIdentity(page);
    currentKeys.add(key);
    const oldPage = previousByKey.get(key);
    if (!oldPage) {
      newCount += 1;
      changeTypes[key] = "new";
    } else if (pageChanged(oldPage, page)) {
      updatedCount += 1;
      changeTypes[key] = "updated";
    } else {
      unchangedCount += 1;
    }
  }

  const removedCount = previous.reduce(
    (count, page) => count + (currentKeys.has(pageIdentity(page)) ? 0 : 1),
    0
  );

  return { pages, newCount, updatedCount, unchangedCount, removedCount, changeTypes };
}

async function loadInventories() {
  const stored = await chrome.storage.local.get({ [STORAGE_KEY]: {} });
  const inventories = stored[STORAGE_KEY];
  return inventories && typeof inventories === "object" && !Array.isArray(inventories) ? inventories : {};
}

export async function loadSiteInventory(siteId) {
  const inventories = await loadInventories();
  return normalizeInventory(inventories[siteId]);
}

function normalizeInventory(inventory) {
  return inventory && typeof inventory === "object"
    ? { pages: dedupePages(inventory.pages), lastRefreshedAt: inventory.lastRefreshedAt || null }
    : { pages: [], lastRefreshedAt: null };
}

// Read the shared local-storage object once when a UI needs several saved
// sites. This avoids re-reading the full (potentially large) inventories map
// once per row on Options and the Import Collection page.
export async function loadSiteInventories(siteIds = []) {
  const inventories = await loadInventories();
  return Object.fromEntries(siteIds.map((siteId) => [siteId, normalizeInventory(inventories[siteId])]));
}

export async function saveSiteInventory(siteId, inventory) {
  const inventories = await loadInventories();
  inventories[siteId] = {
    pages: dedupePages(inventory && inventory.pages),
    lastRefreshedAt: inventory && inventory.lastRefreshedAt || Date.now()
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: inventories });
}

export async function removeSiteInventory(siteId) {
  const inventories = await loadInventories();
  delete inventories[siteId];
  await chrome.storage.local.set({ [STORAGE_KEY]: inventories });
}
