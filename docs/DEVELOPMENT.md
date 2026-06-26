# Development

## Layout

```
extension/                 # the shippable extension (Load unpacked points here)
├── manifest.json
├── assets/icons/
└── src/
    ├── popup/             # toolbar action: copy / download / open / export
    ├── options/           # settings + (planned) template rules
    ├── report/            # Markdown preview + per-page export
    ├── crawl/             # (planned) site spider UI + engine
    ├── content/           # injected into pages: collector + DOM extraction
    ├── lib/               # pure ES modules: markdown config, templating, slug, url, zip
    └── vendor/            # vendored Turndown + GFM + Readability (generated)
package.json, eslint.config.js, tests/, scripts/, docs/   # dev tooling
```

## Module strategy (no build step)

The project deliberately has **no bundler**, matching the BulkStatus reference. Everything is
plain ES modules:

- **Extension pages** (popup/options/report/crawl) load their entry module via
  `<script type="module">` and import from `src/lib/` and `src/vendor/`.
- **The content side** is injected with `chrome.scripting.executeScript`. A tiny classic
  bootstrap dynamically imports the ES-module collector
  (`import(chrome.runtime.getURL("src/content/collect.js"))`), which then imports the same
  `src/lib/` and `src/vendor/` modules. The imported files are listed in the manifest's
  `web_accessible_resources`.

This keeps a single source of truth: the content collector, the extension pages, and the Node
test suite all import the same pure modules.

## Vendored libraries

`extension/src/vendor/` holds browser ES-module builds of Turndown, turndown-plugin-gfm, and
Mozilla Readability. They are **generated** — do not hand-edit. Update versions in
`package.json`, then `npm install && npm run vendor`. Licenses are recorded in
[../NOTICE.md](../NOTICE.md).

## Testing

Pure logic (Markdown configuration, templating, slugs, URL handling) lives in `src/lib/` and is
covered by `node --test` in `tests/`. DOM-dependent code is exercised with `jsdom`: set
`globalThis.window/document/DOMParser/Node` from a `JSDOM` instance before importing the
vendored libraries (Turndown's browser build needs a global `document`). See existing tests for
the pattern. DOM-bound collector behavior on real SharePoint pages is verified with the manual
checklist in [TESTING.md](TESTING.md).
