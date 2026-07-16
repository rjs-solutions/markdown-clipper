import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { htmlToMarkdown } from "../extension/src/lib/markdown.js";

// Turndown's browser build needs a global DOM; conversion only touches it at
// call time, so setting these once before any test() runs is sufficient.
const globalDom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.com/" });
globalThis.window = globalDom.window;
globalThis.document = globalDom.window.document;
globalThis.DOMParser = globalDom.window.DOMParser;
globalThis.Node = globalDom.window.Node;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES_DIR = path.join(__dirname, "fixtures", "pages");
const GOLDEN_DIR = path.join(__dirname, "fixtures", "golden");
const UPDATE_GOLDENS = process.env.UPDATE_GOLDENS === "1";
const normalizeNewlines = (value) => String(value).replace(/\r\n?/g, "\n");

// The URL each fixture was actually saved from. A clipped page lives in a
// vault detached from its origin, so relative URLs must be absolutized against
// the source page or they become dead links.
const FIXTURE_BASE_URLS = {
  "hackernews.html": "https://news.ycombinator.com/",
  "wikipedia-markdown.html": "https://en.wikipedia.org/wiki/Markdown",
  "mdn-display.html": "https://developer.mozilla.org/en-US/docs/Web/CSS/display"
};

const fixtureNames = fs
  .readdirSync(PAGES_DIR)
  .filter((name) => name.endsWith(".html"))
  .map((name) => name.replace(/\.html$/, ""));

function convertFixture(name) {
  const html = fs.readFileSync(path.join(PAGES_DIR, `${name}.html`), "utf8");
  const dom = new JSDOM(html);
  const baseUrl = FIXTURE_BASE_URLS[`${name}.html`];
  return htmlToMarkdown(dom.window.document.body.innerHTML, { baseUrl });
}

for (const name of fixtureNames) {
  test(`markdown-fixtures: ${name}.html matches its golden file`, () => {
    const markdown = convertFixture(name);
    const goldenPath = path.join(GOLDEN_DIR, `${name}.md`);

    if (UPDATE_GOLDENS) {
      fs.writeFileSync(goldenPath, markdown);
      return;
    }

    assert.ok(fs.existsSync(goldenPath), `missing golden file: ${goldenPath} (run with UPDATE_GOLDENS=1)`);
    const golden = fs.readFileSync(goldenPath, "utf8");
    assert.equal(normalizeNewlines(markdown), normalizeNewlines(golden));
  });
}

test("markdown-fixtures: every fixture page has a baseUrl mapping", () => {
  for (const name of fixtureNames) {
    assert.ok(FIXTURE_BASE_URLS[`${name}.html`], `no baseUrl mapped for ${name}.html`);
  }
});

test("markdown-fixtures: hackernews.html emits only absolute link/image URLs", () => {
  const markdown = convertFixture("hackernews");
  const destinations = [...markdown.matchAll(/!?\[[^\]]*\]\(([^)\s]+)/g)].map((m) => m[1]);
  assert.ok(destinations.length > 0);
  const relative = destinations.filter((url) => !/^(https?:|mailto:|#)/.test(url));
  assert.deepEqual(relative, [], `relative URLs survived: ${relative.slice(0, 5).join(", ")}`);
  assert.match(markdown, /https:\/\/news\.ycombinator\.com\/newest/);
});

for (const name of fixtureNames) {
  test(`markdown-fixtures: ${name}.html contains no empty-link artifacts`, () => {
    const markdown = convertFixture(name);
    // `![](...)` is an alt-less image, not an empty link, so only match links.
    assert.doesNotMatch(markdown, /(?<!!)\[\s*\]\(/);
    assert.doesNotMatch(markdown, /\[\s*!\[\s*\]\([^)]*\)\s*\]\(/);
  });
}

test("markdown-fixtures: hackernews.html keeps a story's rank, title, and metadata as coherent lines", () => {
  const markdown = convertFixture("hackernews");
  assert.match(
    markdown,
    /^1\. \[Bonsai 27B: A 27B-Class model that runs on a phone\]\(https:\/\/prismml\.com\/news\/bonsai-27b\)/m
  );
});

test("markdown-fixtures: hackernews.html produces no GFM pipe-table syntax", () => {
  const markdown = convertFixture("hackernews");
  const pipeTableLines = markdown.split("\n").filter((line) => line.startsWith("|"));
  assert.deepEqual(pipeTableLines, []);
});

test("markdown-fixtures: hackernews.html keeps recognizable story titles as links", () => {
  const markdown = convertFixture("hackernews");
  assert.match(markdown, /\[Bonsai 27B: A 27B-Class model that runs on a phone\]\(https:\/\/prismml\.com\/news\/bonsai-27b\)/);
  assert.match(markdown, /\[The Tower Keeps Rising\]\(https:\/\/lucumr\.pocoo\.org\/2026\/7\/13\/the-tower-keeps-rising\/\)/);
});

test("markdown-fixtures: hackernews.html output isn't absurdly long relative to visible text", () => {
  const html = fs.readFileSync(path.join(PAGES_DIR, "hackernews.html"), "utf8");
  const dom = new JSDOM(html);
  const visibleTextLength = dom.window.document.body.textContent.replace(/\s+/g, " ").trim().length;
  const markdown = convertFixture("hackernews");
  assert.ok(
    markdown.length < visibleTextLength * 4,
    `markdown length ${markdown.length} is more than 4x visible text length ${visibleTextLength}`
  );
});
