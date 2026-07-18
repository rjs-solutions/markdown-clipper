import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPageFiles, buildIndexMarkdown, buildAggregateMarkdown, buildAggregateParts } from "../extension/src/lib/aggregate.js";

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

test("buildAggregateParts joined is byte-identical to buildAggregateMarkdown", () => {
  const md = buildAggregateMarkdown(PAGES, { siteTitle: "Team A" });
  const joined = buildAggregateParts(PAGES, { siteTitle: "Team A" }).join("");
  assert.equal(joined, md);
});

test("buildAggregateParts joined is byte-identical to buildAggregateMarkdown (default title)", () => {
  const md = buildAggregateMarkdown(PAGES);
  const joined = buildAggregateParts(PAGES).join("");
  assert.equal(joined, md);
});

test("buildAggregateParts joined is byte-identical to buildAggregateMarkdown for empty pages", () => {
  const md = buildAggregateMarkdown([]);
  const joined = buildAggregateParts([]).join("");
  assert.equal(joined, md);
});

test("buildAggregateParts joined is byte-identical to buildAggregateMarkdown with messy blank lines", () => {
  const messyPages = [
    {
      url: "https://x.com/sites/a/Messy.aspx",
      title: "Messy",
      markdown: "Line one.\n\n\n\n\nLine two.\n\n\n\nLine three.",
      metadata: {}
    },
    {
      url: "https://x.com/sites/a/AlsoMessy.aspx",
      title: "Also Messy",
      markdown: "\n\n\nStarts blank.\n\n\n\n\n\nEnds blank.\n\n\n\n",
      metadata: {}
    }
  ];
  const md = buildAggregateMarkdown(messyPages, { siteTitle: "Messy Site" });
  const joined = buildAggregateParts(messyPages, { siteTitle: "Messy Site" }).join("");
  assert.equal(joined, md);
});
