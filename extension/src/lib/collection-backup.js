import { generateCollectionId, normalizeCollection } from "./collections.js";

export function exportCollectionDefinitions(collections, { exportedAt = new Date().toISOString() } = {}) {
  return JSON.stringify({
    format: "markdown-clipper-collections",
    version: 1,
    exportedAt,
    collections: (Array.isArray(collections) ? collections : []).map((collection) => normalizeCollection(collection))
  }, null, 2);
}

export function parseCollectionDefinitions(text) {
  let parsed;
  try { parsed = JSON.parse(String(text || "")); } catch { throw new Error("That file is not valid JSON."); }
  if (!parsed || parsed.format !== "markdown-clipper-collections" || parsed.version !== 1 || !Array.isArray(parsed.collections)) {
    throw new Error("That is not a supported Markdown Clipper collections file.");
  }
  return parsed.collections.map(normalizeCollection);
}

function comparableSource(collection) {
  return String(collection.webUrl || collection.url || collection.sourceUrl || "").replace(/\/$/, "").toLowerCase();
}

export function mergeCollectionDefinitions(existing, imported) {
  const merged = (Array.isArray(existing) ? existing : []).map(normalizeCollection);
  let added = 0;
  let updated = 0;
  for (const incoming of Array.isArray(imported) ? imported : []) {
    const normalized = normalizeCollection(incoming);
    const source = comparableSource(normalized);
    const index = merged.findIndex((item) => item.id === normalized.id || (source && comparableSource(item) === source));
    if (index >= 0) {
      merged[index] = normalizeCollection({ ...merged[index], ...normalized, id: merged[index].id, collapsed: merged[index].collapsed });
      updated += 1;
    } else {
      if (merged.some((item) => item.id === normalized.id)) normalized.id = generateCollectionId();
      merged.push(normalized);
      added += 1;
    }
  }
  return { collections: merged, added, updated };
}
