import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPageFiles, buildIndexMarkdown, buildAggregateMarkdown } from "../extension/src/lib/aggregate.js";

const PAGES = [
  { url: "https://x.com/sites/a/Home.aspx", title: "Home", markdown: "Welcome home.", metadata: { author: "Jane" } },
  { url: "https://x.com/sites/a/Plan.aspx", title: "Plan", markdown: "The plan.", metadata: {} }
];

test("buildPageFiles produces structure-preserving paths and composed content", () => {
  const files = buildPageFiles(PAGES);
  assert.deepEqual(files.map((f) => f.path), ["sites/a/Home.md", "sites/a/Plan.md"]);
  assert.match(files[0].content, /^---\n/);
  assert.match(files[0].content, /author: Jane/);
  assert.match(files[0].content, /# Home/);
  assert.match(files[0].content, /Welcome home\./);
});

test("buildPageFiles disambiguates colliding paths", () => {
  const pages = [
    { url: "https://x.com/a/Doc.aspx", title: "One", markdown: "1", metadata: {} },
    { url: "https://x.com/a/Doc.html", title: "Two", markdown: "2", metadata: {} }
  ];
  assert.deepEqual(buildPageFiles(pages).map((f) => f.path), ["a/Doc.md", "a/Doc-1.md"]);
});

test("buildIndexMarkdown links every file", () => {
  const files = buildPageFiles(PAGES);
  const index = buildIndexMarkdown(files, { siteTitle: "Team A" });
  assert.match(index, /# Team A/);
  assert.match(index, /\[Home\]\(sites\/a\/Home\.md\)/);
  assert.match(index, /\[Plan\]\(sites\/a\/Plan\.md\)/);
});

test("buildAggregateMarkdown has a TOC and per-page sections", () => {
  const md = buildAggregateMarkdown(PAGES, { siteTitle: "Team A" });
  assert.match(md, /## Contents/);
  assert.match(md, /\[Home\]\(#1-home\)/);
  assert.match(md, /## 1\. Home/);
  assert.match(md, /Source: https:\/\/x\.com\/sites\/a\/Home\.aspx/);
  assert.match(md, /The plan\./);
});
