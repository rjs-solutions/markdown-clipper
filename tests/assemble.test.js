import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleOutput, parseTags } from "../extension/src/lib/assemble.js";

const baseResult = {
  title: "Original Title",
  url: "https://example.com/page",
  mode: "article",
  markdown: "Body paragraph.",
  metadata: {
    title: "Original Title",
    author: "Jane",
    description: "Original description",
    site: "example.com",
    tags: ["clippings"]
  },
  variables: { title: "Original Title", content: "Body paragraph.", author: "Jane" }
};

const frontmatterSettings = {
  metadataStyle: "frontmatter",
  includeTitleHeading: true,
  useTemplate: false,
  template: "",
  filenameTemplate: ""
};

test("parseTags splits strings and passes arrays through", () => {
  assert.deepEqual(parseTags("a, b ,, c"), ["a", "b", "c"]);
  assert.deepEqual(parseTags(["x", " y "]), ["x", "y"]);
  assert.deepEqual(parseTags(""), []);
});

test("assembleOutput applies edited title, body, tags, and description", () => {
  const out = assembleOutput({
    result: baseResult,
    fields: {
      title: "Edited Title",
      body: "Trimmed body.",
      tags: "one, two",
      description: "New description",
      filenameBase: "my-file"
    },
    settings: frontmatterSettings
  });
  assert.equal(out.filename, "my-file.md");
  assert.match(out.markdown, /title: Edited Title/);
  assert.match(out.markdown, /description: New description/);
  assert.match(out.markdown, /# Edited Title/);
  assert.match(out.markdown, /Trimmed body\./);
  assert.match(out.markdown, /- one/);
  assert.match(out.markdown, /- two/);
  assert.doesNotMatch(out.markdown, /Body paragraph\./);
});

test("assembleOutput falls back to the capture result when fields are omitted", () => {
  const out = assembleOutput({ result: baseResult, settings: frontmatterSettings });
  assert.match(out.markdown, /title: Original Title/);
  assert.match(out.markdown, /Body paragraph\./);
  assert.equal(out.filename, "original-title.md");
});

test("assembleOutput uses the template when templating is enabled", () => {
  const out = assembleOutput({
    result: baseResult,
    fields: { title: "T", body: "B", tags: "x,y" },
    settings: {
      ...frontmatterSettings,
      useTemplate: true,
      template: "# {{title}}\nTags: {{tags}}\n\n{{content}}",
      filenameTemplate: ""
    }
  });
  assert.match(out.markdown, /# T/);
  assert.match(out.markdown, /Tags: x, y/);
  assert.match(out.markdown, /B/);
  assert.ok(out.markdown.endsWith("\n"));
});
