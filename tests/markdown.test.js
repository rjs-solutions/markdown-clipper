import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  htmlToMarkdown,
  normalizeMarkdown,
  removeDuplicateLeadHeading,
  isLayoutTable
} from "../extension/src/lib/markdown.js";

// Turndown's browser build needs a global DOM. Static imports above are
// evaluated before this runs, but Turndown only touches `document` at
// conversion time, so setting these globals before any test() executes is
// sufficient.
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.com/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Node = dom.window.Node;

test("htmlToMarkdown converts headings, emphasis, and links", () => {
  const md = htmlToMarkdown('<h1>Title</h1><p>A <strong>bold</strong> <a href="https://x.com">link</a>.</p>');
  assert.match(md, /^# Title/);
  assert.match(md, /\*\*bold\*\*/);
  assert.match(md, /\[link\]\(https:\/\/x\.com\)/);
});

test("htmlToMarkdown renders GFM tables", () => {
  const md = htmlToMarkdown("<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>");
  assert.match(md, /\| A \| B \|/);
  assert.match(md, /\| --- \| --- \|/);
  assert.match(md, /\| 1 \| 2 \|/);
});

test("htmlToMarkdown renders fenced code blocks", () => {
  const md = htmlToMarkdown("<pre><code>const x = 1;</code></pre>");
  assert.match(md, /```/);
  assert.match(md, /const x = 1;/);
});

test("htmlToMarkdown returns empty string for empty input", () => {
  assert.equal(htmlToMarkdown(""), "");
  assert.equal(htmlToMarkdown(null), "");
});

test("normalizeMarkdown collapses blank lines and nbsp", () => {
  const nbsp = String.fromCharCode(0xa0);
  assert.equal(normalizeMarkdown(`a${nbsp}b`), "a b");
  assert.equal(normalizeMarkdown("a\n\n\n\nb"), "a\n\nb");
  assert.equal(normalizeMarkdown("  \n a \n  "), "a");
});

test("removeDuplicateLeadHeading drops a leading heading equal to the title", () => {
  assert.equal(removeDuplicateLeadHeading("# Hello\n\nBody", "Hello"), "Body");
  assert.equal(removeDuplicateLeadHeading("# Other\n\nBody", "Hello"), "# Other\n\nBody");
  assert.equal(removeDuplicateLeadHeading("Body", "Hello"), "Body");
});

test("removeDuplicateLeadHeading skips a leading image before the duplicate heading", () => {
  const md = '![](https://x.com/a.jpg "Hello")\n\n# Hello\n\nBody';
  assert.equal(removeDuplicateLeadHeading(md, "Hello"), '![](https://x.com/a.jpg "Hello")\n\nBody');
});

test("htmlToMarkdown converts iframes to a link and drops non-http ones", () => {
  const md = htmlToMarkdown('<iframe title="User Location Map" src="https://maps.example.com/x"></iframe>');
  assert.match(md, /\[Embedded: User Location Map\]\(https:\/\/maps\.example\.com\/x\)/);
  assert.equal(htmlToMarkdown('<iframe src="about:blank"></iframe>'), "");
  assert.doesNotMatch(htmlToMarkdown('<iframe src="https://x.com/a"></iframe>'), /<iframe/);
});

function parseTable(html) {
  const doc = new dom.window.DOMParser().parseFromString(`<table>${html}</table>`, "text/html");
  return doc.querySelector("table");
}

test("isLayoutTable treats role=presentation and role=none as layout", () => {
  const withRole = (role) => {
    const doc = new dom.window.DOMParser().parseFromString(
      `<table role="${role}"><tr><td>A</td></tr></table>`,
      "text/html"
    );
    return doc.querySelector("table");
  };
  assert.equal(isLayoutTable(withRole("presentation")), true);
  assert.equal(isLayoutTable(withRole("none")), true);
});

test("isLayoutTable treats a table containing a descendant table as layout", () => {
  const table = parseTable("<tr><td><table><tr><td>Inner</td></tr></table></td></tr>");
  assert.equal(isLayoutTable(table), true);
});

test("isLayoutTable treats a table nested inside another table as layout", () => {
  const doc = new dom.window.DOMParser().parseFromString(
    "<table><tr><td><table><tr><td>Inner</td></tr></table></td></tr></table>",
    "text/html"
  );
  const innerTable = doc.querySelectorAll("table")[1];
  assert.equal(isLayoutTable(innerTable), true);
});

test("isLayoutTable treats a headerless table with fewer than 2 rows or columns as layout", () => {
  assert.equal(isLayoutTable(parseTable("<tr><td>Only cell</td></tr>")), true);
  assert.equal(isLayoutTable(parseTable("<tr><td>A</td></tr><tr><td>B</td></tr>")), true);
});

test("isLayoutTable treats a headerless table with block-level cell content as layout", () => {
  const table = parseTable(
    "<tr><td><div>Block</div></td><td>B</td></tr><tr><td>C</td><td>D</td></tr>"
  );
  assert.equal(isLayoutTable(table), true);
});

test("isLayoutTable treats a properly headed, sufficiently sized table as a data table", () => {
  const table = parseTable("<tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr>");
  assert.equal(isLayoutTable(table), false);
});

test("isLayoutTable treats a headerless 2x2+ table with no block content as a data table", () => {
  const table = parseTable("<tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr>");
  assert.equal(isLayoutTable(table), false);
});

test("isLayoutTable: a header signal beats a nested descendant table (outer stays DATA)", () => {
  const html =
    "<table><tr><th>A</th><th>B</th></tr>" +
    "<tr><td><table role='presentation'><tr><td>x</td></tr></table></td><td>2</td></tr></table>";
  const doc = new dom.window.DOMParser().parseFromString(html, "text/html");
  const [outer, inner] = doc.querySelectorAll("table");
  assert.equal(isLayoutTable(outer), false);
  assert.equal(isLayoutTable(inner), true);

  const md = htmlToMarkdown(html);
  assert.match(md, /\| A \| B \|/);
  assert.match(md, /\| --- \| --- \|/);
  assert.match(md, /\| x \| 2 \|/);
});

test("isLayoutTable: a headerless table containing a nested table is still LAYOUT", () => {
  const html = "<table><tr><td><table><tr><td>x</td></tr></table></td><td>2</td></tr></table>";
  const doc = new dom.window.DOMParser().parseFromString(html, "text/html");
  const outer = doc.querySelectorAll("table")[0];
  assert.equal(isLayoutTable(outer), true);
  assert.doesNotMatch(htmlToMarkdown(html), /^\|/m);
});

test("isLayoutTable: role=presentation beats a th (still LAYOUT)", () => {
  const html = '<table role="presentation"><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>';
  const doc = new dom.window.DOMParser().parseFromString(html, "text/html");
  assert.equal(isLayoutTable(doc.querySelector("table")), true);
  assert.doesNotMatch(htmlToMarkdown(html), /^\|/m);
});

test("isLayoutTable: a data table nested inside a layout table renders as GFM while the outer unwraps", () => {
  const html =
    '<table role="presentation"><tr><td>' +
    "<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>" +
    "</td></tr></table>";
  const doc = new dom.window.DOMParser().parseFromString(html, "text/html");
  const [outer, inner] = doc.querySelectorAll("table");
  assert.equal(isLayoutTable(outer), true);
  assert.equal(isLayoutTable(inner), false);

  const md = htmlToMarkdown(html);
  assert.match(md, /\| A \| B \|/);
  assert.match(md, /\| 1 \| 2 \|/);
});

test("htmlToMarkdown unwraps a layout table (Hacker News style) instead of emitting a pipe table", () => {
  const html = '<table role="presentation"><tr><td><a href="https://x.com/a">Story A</a></td></tr></table>';
  const md = htmlToMarkdown(html);
  assert.doesNotMatch(md, /^\|/m);
  assert.match(md, /\[Story A\]\(https:\/\/x\.com\/a\)/);
});

test("htmlToMarkdown drops a link whose text is empty or whitespace-only", () => {
  assert.doesNotMatch(htmlToMarkdown('<p>a<a href="https://x.com/v"></a>b</p>'), /\]\(|\[/);
  assert.doesNotMatch(htmlToMarkdown('<p>a<a href="https://x.com/v">   </a>b</p>'), /\]\(|\[/);
  assert.doesNotMatch(htmlToMarkdown('<p>a<a href="https://x.com/v">\n\n</a>b</p>'), /\]\(|\[/);
});

test("htmlToMarkdown drops a link wrapping only an image with no alt text", () => {
  const md = htmlToMarkdown('<a href="https://news.ycombinator.com"><img src="y18.svg"></a>');
  assert.equal(md, "");
});

test("htmlToMarkdown drops a link wrapping only an svg, even when the svg has title text", () => {
  const md = htmlToMarkdown('<a href="https://x.com/"><svg><title>MDN homepage</title><path d="M0 0"/></svg></a>');
  assert.equal(md, "");
});

test("htmlToMarkdown keeps a link wrapping an image that has alt text", () => {
  const md = htmlToMarkdown('<a href="https://x.com/home"><img src="logo.png" alt="Site logo"></a>');
  assert.match(md, /\[!\[Site logo\]\(logo\.png\)\]\(https:\/\/x\.com\/home\)/);
});

test("htmlToMarkdown joins inline-only layout-table cells onto a single line", () => {
  const html =
    '<table role="presentation"><tr><td>1.</td><td><a href="https://x.com/a">Story A</a></td></tr></table>';
  const md = htmlToMarkdown(html);
  assert.equal(md, "1. [Story A](https://x.com/a)");
  assert.doesNotMatch(md, /^\|/m);
});

test("htmlToMarkdown keeps a block-containing layout-table cell as its own block", () => {
  const html = '<table role="presentation"><tr><td><div>Block cell</div></td><td>Inline cell</td></tr></table>';
  const md = htmlToMarkdown(html);
  assert.match(md, /Block cell\n\nInline cell/);
  assert.doesNotMatch(md, /^\|/m);
});

test("htmlToMarkdown still joins layout-table cells when the layout table also uses colspan", () => {
  const html =
    '<table role="presentation">' +
    '<tr><td>1.</td><td><a href="https://x.com/a">Story A</a></td></tr>' +
    '<tr><td colspan="2">99 points</td></tr>' +
    "</table>";
  const md = htmlToMarkdown(html);
  assert.equal(md, "1. [Story A](https://x.com/a)\n\n99 points");
  assert.doesNotMatch(md, /<table/);
});

test("htmlToMarkdown separates layout-table rows with a block boundary", () => {
  const html = '<table role="presentation"><tr><td>Row</td><td>One</td></tr><tr><td>Row</td><td>Two</td></tr></table>';
  const md = htmlToMarkdown(html);
  assert.equal(md, "Row One\n\nRow Two");
});

test("htmlToMarkdown synthesizes a header row for a data table with no th", () => {
  const md = htmlToMarkdown("<table><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr></table>");
  assert.match(md, /\| A \| B \|/);
  assert.match(md, /\| --- \| --- \|/);
  assert.match(md, /\| 1 \| 2 \|/);
});

test("htmlToMarkdown escapes pipes and collapses newlines inside a data table cell", () => {
  const md = htmlToMarkdown(
    '<table><tr><th>A</th><th>B</th></tr><tr><td>x | y<br>z</td><td>ok</td></tr></table>'
  );
  assert.match(md, /x \\\| y\s+z \| ok \|/);
});

test("htmlToMarkdown falls back to raw HTML for a table using colspan or rowspan", () => {
  const md = htmlToMarkdown('<table><tr><th colspan="2">Title</th></tr><tr><td>1</td><td>2</td></tr></table>');
  assert.doesNotMatch(md, /^\|/m);
  assert.match(md, /<table>/);
  assert.match(md, /colspan="2"/);
});

test("htmlToMarkdown converts <pre> without an inner <code> to a fenced block", () => {
  const md = htmlToMarkdown("<pre>plain preformatted text</pre>");
  assert.match(md, /```\nplain preformatted text\n```/);
});

test("htmlToMarkdown picks a longer fence when the code already contains backticks", () => {
  const md = htmlToMarkdown("<pre>```\nnested fence\n```</pre>");
  assert.match(md, /````\n/);
});

test("htmlToMarkdown converts definition lists to bold term + indented definition", () => {
  const md = htmlToMarkdown("<dl><dt>Term</dt><dd>Definition text</dd></dl>");
  assert.match(md, /\*\*Term\*\*/);
  assert.match(md, /: Definition text/);
});

test("htmlToMarkdown converts <mark> to ==highlight==", () => {
  const md = htmlToMarkdown("<p>Some <mark>highlighted</mark> text.</p>");
  assert.match(md, /==highlighted==/);
});

test("htmlToMarkdown drops script, style, noscript, and svg content", () => {
  const md = htmlToMarkdown(
    "<p>Visible</p><script>alert('x')</script><style>.a{color:red}</style><noscript>no-js</noscript><svg><circle r=\"5\"/></svg>"
  );
  assert.match(md, /Visible/);
  assert.doesNotMatch(md, /alert/);
  assert.doesNotMatch(md, /color:red/);
  assert.doesNotMatch(md, /no-js/);
  assert.doesNotMatch(md, /circle/);
});

test("htmlToMarkdown resolves relative hrefs and srcs against baseUrl", () => {
  const md = htmlToMarkdown('<a href="/page">Page</a><img src="img.png" alt="pic">', {
    baseUrl: "https://example.com/dir/"
  });
  assert.match(md, /\[Page\]\(https:\/\/example\.com\/page\)/);
  assert.match(md, /!\[pic\]\(https:\/\/example\.com\/dir\/img\.png\)/);
});

test("htmlToMarkdown leaves URLs untouched when baseUrl is absent, and leaves absolute/fragment/mailto links alone even when present", () => {
  const noBase = htmlToMarkdown('<a href="/page">Page</a>');
  assert.match(noBase, /\[Page\]\(\/page\)/);

  const withBase = htmlToMarkdown(
    '<a href="https://other.com/x">Abs</a><a href="#frag">Frag</a><a href="mailto:a@b.com">Mail</a>',
    { baseUrl: "https://example.com/" }
  );
  assert.match(withBase, /\[Abs\]\(https:\/\/other\.com\/x\)/);
  assert.match(withBase, /\[Frag\]\(#frag\)/);
  assert.match(withBase, /\[Mail\]\(mailto:a@b\.com\)/);
});

test("htmlToMarkdown converts an ARIA grid (div-based table) into a GFM table", () => {
  const html = `
    <div role="grid">
      <div role="row"><span role="columnheader">Name</span><span role="columnheader">Area</span></div>
      <div role="row"><span role="gridcell">Ryan</span><span role="gridcell">Digital Marketing</span></div>
      <div role="row"><span role="gridcell">Jasmine</span><span role="gridcell">Design</span></div>
    </div>`;
  const md = htmlToMarkdown(html);
  assert.match(md, /\| Name \| Area \|/);
  assert.match(md, /\| --- \| --- \|/);
  assert.match(md, /\| Ryan \| Digital Marketing \|/);
  assert.match(md, /\| Jasmine \| Design \|/);
});
