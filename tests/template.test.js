import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTemplate, extractSelectorRefs } from "../extension/src/lib/template.js";

test("applyTemplate substitutes variables and leaves unknowns empty", () => {
  assert.equal(applyTemplate("# {{title}}", { title: "Hello" }), "# Hello");
  assert.equal(applyTemplate("a {{missing}} b", {}), "a  b");
});

test("applyTemplate supports namespaced keys", () => {
  const values = { "meta:og:image": "https://x/i.png", "selector:.byline": "By Jane" };
  assert.equal(applyTemplate("{{meta:og:image}}", values), "https://x/i.png");
  assert.equal(applyTemplate("{{selector:.byline}}", values), "By Jane");
});

test("applyTemplate applies filters", () => {
  assert.equal(applyTemplate("{{title|slug}}", { title: "Hello World!" }), "hello-world");
  assert.equal(applyTemplate("{{t|upper}}", { t: "hi" }), "HI");
  assert.equal(applyTemplate("{{x|default:none}}", { x: "" }), "none");
  assert.equal(applyTemplate("{{x|truncate:5}}", { x: "abcdefgh" }), "abcde...");
  assert.equal(applyTemplate("{{x|replace:a,b}}", { x: "banana" }), "bbnbnb");
});

test("applyTemplate date filter formats parseable dates", () => {
  assert.equal(applyTemplate("{{d|date:YYYY/MM/DD}}", { d: "2026-02-03T12:00:00Z" }), "2026/02/03");
  assert.equal(applyTemplate("{{d|date}}", { d: "not a date" }), "not a date");
});

test("extractSelectorRefs collects and dedupes selector references", () => {
  const refs = extractSelectorRefs(
    "{{selector:.byline}} {{title}} {{selector:.date}}",
    "{{selector:.byline}}-{{url}}"
  );
  assert.deepEqual(refs.sort(), [".byline", ".date"]);
});

test("extractSelectorRefs returns empty when none are referenced", () => {
  assert.deepEqual(extractSelectorRefs("{{title}} {{content}}", ""), []);
});
