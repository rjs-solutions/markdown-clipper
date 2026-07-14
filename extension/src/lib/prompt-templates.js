// Build a ready-to-paste prompt for an LLM (Claude/ChatGPT with filesystem
// access) to analyze a clipped vault. Pure -- unit-tested; no DOM, no chrome
// APIs. The extension can't read file contents on disk, so the prompt
// supplies the inventory inline from the clip log (see clip-log.js:listClips)
// and tells the LLM to read the actual files itself.
//
// The File System Access API only exposes a directory NAME, never a full OS
// path, so the prompt refers to the vault by name (or a generic phrase when
// no vault is configured) plus the relative paths already in the inventory.

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

export const TASK_PRESETS = [
  {
    id: "synthesis",
    label: "Synthesis",
    description: "Group sources into themes and summarize key points.",
    taskText:
      "Group the clipped sources into 3 to 5 themes. For each theme: name the sources, " +
      "summarize the key points, and cite the source_url from each file's frontmatter."
  },
  {
    id: "comparison",
    label: "Comparison",
    description: "Build a timeline of how the topic evolved across the capture window.",
    taskText:
      "Build a timeline of how the topic evolved across the capture window using each " +
      "file's clipped date. Note what changed and cite the source_url for each shift."
  },
  {
    id: "gap",
    label: "Gap / duplication",
    description: "Find near-duplicate content and coverage gaps.",
    taskText:
      "Find near-duplicate or contradictory content across the sources (especially pages " +
      "from the same site). List coverage gaps. Cite source_url for every claim."
  }
];

const DEFAULT_TASK_ID = TASK_PRESETS[0].id;

function findPreset(taskId) {
  return TASK_PRESETS.find((preset) => preset.id === taskId);
}

function buildInventoryTable(records) {
  const lines = ["| # | title | file | source_url | clipped | tags |", "| --- | --- | --- | --- | --- | --- |"];
  records.forEach((record, index) => {
    lines.push(
      `| ${index + 1} | ${escapeCell(record.title)} | ${escapeCell(record.path)} | ` +
        `${escapeCell(record.url)} | ${formatClipped(record.clipped)} | ${formatTags(record.tags)} |`
    );
  });
  return lines.join("\n");
}

// records: clip-log entries, in the order they should be numbered (callers
// typically pass listClips()'s own newest-first order).
export function buildPrompt(taskId, records = [], { vaultName } = {}) {
  const preset = findPreset(taskId) || findPreset(DEFAULT_TASK_ID);
  const vaultLabel = vaultName || "your clip folder";
  const list = Array.isArray(records) ? records : [];

  const lines = [
    "You are analyzing a local knowledge vault of clipped pages. Read the actual files " +
      "on disk before answering; the table below is an index, not a substitute for the content.",
    "",
    `VAULT: ${vaultLabel}`,
    "Read the files listed below, starting with index.md if present, and use each file's " +
      "frontmatter source_url when citing a source.",
    ""
  ];

  if (!list.length) {
    lines.push(
      "The vault is empty. No files have been clipped yet, so there is nothing to analyze. " +
        "Tell the user to clip some pages first."
    );
    return lines.join("\n");
  }

  lines.push("INVENTORY", "", buildInventoryTable(list), "", "TASK", "", preset.taskText, "");
  lines.push(
    "Also flag what the vault does NOT cover: gaps in the topic that none of the listed " +
      "files address."
  );
  return lines.join("\n");
}
