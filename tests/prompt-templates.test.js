import { test } from "node:test";
import assert from "node:assert/strict";
import { TASK_PRESETS, buildPrompt } from "../extension/src/lib/prompt-templates.js";

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

test("TASK_PRESETS lists exactly synthesis, comparison, and gap in order", () => {
  assert.deepEqual(
    TASK_PRESETS.map((preset) => preset.id),
    ["synthesis", "comparison", "gap"]
  );
});

for (const preset of ["synthesis", "comparison", "gap"]) {
  test(`buildPrompt(${preset}) includes the task text, inventory table, vault name, and citation instruction`, () => {
    const prompt = buildPrompt(preset, RECORDS, { vaultName: "MyVault" });
    const expectedTaskText = TASK_PRESETS.find((p) => p.id === preset).taskText;
    assert.ok(prompt.includes(expectedTaskText), "expected the preset's task text");
    assert.match(prompt, /\| # \| title \| file \| source_url \| clipped \| tags \|/);
    assert.ok(prompt.includes("VAULT: MyVault"));
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

test("buildPrompt without a vaultName falls back to a generic phrase", () => {
  const prompt = buildPrompt("synthesis", RECORDS);
  assert.ok(prompt.includes("VAULT: your clip folder"));
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
  assert.match(prompt, /vault is empty/i);
  assert.equal(prompt.includes("| # | title"), false, "no inventory table when there are no records");
});

test("buildPrompt with an unknown taskId falls back to the default preset instead of throwing", () => {
  const prompt = buildPrompt("not-a-real-task", RECORDS, { vaultName: "MyVault" });
  const defaultTaskText = TASK_PRESETS[0].taskText;
  assert.ok(prompt.includes(defaultTaskText), "expected the default preset's task text");
});
