import { test } from "node:test";
import assert from "node:assert/strict";
import { composeDocument, buildProperties } from "../extension/src/lib/compose.js";

const META = {
  title: "My Page",
  url: "https://site.sharepoint.com/x",
  author: "Jane",
  published: "2026-01-01",
  site: "Intranet",
  capturedAt: "2026-06-26 10:00"
};

test("composeDocument emits front matter + H1 + body by default", () => {
  const out = composeDocument({ title: "My Page", body: "Hello body.", metadata: META });
  assert.match(out, /^---\n/);
  assert.match(out, /title: My Page/);
  assert.match(out, /source: "https:\/\/site\.sharepoint\.com\/x"/);
  assert.match(out, /\n# My Page\n/);
  assert.match(out, /Hello body\./);
});

test("composeDocument list style emits a metadata block, no front matter", () => {
  const out = composeDocument({ title: "My Page", body: "Body", metadata: META, options: { metadataStyle: "list" } });
  assert.equal(out.startsWith("---"), false);
  assert.match(out, /Source: https:\/\/site\.sharepoint\.com\/x/);
  assert.match(out, /Author: Jane/);
});

test("composeDocument none style is title + body only", () => {
  const out = composeDocument({ title: "My Page", body: "Body", metadata: META, options: { metadataStyle: "none" } });
  assert.equal(out.includes("source:"), false);
  assert.equal(out.includes("Source:"), false);
  assert.match(out, /# My Page/);
});

test("composeDocument drops a duplicate leading heading from the body", () => {
  const out = composeDocument({ title: "My Page", body: "# My Page\n\nReal content", metadata: META, options: { metadataStyle: "none" } });
  assert.equal((out.match(/# My Page/g) || []).length, 1);
});

test("composeDocument can omit the title heading", () => {
  const out = composeDocument({ title: "My Page", body: "Body", metadata: META, options: { metadataStyle: "none", includeTitleHeading: false } });
  assert.equal(out.includes("# My Page"), false);
});

test("buildProperties merges extra properties", () => {
  const props = buildProperties(META, { extraProperties: { tags: ["clip"] } });
  assert.deepEqual(props.tags, ["clip"]);
  assert.equal(props.author, "Jane");
});
