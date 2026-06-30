// Map page URLs to structure-preserving relative Markdown paths for an archive.
// Pure -- unit-tested.

import { sanitizePathSegment } from "./slug.js";

function safeDecode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

// e.g. https://x.sharepoint.com/sites/team/SitePages/Plan.aspx
//   -> "sites/team/SitePages/Plan.md"
export function toRelativeMarkdownPath(url, { fallback = "page" } = {}) {
  let pathname = "/";
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = "/";
  }
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "index.md";
  }
  const folder = segments.slice(0, -1).map((segment) => sanitizePathSegment(safeDecode(segment), { fallback }));
  const lastRaw = safeDecode(segments[segments.length - 1]).replace(/\.[a-z0-9]+$/i, "");
  const fileBase = sanitizePathSegment(lastRaw, { fallback }) || fallback;
  return [...folder, `${fileBase}.md`].join("/");
}

// Ensure path uniqueness within an archive, appending -1, -2, ... on collision.
export function uniquePath(path, used) {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const dot = path.lastIndexOf(".");
  const base = dot >= 0 ? path.slice(0, dot) : path;
  const ext = dot >= 0 ? path.slice(dot) : "";
  let index = 1;
  let candidate;
  do {
    candidate = `${base}-${index}${ext}`;
    index += 1;
  } while (used.has(candidate));
  used.add(candidate);
  return candidate;
}

// Encode a relative path for use in a Markdown link (keep "/").
export function encodePathForLink(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}
