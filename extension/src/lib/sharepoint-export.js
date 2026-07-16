// Pure helpers that bridge saved SharePoint sites/inventories into the
// collection-export screen. Kept DOM-free so the matching and seed selection
// remain testable without Chrome.

function normalizedBase(site) {
  return String(site && (site.webUrl || site.url) || "").replace(/\/+$/, "");
}

export function matchSavedSite(sites, pageUrl) {
  const target = String(pageUrl || "");
  return (Array.isArray(sites) ? sites : [])
    .filter((site) => {
      const base = normalizedBase(site);
      return base && (target === base || target.startsWith(`${base}/`) || target.startsWith(`${base}?`));
    })
    .sort((a, b) => normalizedBase(b).length - normalizedBase(a).length)[0] || null;
}

export function savedSiteExportPreset(site, inventory, { maxPages = 500 } = {}) {
  const pageUrls = Array.from(new Set(
    (Array.isArray(inventory && inventory.pages) ? inventory.pages : [])
      .map((page) => String(page && page.url || "").trim())
      .filter((url) => /^https?:\/\//i.test(url))
  ));
  const webUrl = normalizedBase(site);

  if (pageUrls.length) {
    return {
      mode: "list",
      urls: pageUrls,
      startUrl: webUrl,
      maxPages: Math.min(pageUrls.length, maxPages),
      inventoryCount: pageUrls.length
    };
  }

  return {
    mode: "crawl",
    urls: [],
    startUrl: webUrl,
    maxPages: 25,
    inventoryCount: 0,
    includePatterns: "/SitePages/"
  };
}
