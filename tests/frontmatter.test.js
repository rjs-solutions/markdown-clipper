import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFrontmatter } from "../extension/src/lib/frontmatter.js";

test("buildFrontmatter emits a delimited block", () => {
  const fm = buildFrontmatter({ title: "Hello", author: "Jane" });
  assert.equal(fm, "---\ntitle: Hello\nauthor: Jane\n---");
});

test("buildFrontmatter quotes values with special characters", () => {
  const fm = buildFrontmatter({ source: "https://x.com/a:b", title: "A: B" });
  assert.match(fm, /source: "https:\/\/x\.com\/a:b"/);
  assert.match(fm, /title: "A: B"/);
});

test("buildFrontmatter quotes ambiguous scalars", () => {
  assert.match(buildFrontmatter({ v: "true" }), /v: "true"/);
  assert.match(buildFrontmatter({ v: "2026-06-26" }), /v: "2026-06-26"/);
});

test("buildFrontmatter renders arrays as block lists", () => {
  const fm = buildFrontmatter({ tags: ["a", "b"] });
  assert.equal(fm, "---\ntags:\n  - a\n  - b\n---");
});

test("buildFrontmatter skips empty values and returns empty when nothing remains", () => {
  assert.equal(buildFrontmatter({ a: "", b: null, c: undefined, d: [] }), "");
  assert.equal(buildFrontmatter({}), "");
  assert.equal(buildFrontmatter({ a: "x", b: "" }), "---\na: x\n---");
});
