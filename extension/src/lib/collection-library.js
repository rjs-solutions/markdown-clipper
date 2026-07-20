import { buildPageFiles, buildIndexMarkdown } from "./aggregate.js";
import { comparableUrl } from "./discover.js";
import { sanitizePathSegment, slugify } from "./slug.js";
import { encodePathForLink } from "./sitepath.js";

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

async function existingDirectoryAt(root, relativePath) {
  let directory = root;
  for (const segment of pathSegments(relativePath)) directory = await directory.getDirectoryHandle(segment);
  return directory;
}

async function directoryExists(root, relativePath) {
  try {
    await existingDirectoryAt(root, relativePath);
    return true;
  } catch (error) {
    if (error && error.name === "NotFoundError") return false;
    throw error;
  }
}

async function copyDirectoryContents(source, destination) {
  let fileCount = 0;
  for await (const [name, handle] of source.entries()) {
    if (handle.kind === "directory") {
      const child = await destination.getDirectoryHandle(name, { create: true });
      fileCount += await copyDirectoryContents(handle, child);
      continue;
    }
    const sourceFile = await handle.getFile();
    const content = await sourceFile.text();
    const destinationFile = await destination.getFileHandle(name, { create: true });
    const writable = await destinationFile.createWritable();
    await writable.write(content);
    await writable.close();
    if (await (await destinationFile.getFile()).text() !== content) throw new Error(`Could not verify ${name} after copying.`);
    fileCount += 1;
  }
  return fileCount;
}

async function removeDirectoryAt(root, relativePath) {
  const segments = pathSegments(relativePath);
  const name = segments.pop();
  const parent = segments.length ? await existingDirectoryAt(root, segments.join("/")) : root;
  await parent.removeEntry(name, { recursive: true });
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

async function readText(root, relativePath) {
  const segments = pathSegments(relativePath);
  const fileName = sanitizePathSegment(segments.pop(), { fallback: "file.md" });
  let directory = root;
  for (const segment of segments) directory = await directory.getDirectoryHandle(segment);
  const handle = await directory.getFileHandle(fileName);
  return (await handle.getFile()).text();
}

async function removeFile(root, relativePath) {
  const segments = pathSegments(relativePath);
  const fileName = sanitizePathSegment(segments.pop(), { fallback: "file.md" });
  let directory = root;
  for (const segment of segments) directory = await directory.getDirectoryHandle(segment);
  await directory.removeEntry(fileName);
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

function contentHash(content) {
  let hash = 2166136261;
  const text = String(content || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function pageHost(page) {
  try { return new URL(page.url).hostname.toLowerCase(); } catch { return "unknown-host"; }
}

function buildLibraryFiles(collection, pages, settings) {
  const options = { metadataStyle: settings.metadataStyle, includeTitleHeading: settings.includeTitleHeading };
  const hosts = new Set(pages.map(pageHost));
  if (collection.type !== "custom" || hosts.size < 2) return buildPageFiles(pages, options);
  const files = [];
  for (const host of hosts) {
    const prefix = sanitizePathSegment(host, { fallback: "unknown-host" });
    for (const file of buildPageFiles(pages.filter((page) => pageHost(page) === host), options)) {
      files.push({ ...file, path: `${prefix}/${file.path}` });
    }
  }
  return files;
}

export function loadCollectionLibraryManifest(root, collection) {
  return readJson(root, `${collectionLibraryPath(collection)}/${MANIFEST_FILE}`);
}

export async function moveCollectionLibraryFolder(root, collection, destinationPath) {
  if (!root) throw new Error("Choose a Local Collections Library folder first.");
  const from = collectionLibraryPath(collection);
  const to = normalizeLibraryPath(destinationPath);
  if (!to) throw new Error("Enter a destination subfolder.");
  if (from.toLowerCase() === to.toLowerCase()) throw new Error("Choose a different destination subfolder.");
  const fromPrefix = `${from.toLowerCase()}/`;
  const toPrefix = `${to.toLowerCase()}/`;
  if (to.toLowerCase().startsWith(fromPrefix) || from.toLowerCase().startsWith(toPrefix)) {
    throw new Error("Choose a destination outside the current folder.");
  }
  if (await directoryExists(root, to)) throw new Error("That destination folder already exists.");

  let source;
  try {
    source = await existingDirectoryAt(root, from);
  } catch (error) {
    if (error && error.name === "NotFoundError") throw new Error("The current collection folder was not found. Use the new path for future syncs instead.");
    throw error;
  }

  const destination = await directoryAt(root, to);
  let fileCount;
  try {
    fileCount = await copyDirectoryContents(source, destination);
    const manifest = await readJson(root, `${to}/${MANIFEST_FILE}`);
    if (manifest) {
      manifest.folder = to;
      await writeText(root, `${to}/${MANIFEST_FILE}`, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  } catch (error) {
    try { await removeDirectoryAt(root, to); } catch { /* Preserve the original copy error. */ }
    throw error;
  }
  await removeDirectoryAt(root, from);
  return { from, to, fileCount };
}

export async function reviewRemovedCollectionFile(root, collection, relativePath, action, { reviewedAt = Date.now() } = {}) {
  if (!['archive', 'delete'].includes(action)) throw new Error("Choose Archive or Delete.");
  const folder = collectionLibraryPath(collection);
  const manifest = await loadCollectionLibraryManifest(root, collection);
  const normalized = normalizeLibraryPath(relativePath);
  if (!manifest || !manifest.removedFromPreviousSync?.includes(normalized)) throw new Error("That file is not awaiting review.");
  if (action === "archive") {
    const date = new Date(reviewedAt).toISOString().slice(0, 10);
    const content = await readText(root, `${folder}/${normalized}`);
    await writeText(root, `${folder}/_archive/${date}/${normalized}`, content);
  }
  await removeFile(root, `${folder}/${normalized}`);
  manifest.removedFromPreviousSync = manifest.removedFromPreviousSync.filter((path) => path !== normalized);
  manifest.reviewedRemoved = [...(manifest.reviewedRemoved || []), { path: normalized, action, reviewedAt: new Date(reviewedAt).toISOString() }];
  await writeText(root, `${folder}/${MANIFEST_FILE}`, `${JSON.stringify(manifest, null, 2)}\n`);
  return { path: normalized, action, remaining: manifest.removedFromPreviousSync.length };
}

export async function writeCollectionLibraryCatalog(root, collections) {
  const entries = [];
  for (const collection of Array.isArray(collections) ? collections : []) {
    const manifest = await loadCollectionLibraryManifest(root, collection);
    if (manifest) entries.push({ collection, manifest });
  }
  const lines = ["# Markdown Clipper Collections", "", `${entries.length} synced collection${entries.length === 1 ? "" : "s"}.`, "", "| Collection | Type | Pages | Last synced |", "| --- | --- | ---: | --- |"];
  for (const { collection, manifest } of entries) {
    const link = `${encodePathForLink(collectionLibraryPath(collection))}/index.md`;
    lines.push(`| [${String(collection.name).replace(/\|/g, "\\|")}](${link}) | ${collection.type} | ${manifest.files?.length || 0} | ${manifest.syncedAt || ""} |`);
  }
  const data = entries.map(({ collection, manifest }) => ({
    id: collection.id,
    name: collection.name,
    type: collection.type,
    folder: collectionLibraryPath(collection),
    sourceUrl: collection.sourceUrl || collection.webUrl || collection.url || "",
    pageCount: manifest.files?.length || 0,
    syncedAt: manifest.syncedAt || null
  }));
  await writeText(root, "_collections.md", `${lines.join("\n")}\n`);
  await writeText(root, "_collections.json", `${JSON.stringify({ version: 1, collections: data }, null, 2)}\n`);
  return { count: entries.length, collections: data };
}

function syncReport(collection, files, removed, syncedAt, {
  updatedCount = files.length,
  unchangedCount = 0,
  retainedCount = 0,
  captureFailureCount = 0
} = {}) {
  const lines = [
    `# ${collection.name} sync report`,
    "",
    `Last synced: ${new Date(syncedAt).toISOString()}`,
    "",
    `Current pages: ${files.length}`,
    `Updated files: ${updatedCount}`,
    `Unchanged files: ${unchangedCount}`,
    `Retained after capture issues: ${retainedCount}`,
    `Capture failures: ${captureFailureCount}`,
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

export async function syncCollectionToLibrary(root, collection, pages, settings = {}, {
  syncedAt = Date.now(),
  expectedUrls = null,
  captureErrors = []
} = {}) {
  if (!root) throw new Error("Choose a Local Collections Library folder first.");
  if (!collection || !collection.id) throw new Error("Save or select a collection before syncing it locally.");
  const folder = collectionLibraryPath(collection);
  const files = buildLibraryFiles(collection, pages, settings);
  const previous = await readJson(root, `${folder}/${MANIFEST_FILE}`);
  const previousFiles = Array.isArray(previous && previous.files) ? previous.files : [];
  const previousByUrl = new Map(previousFiles
    .filter((file) => file && typeof file === "object" && file.url)
    .map((file) => [comparableUrl(file.url), file]));
  const expectedSet = Array.isArray(expectedUrls)
    ? new Set(expectedUrls.map(comparableUrl).filter(Boolean))
    : null;
  const capturedSet = new Set(files.map((file) => comparableUrl(file.url)).filter(Boolean));
  const errorByUrl = new Map((Array.isArray(captureErrors) ? captureErrors : [])
    .filter((entry) => entry?.url)
    .map((entry) => [comparableUrl(entry.url), entry.error || "Capture failed"]));

  let updatedCount = 0;
  let unchangedCount = 0;
  for (const file of files) {
    file.contentHash = contentHash(file.content);
    const old = previousByUrl.get(comparableUrl(file.url));
    if (old && old.path === file.path && old.contentHash === file.contentHash) {
      unchangedCount += 1;
    } else {
      await writeText(root, `${folder}/${file.path}`, file.content);
      updatedCount += 1;
    }
  }

  // When an authoritative current inventory is available, retain the last
  // good local file for any expected URL that failed capture. Absence from a
  // successful result alone is not proof that the source page was deleted.
  const retainedFiles = expectedSet
    ? previousFiles.filter((file) => (
        file && typeof file === "object" && file.url &&
        expectedSet.has(comparableUrl(file.url)) &&
        !capturedSet.has(comparableUrl(file.url))
      ))
    : [];
  const retainedEntries = retainedFiles.map((file) => ({
    ...file,
    captureStatus: errorByUrl.has(comparableUrl(file.url)) ? "error" : "retained",
    captureError: errorByUrl.get(comparableUrl(file.url)) || "No current page body was available"
  }));
  const currentPaths = new Set([...files.map((file) => file.path), ...retainedEntries.map((file) => file.path)]);
  const newlyRemoved = previousFiles
    .filter((file) => {
      const path = typeof file === "string" ? file : file?.path;
      if (!path || currentPaths.has(path)) return false;
      if (!expectedSet || typeof file === "string" || !file.url) return true;
      return !expectedSet.has(comparableUrl(file.url));
    })
    .map((file) => typeof file === "string" ? file : file.path);
  const priorPending = Array.isArray(previous?.removedFromPreviousSync) ? previous.removedFromPreviousSync : [];
  const removed = [...new Set([...priorPending, ...newlyRemoved])].filter((path) => path && !currentPaths.has(path));
  const manifestFiles = [
    ...files.map((file) => ({ path: file.path, url: file.url, title: file.title || "", contentHash: file.contentHash })),
    ...retainedEntries
  ];

  await writeText(root, `${folder}/index.md`, buildIndexMarkdown([...files, ...retainedEntries], { siteTitle: collection.name }));
  await writeText(root, `${folder}/${REPORT_FILE}`, syncReport(collection, manifestFiles, removed, syncedAt, {
    updatedCount,
    unchangedCount,
    retainedCount: retainedEntries.length,
    captureFailureCount: errorByUrl.size
  }));

  const manifest = {
    version: 1,
    collectionId: collection.id,
    name: collection.name,
    type: collection.type,
    sourceUrl: collection.sourceUrl || collection.webUrl || collection.url || "",
    folder,
    syncedAt: new Date(syncedAt).toISOString(),
    files: manifestFiles,
    removedFromPreviousSync: removed,
    reviewedRemoved: Array.isArray(previous?.reviewedRemoved) ? previous.reviewedRemoved : []
  };
  await writeText(root, `${folder}/${MANIFEST_FILE}`, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    folder,
    filesWritten: updatedCount + 3,
    pageCount: manifestFiles.length,
    capturedCount: files.length,
    retainedCount: retainedEntries.length,
    updatedCount,
    unchangedCount,
    removed,
    manifest
  };
}
