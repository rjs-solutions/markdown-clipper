export function normalizeFingerprintContent(markdown) {
  return String(markdown || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");
}

export function fingerprintMarkdown(markdown) {
  const content = normalizeFingerprintContent(markdown);
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function compareMarkdownFingerprint(storedFingerprint, currentMarkdown) {
  if (!storedFingerprint) return "unknown";
  return storedFingerprint === fingerprintMarkdown(currentMarkdown) ? "current" : "changed";
}
