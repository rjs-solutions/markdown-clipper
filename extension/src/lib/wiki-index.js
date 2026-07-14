// Build the vault's index.md manifest from clip-log records (see
// clip-log.js:listClips()). Pure -- unit-tested; no DOM, no chrome APIs.
//
// This is a sibling to aggregate.js:buildIndexMarkdown, not a replacement for
// it. buildIndexMarkdown links the files produced by a single crawl export
// (title + relative path only, one export at a time). This manifest covers
// the whole vault across every clip ever made (single pages and crawls,
// mixed content types), and docs/llm-vault-design.md specifies a richer
// table (source_url, capture date, content type, tags) that a crawl export
// doesn't have inputs for. Keeping them separate, small, single-purpose
// formatters is simpler than bolting vault-only columns onto the crawl
// helper; both stay pure functions over plain data, so they read the same
// way even though the shapes differ.

function escapeCell(value) {
  return String(value == null ? "" : value)
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

function formatTags(tags) {
  if (!Array.isArray(tags) || !tags.length) {
    return "";
  }
  return tags.map((tag) => escapeCell(tag)).join(", ");
}

function formatClipped(clipped) {
  if (!clipped) {
    return "";
  }
  const date = new Date(clipped);
  return Number.isNaN(date.getTime()) ? escapeCell(clipped) : date.toISOString().slice(0, 10);
}

// records: clip-log entries, newest-first (listClips()'s own order; this
// function re-sorts defensively so callers don't have to care).
export function buildWikiIndexMarkdown(records = [], { title = "Knowledge base", description = "" } = {}) {
  const sorted = [...records].sort(
    (a, b) => new Date(b.clipped).getTime() - new Date(a.clipped).getTime()
  );
  const summary = description || `${sorted.length} clip${sorted.length === 1 ? "" : "s"}.`;

  const lines = [
    `# ${title}`,
    "",
    summary,
    "",
    "| title | path | source_url | clipped | type | tags |",
    "| --- | --- | --- | --- | --- | --- |"
  ];
  for (const record of sorted) {
    lines.push(
      `| ${escapeCell(record.title)} | ${escapeCell(record.path)} | ${escapeCell(record.url)} | ` +
        `${formatClipped(record.clipped)} | ${escapeCell(record.type)} | ${formatTags(record.tags)} |`
    );
  }
  return `${lines.join("\n")}\n`;
}
