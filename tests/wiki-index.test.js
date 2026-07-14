import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWikiIndexMarkdown } from "../extension/src/lib/wiki-index.js";

const RECORDS = [
  {
    title: "Older Clip",
    path: "articles/older-clip.md",
    url: "https://example.com/older",
    clipped: "2026-01-01T10:00:00.000Z",
    type: "article",
    tags: ["ai", "notes"]
  },
  {
    title: "Newer Clip",
    path: "sites/team/plan.md",
    url: "https://x.sharepoint.com/sites/team/plan",
    clipped: "2026-06-01T10:00:00.000Z",
    type: "sharepoint",
    tags: []
  }
];

test("buildWikiIndexMarkdown produces an H1, a summary line, and a table row per record", () => {
  const md = buildWikiIndexMarkdown(RECORDS, { title: "My Vault" });
  assert.match(md, /^# My Vault\n/);
  assert.match(md, /2 clips\./);
  assert.match(md, /\| title \| path \| source_url \| clipped \| type \| tags \|/);
  assert.match(md, /\| Older Clip \| articles\/older-clip\.md \| https:\/\/example\.com\/older \| 2026-01-01 \| article \| ai, notes \|/);
  assert.match(md, /\| Newer Clip \| sites\/team\/plan\.md \| https:\/\/x\.sharepoint\.com\/sites\/team\/plan \| 2026-06-01 \| sharepoint \|  \|/);
});

test("buildWikiIndexMarkdown sorts newest-first regardless of input order", () => {
  const md = buildWikiIndexMarkdown(RECORDS);
  const olderIndex = md.indexOf("Older Clip");
  const newerIndex = md.indexOf("Newer Clip");
  assert.ok(newerIndex < olderIndex, "the newer clip should be listed before the older one");
});

test("buildWikiIndexMarkdown handles an empty log without crashing", () => {
  const md = buildWikiIndexMarkdown([]);
  assert.match(md, /^# Knowledge base\n/);
  assert.match(md, /0 clips\./);
  assert.match(md, /\| title \| path \| source_url \| clipped \| type \| tags \|/);
  const rows = md.split("\n").filter((line) => line.startsWith("|"));
  assert.equal(rows.length, 2, "just the header and separator rows, no data rows");
});

test("buildWikiIndexMarkdown escapes pipes and newlines in titles and tags so the table isn't broken", () => {
  const md = buildWikiIndexMarkdown([
    {
      title: "Title | with a pipe\nand a newline",
      path: "a.md",
      url: "https://example.com/a",
      clipped: "2026-01-01T00:00:00.000Z",
      type: "article",
      tags: ["tag|one", "tag two"]
    }
  ]);
  const dataLine = md.split("\n").find((line) => line.startsWith("| Title"));
  assert.ok(dataLine, "expected the escaped data row to be present");
  assert.equal((dataLine.match(/(?<!\\)\|/g) || []).length, 7, "6 escaped-pipe-safe columns -> 7 unescaped delimiter pipes");
  assert.equal(dataLine.includes("\n"), false);
  assert.match(dataLine, /Title \\\| with a pipe and a newline/);
  assert.match(dataLine, /tag\\\|one, tag two/);
});

test("buildWikiIndexMarkdown falls back gracefully when clipped is missing or unparseable", () => {
  const md = buildWikiIndexMarkdown([
    { title: "No Date", path: "a.md", url: "https://example.com/a", type: "article" }
  ]);
  assert.match(md, /\| No Date \| a\.md \| https:\/\/example\.com\/a \|  \| article \|  \|/);
});
