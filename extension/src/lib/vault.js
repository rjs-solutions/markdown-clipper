// The write abstraction the rest of the app calls. Writes into the vault
// folder (File System Access API) when one is configured and writable;
// otherwise falls back to the existing chrome.downloads path unchanged.
//
// The handle-provider and downloader are injectable so tests can exercise
// both backends with fakes -- no real browser, no real showDirectoryPicker.

import { downloadText } from "./download.js";
import { loadHandle, ensurePermission } from "./vault-handle.js";
import { sanitizePathSegment, withMarkdownExtension } from "./slug.js";

function sanitizeFileName(name) {
  const base = String(name || "").replace(/\.md$/i, "");
  return withMarkdownExtension(sanitizePathSegment(base, { fallback: "clip" }));
}

function lastSegment(relativePath) {
  const segments = String(relativePath || "").split("/").filter(Boolean);
  return segments[segments.length - 1] || "clip.md";
}

// Creates any missing intermediate directories, then writes the file.
// Returns the sanitized { dirSegments, fileName } actually used, so tests can
// assert on what was created.
async function writeIntoVault(rootHandle, relativePath, content) {
  const rawSegments = String(relativePath || "").split("/").filter(Boolean);
  if (!rawSegments.length) {
    throw new Error("writeArtifact requires a non-empty relativePath");
  }
  const dirSegments = rawSegments.slice(0, -1).map((segment) => sanitizePathSegment(segment, { fallback: "folder" }));
  const fileName = sanitizeFileName(rawSegments[rawSegments.length - 1]);

  let dirHandle = rootHandle;
  for (const segment of dirSegments) {
    dirHandle = await dirHandle.getDirectoryHandle(segment, { create: true });
  }
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();

  return { dirSegments, fileName };
}

// { relativePath, content, saveAs } -> { backend: "vault" | "downloads", ok, path?, error? }
export async function writeArtifact(
  { relativePath, content, saveAs = false },
  { getHandle = loadHandle, checkPermission = ensurePermission, download = downloadText } = {}
) {
  const handle = await getHandle();
  if (handle) {
    const state = await checkPermission(handle, { interactive: false });
    if (state === "granted") {
      try {
        const written = await writeIntoVault(handle, relativePath, content);
        return { backend: "vault", ok: true, path: [...written.dirSegments, written.fileName].join("/") };
      } catch (error) {
        return { backend: "vault", ok: false, error: error && error.message ? error.message : String(error) };
      }
    }
  }

  try {
    await download(content, lastSegment(relativePath), { saveAs });
    return { backend: "downloads", ok: true, path: relativePath };
  } catch (error) {
    return { backend: "downloads", ok: false, error: error && error.message ? error.message : String(error) };
  }
}
