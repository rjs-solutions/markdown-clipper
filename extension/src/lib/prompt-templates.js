// Build a ready-to-paste prompt for an LLM (Claude/ChatGPT with filesystem
// access) to analyze a clipped vault. Pure -- unit-tested; no DOM, no chrome
// APIs. The extension can't read file contents on disk, so the prompt
// supplies the inventory inline from the clip log (see clip-log.js:listClips)
// and tells the LLM to read the actual files itself.
//
// The File System Access API only exposes a directory NAME, never a full OS
// path. Callers therefore supply an honest source label and folder reference
// rather than implying that the extension knows an absolute filesystem path.

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
    label: "Aggregate — Group clips into themes",
    description: "Organize the selected clips into themes and summarize their key points.",
    taskText:
      "Group the clipped sources into 3 to 5 themes. For each theme: name the sources, " +
      "summarize the key points, and cite the source_url from each file's frontmatter."
  },
  {
    id: "comparison",
    label: "Timeline — Trace changes over time",
    description: "Show how the topic evolved across the selected capture window.",
    taskText:
      "Build a timeline of how the topic evolved across the capture window using each " +
      "file's clipped date. Note what changed and cite the source_url for each shift."
  },
  {
    id: "gap",
    label: "Coverage review — Find gaps and duplicates",
    description: "Identify overlapping, contradictory, or missing coverage.",
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

export function recordsFromCollectionManifest(collection, manifest) {
  const files = Array.isArray(manifest && manifest.files) ? manifest.files : [];
  return files.map((file) => ({
    title: file.title || file.path || "Untitled page",
    path: file.path || "",
    url: file.url || "",
    clipped: "",
    type: collection && collection.type || "collection",
    tags: []
  }));
}

// records: clip-log entries, in the order they should be numbered (callers
// typically pass listClips()'s own newest-first order).
export function buildPrompt(taskId, records = [], {
  vaultName,
  sourceLabel = "All saved clips",
  folderReference,
  folderNote
} = {}) {
  const preset = findPreset(taskId) || findPreset(DEFAULT_TASK_ID);
  const folderLabel = folderReference || vaultName || "Not configured; clips may be in different download locations";
  const locationNote = folderNote || (vaultName
    ? "Chrome exposes the selected folder name, not its full operating-system path."
    : "The extension does not know a common folder for these clip-history records.");
  const list = Array.isArray(records) ? records : [];

  const lines = [
    "You are analyzing local Markdown files created from clipped pages. Read the actual files " +
      "on disk before answering; the table below is an index, not a substitute for the content.",
    "",
    `SCOPE: ${sourceLabel}`,
    `SOURCE FOLDER: ${folderLabel}`,
    `LOCATION NOTE: ${locationNote}`,
    "If the files or source folder are not already available in your environment, ask the user " +
      "to attach the files or grant access to that folder before analyzing them. Do not claim to " +
      "have read files you cannot access.",
    "",
    "Read the files listed below, starting with index.md if present, and use each file's " +
      "frontmatter source_url when citing a source.",
    ""
  ];

  if (!list.length) {
    lines.push(
      "The selected scope is empty. No files are available to analyze. " +
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
