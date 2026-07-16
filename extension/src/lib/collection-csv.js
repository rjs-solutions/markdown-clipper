function csvCell(value) {
  const text = String(value == null ? "" : value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function collectionInventoryRows(collections, inventories = {}) {
  const rows = [];
  for (const collection of Array.isArray(collections) ? collections : []) {
    const inventory = inventories[collection.id] || { pages: [] };
    const pages = inventory.pages && inventory.pages.length
      ? inventory.pages
      : (collection.urls || []).map((url) => ({ url }));
    const records = pages.length ? pages : [{}];
    for (const page of records) {
      rows.push({
        collection_name: collection.name,
        collection_type: collection.type,
        discovery_method: collection.sourceMode,
        collection_url: collection.sourceUrl || collection.webUrl || collection.url,
        page_title: page.title || "",
        page_url: page.url || "",
        modified: page.modified || "",
        last_refreshed: inventory.lastRefreshedAt ? new Date(inventory.lastRefreshedAt).toISOString() : ""
      });
    }
  }
  return rows;
}

export function collectionsToCsv(collections, inventories = {}) {
  const headers = ["collection_name", "collection_type", "discovery_method", "collection_url", "page_title", "page_url", "modified", "last_refreshed"];
  const rows = collectionInventoryRows(collections, inventories);
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\r\n");
}
