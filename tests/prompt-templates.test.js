import { test } from "node:test";
import assert from "node:assert/strict";
import { TASK_PRESETS, buildPrompt, recordsFromCollectionManifest } from "../extension/src/lib/prompt-templates.js";

const RECORDS = [
  {
    title: "Newer Clip",
    path: "sites/team/plan.md",
    url: "https://x.sharepoint.com/sites/team/plan",
    clipped: "2026-06-01T10:00:00.000Z",
    type: "sharepoint",
    tags: ["roadmap"]
  },
  {
    title: "Older Clip",
    path: "articles/older-clip.md",
    url: "https://example.com/older",
    clipped: "2026-01-01T10:00:00.000Z",
    type: "article",
    tags: ["ai", "notes"]
  }
];

test("TASK_PRESETS lists the stable ids with clear category-and-purpose labels", () => {
  assert.deepEqual(
    TASK_PRESETS.map((preset) => preset.id),
    ["synthesis", "comparison", "gap"]
  );
  assert.deepEqual(
    TASK_PRESETS.map((preset) => preset.label),
    [
      "Aggregate — Group clips into themes",
      "Timeline — Trace changes over time",
      "Coverage review — Find gaps and duplicates"
    ]
  );
});

for (const preset of ["synthesis", "comparison", "gap"]) {
  test(`buildPrompt(${preset}) includes the task text, inventory table, vault name, and citation instruction`, () => {
    const prompt = buildPrompt(preset, RECORDS, { vaultName: "MyVault" });
    const expectedTaskText = TASK_PRESETS.find((p) => p.id === preset).taskText;
    assert.ok(prompt.includes(expectedTaskText), "expected the preset's task text");
    assert.match(prompt, /\| # \| title \| file \| source_url \| clipped \| tags \|/);
    assert.ok(prompt.includes("SOURCE FOLDER: MyVault"));
    assert.match(prompt, /ask the user to attach the files or grant access/i);
    assert.match(prompt, /source_url/);
    assert.match(prompt, /does NOT cover/);
  });
}

test("buildPrompt inventory table has one row per record, newest-first order preserved from the input", () => {
  const prompt = buildPrompt("synthesis", RECORDS, { vaultName: "MyVault" });
  const newerIndex = prompt.indexOf("Newer Clip");
  const olderIndex = prompt.indexOf("Older Clip");
  assert.ok(newerIndex > -1 && olderIndex > -1, "expected both records in the prompt");
  assert.ok(newerIndex < olderIndex, "expected the input order (newest-first) to be preserved");
  const rows = prompt.split("\n").filter((line) => line.startsWith("| 1") || line.startsWith("| 2"));
  assert.equal(rows.length, 2, "expected exactly one data row per record");
});

test("buildPrompt without a known folder says the location is not configured", () => {
  const prompt = buildPrompt("synthesis", RECORDS);
  assert.match(prompt, /SOURCE FOLDER: Not configured/);
  assert.match(prompt, /different download locations/);
});

test("buildPrompt describes a collection scope and its relative library folder honestly", () => {
  const prompt = buildPrompt("synthesis", RECORDS, {
    sourceLabel: "Saved collection — CMC AI Central",
    folderReference: "Markdown Library/sharepoint/cmc-ai-central",
    folderNote: "Chrome does not expose the full operating-system path."
  });
  assert.match(prompt, /SCOPE: Saved collection — CMC AI Central/);
  assert.match(prompt, /SOURCE FOLDER: Markdown Library\/sharepoint\/cmc-ai-central/);
  assert.match(prompt, /Chrome does not expose the full operating-system path/);
});

test("recordsFromCollectionManifest builds file inventory relative to the selected collection folder without inventing clip dates", () => {
  const records = recordsFromCollectionManifest(
    { type: "sharepoint" },
    {
      folder: "sharepoint/cmc-ai-central",
      syncedAt: "2026-07-16T12:00:00.000Z",
      files: [{ path: "SitePages/Home.md", title: "Home", url: "https://example.com/home" }]
    }
  );
  assert.deepEqual(records, [{
    title: "Home",
    path: "SitePages/Home.md",
    url: "https://example.com/home",
    clipped: "",
    type: "sharepoint",
    tags: []
  }]);
});

test("buildPrompt escapes an adversarial title (pipe + newline) and tag (pipe) without fracturing the table", () => {
  const prompt = buildPrompt("synthesis", [
    {
      title: "Title | with a pipe\nand a newline",
      path: "a.md",
      url: "https://example.com/a",
      clipped: "2026-01-01T00:00:00.000Z",
      type: "article",
      tags: ["tag|one", "tag two"]
    }
  ]);
  const dataLine = prompt.split("\n").find((line) => line.startsWith("| 1"));
  assert.ok(dataLine, "expected the escaped data row to be present");
  assert.equal(dataLine.includes("\n"), false, "the row must stay on a single line");
  assert.match(dataLine, /Title \\\| with a pipe and a newline/);
  assert.match(dataLine, /tag\\\|one, tag two/);
  assert.equal((dataLine.match(/(?<!\\)\|/g) || []).length, 7, "6 escaped-pipe-safe columns -> 7 unescaped delimiter pipes");
});

test("buildPrompt with empty records produces an empty-vault prompt, no malformed table", () => {
  const prompt = buildPrompt("synthesis", []);
  assert.match(prompt, /selected scope is empty/i);
  assert.equal(prompt.includes("| # | title"), false, "no inventory table when there are no records");
});

test("buildPrompt with an unknown taskId falls back to the default preset instead of throwing", () => {
  const prompt = buildPrompt("not-a-real-task", RECORDS, { vaultName: "MyVault" });
  const defaultTaskText = TASK_PRESETS[0].taskText;
  assert.ok(prompt.includes(defaultTaskText), "expected the default preset's task text");
});
