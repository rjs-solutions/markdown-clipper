import { buildPageFiles, buildIndexMarkdown } from "./aggregate.js";
import { sanitizePathSegment, slugify } from "./slug.js";

const MANIFEST_FILE = "collection.json";
const REPORT_FILE = "_sync-report.md";

function pathSegments(input) {
  return String(input || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..");
}

export function normalizeLibraryPath(input) {
  return pathSegments(input)
    .map((part) => sanitizePathSegment(part, { fallback: "folder" }))
    .join("/");
}

export function collectionLibraryPath(collection) {
  const custom = normalizeLibraryPath(collection && collection.libraryPath);
  if (custom) return custom;
  const type = sanitizePathSegment(collection && collection.type || "collection", { fallback: "collection" });
  const name = slugify(collection && collection.name, { fallback: "collection" });
  return `${type}/${name}`;
}

export function uniqueCollectionLibraryPath(collection, collections) {
  const base = collectionLibraryPath(collection);
  const used = new Set((Array.isArray(collections) ? collections : [])
    .filter((item) => item && item.id !== collection.id)
    .map(collectionLibraryPath)
    .map((path) => path.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  let counter = 2;
  while (used.has(`${base}-${counter}`.toLowerCase())) counter += 1;
  return `${base}-${counter}`;
}

async function directoryAt(root, relativePath) {
  let directory = root;
  for (const segment of pathSegments(relativePath)) {
    directory = await directory.getDirectoryHandle(sanitizePathSegment(segment, { fallback: "folder" }), { create: true });
  }
  return directory;
}

async function writeText(root, relativePath, content) {
  const segments = pathSegments(relativePath);
  const fileName = sanitizePathSegment(segments.pop(), { fallback: "file.md" });
  const directory = await directoryAt(root, segments.join("/"));
  const handle = await directory.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(String(content));
  await writable.close();
}

async function readJson(root, relativePath) {
  try {
    const segments = pathSegments(relativePath);
    const fileName = sanitizePathSegment(segments.pop(), { fallback: MANIFEST_FILE });
    let directory = root;
    for (const segment of segments) directory = await directory.getDirectoryHandle(segment);
    const handle = await directory.getFileHandle(fileName);
    return JSON.parse(await (await handle.getFile()).text());
  } catch {
    return null;
  }
}

function syncReport(collection, files, removed, syncedAt) {
  const lines = [
    `# ${collection.name} sync report`,
    "",
    `Last synced: ${new Date(syncedAt).toISOString()}`,
    "",
    `Current pages: ${files.length}`,
    `No longer present: ${removed.length}`,
    ""
  ];
  if (removed.length) {
    lines.push("## No longer present", "", "These files were not deleted. Review them before removing local content.", "");
    for (const path of removed) lines.push(`- \`${path}\``);
    lines.push("");
  }
  return lines.join("\n");
}

export async function syncCollectionToLibrary(root, collection, pages, settings = {}, { syncedAt = Date.now() } = {}) {
  if (!root) throw new Error("Choose a Local Collections Library folder first.");
  if (!collection || !collection.id) throw new Error("Save or select a collection before syncing it locally.");
  const folder = collectionLibraryPath(collection);
  const files = buildPageFiles(pages, {
    metadataStyle: settings.metadataStyle,
    includeTitleHeading: settings.includeTitleHeading
  });
  const previous = await readJson(root, `${folder}/${MANIFEST_FILE}`);
  const currentPaths = new Set(files.map((file) => file.path));
  const removed = Array.isArray(previous && previous.files)
    ? previous.files.map((file) => typeof file === "string" ? file : file.path).filter((path) => path && !currentPaths.has(path))
    : [];

  for (const file of files) await writeText(root, `${folder}/${file.path}`, file.content);
  await writeText(root, `${folder}/index.md`, buildIndexMarkdown(files, { siteTitle: collection.name }));
  await writeText(root, `${folder}/${REPORT_FILE}`, syncReport(collection, files, removed, syncedAt));

  const manifest = {
    version: 1,
    collectionId: collection.id,
    name: collection.name,
    type: collection.type,
    sourceUrl: collection.sourceUrl || collection.webUrl || collection.url || "",
    folder,
    syncedAt: new Date(syncedAt).toISOString(),
    files: files.map((file) => ({ path: file.path, url: file.url, title: file.title || "" })),
    removedFromPreviousSync: removed
  };
  await writeText(root, `${folder}/${MANIFEST_FILE}`, `${JSON.stringify(manifest, null, 2)}\n`);
  return { folder, filesWritten: files.length + 3, pageCount: files.length, removed, manifest };
}
