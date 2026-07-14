import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { assembleOutput } from "../extension/src/lib/assemble.js";

test("templating resolves fields, filters, meta, and selectors end to end", async () => {
  const dom = new JSDOM(
    `<!doctype html><html><head>
       <meta property="og:image" content="https://img.example.com/hero.jpg">
       <meta name="author" content="Jane Doe">
     </head><body><h1>Hello World</h1><p>Body text.</p></body></html>`,
    { url: "https://example.com/post" }
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;

  const { buildVariables } = await import("../extension/src/content/variables.js");
  const { collectMetadata } = await import("../extension/src/content/metadata.js");

  const metadata = collectMetadata(document.body, { mode: "article" });
  metadata.title = "Hello World";
  metadata.url = location.href;
  const variables = buildVariables(metadata, { content: "Body text.", selectors: ["h1"] });

  const result = {
    title: "Hello World",
    url: location.href,
    mode: "article",
    markdown: "Body text.",
    metadata,
    variables
  };

  const out = assembleOutput({
    result,
    fields: {},
    settings: {
      useTemplate: true,
      template: "# {{title|upper}}\nauthor: {{author}}\nimg: {{meta:og:image}}\nh1: {{selector:h1}}\n\n{{content}}",
      filenameTemplate: "",
      metadataStyle: "frontmatter",
      includeTitleHeading: true
    }
  });

  assert.match(out.markdown, /# HELLO WORLD/);
  assert.match(out.markdown, /author: Jane Doe/);
  assert.match(out.markdown, /img: https:\/\/img\.example\.com\/hero\.jpg/);
  assert.match(out.markdown, /h1: Hello World/);
  assert.match(out.markdown, /Body text\./);
  assert.equal(out.filename, "hello-world.md");
  assert.ok(out.markdown.endsWith("\n"));
});
