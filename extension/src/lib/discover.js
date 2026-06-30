// URL discovery helpers for site export. Pure parsing.

export function parseUrlList(text) {
  return [...new Set(
    String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^https?:\/\//i.test(line))
  )];
}

function decodeXmlEntities(value) {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Parse a sitemap or sitemap index. Returns { pages, sitemaps }: for a
// <sitemapindex>, locs are nested sitemaps; otherwise they are page URLs.
export function parseSitemap(xml) {
  const text = String(xml || "");
  const locs = [...text.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) =>
    decodeXmlEntities(match[1].trim())
  );
  if (/<sitemapindex[\s>]/i.test(text)) {
    return { pages: [], sitemaps: locs };
  }
  return { pages: locs, sitemaps: [] };
}

export function sameHost(a, b) {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return false;
  }
}

// Normalize for de-duplication: drop the hash, lowercase the host.
export function comparableUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.href;
  } catch {
    return String(url || "");
  }
}
