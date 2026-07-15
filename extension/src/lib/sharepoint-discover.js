// SharePoint page discovery: pure URL builder + row normalizer for Phase 1a.
// The actual fetch/injection that calls this URL and unwraps the REST
// envelope is Phase 1b -- this file stays network-free.

export function sitePagesQueryUrl(apiBase, { top = 100 } = {}) {
  const select = "Id,Title,FileRef,GUID,Modified";
  return `${apiBase}/web/lists/getByTitle('Site%20Pages')/items?$select=${select}&$orderby=Modified desc&$top=${top}`;
}

function deriveTitleFromFileRef(fileRef) {
  const basename = String(fileRef || "").split("/").pop() || "";
  return basename.replace(/\.[a-z0-9]+$/i, "");
}

// Unwrap a Site Pages REST response into a flat items array plus the next
// page's continuation URL, if any. Handles both the nometadata shape
// ({ value, "odata.nextLink" }) and the verbose shape ({ d: { results, __next } }).
// Tolerant of null/garbage input so callers can pass a fetch response's
// parsed JSON straight through.
export function extractPageItems(json) {
  if (!json || typeof json !== "object") {
    return { items: [], nextLink: null };
  }
  const items = json.value || (json.d && json.d.results) || [];
  const nextLink = json["odata.nextLink"] || (json.d && json.d.__next) || null;
  return {
    items: Array.isArray(items) ? items : [],
    nextLink: nextLink || null
  };
}

export function normalizeDiscoveredPages(items, origin) {
  const rows = Array.isArray(items) ? items : [];
  const pages = [];
  for (const row of rows) {
    if (!row || !row.FileRef) {
      continue;
    }
    pages.push({
      id: row.Id,
      title: row.Title || deriveTitleFromFileRef(row.FileRef),
      fileRef: row.FileRef,
      guid: row.GUID,
      modified: row.Modified,
      url: `${origin}${row.FileRef}`
    });
  }
  return pages;
}
