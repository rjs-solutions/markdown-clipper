// Filename / slug helpers. Pure -- unit-tested.

// Remove Unicode combining marks (U+0300..U+036F) left after NFKD normalization.
function stripCombiningMarks(text) {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code >= 0x0300 && code <= 0x036f) {
      continue;
    }
    out += ch;
  }
  return out;
}

// URL- and filename-friendly slug.
export function slugify(value, { maxLength = 80, fallback = "page" } = {}) {
  const slug = stripCombiningMarks(String(value || "").normalize("NFKD"))
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || fallback;
}

// Make a string safe as a single file/folder name on Windows, macOS, and Linux.
// Preserves spaces and case; only strips characters that are illegal in paths
// (path separators, the Windows-reserved set, and control characters).
export function sanitizeFilename(name, { fallback = "page", maxLength = 120 } = {}) {
  const illegal = "\\/:*?\"<>|";
  let cleaned = "";
  for (const ch of String(name || "")) {
    if (ch.codePointAt(0) < 0x20 || illegal.includes(ch)) {
      cleaned += " ";
    } else {
      cleaned += ch;
    }
  }
  cleaned = cleaned
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, maxLength)
    .replace(/[. ]+$/g, "");
  return cleaned || fallback;
}

// Reserved Windows device names that cannot be used as a bare filename.
const RESERVED = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9"
]);

// Sanitize one path segment (no separators) for use inside an export archive.
export function sanitizePathSegment(segment, { fallback = "page" } = {}) {
  const cleaned = sanitizeFilename(segment, { fallback });
  if (RESERVED.has(cleaned.toLowerCase())) {
    return `_${cleaned}`;
  }
  return cleaned;
}

// Ensure a name ends with `.md`.
export function withMarkdownExtension(name) {
  return /\.md$/i.test(name) ? name : `${name}.md`;
}
