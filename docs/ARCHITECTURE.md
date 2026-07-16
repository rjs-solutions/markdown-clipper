# Architecture &amp; Build Report

Markdown Clipper — graduated from the `SharePoint Markdown Exporter` alpha (0.1.0) to a
general web→Markdown clipper, now on the **1.1.0 expansion preview**. This document is the design overview and the record
of what was built. For setup see [DEVELOPMENT.md](DEVELOPMENT.md); for the test gate see
[TESTING.md](TESTING.md).

## Goals

1. Heavily audit the alpha for maintainability, reliability, and usefulness.
2. Add a site spider that exports a whole SharePoint site, preserving structure.
3. Take cues from the Obsidian Web Clipper and make capture work on general webpages too.

## How it's put together

No bundler — everything is plain ES modules, matching the BulkStatus reference. There are two
execution contexts:

- **Extension pages** (`popup`, `options`, `report`, `crawl`) load an entry module via
  `<script type="module">` and import from `src/lib/` and `src/vendor/`.
- **The content side** is injected with `chrome.scripting.executeScript`. A tiny serializable
  function dynamically imports the ES-module collector
  (`import(chrome.runtime.getURL("src/content/collect.js"))`) in the page's isolated world; it
  then imports the same `src/lib/` and `src/vendor/` modules. Those files are listed in the
  manifest's `web_accessible_resources`.

The payoff: the content collector, the extension pages, and the Node test suite all import the
**same** pure modules — one source of truth, no build step.

```
extension/
├── manifest.json            short_name, CSP, Alt+M, web_accessible_resources
└── src/
    ├── popup/               copy / download / open / "export a whole site"
    ├── options/             capture + output settings, template editor
    ├── report/              Markdown preview + download
    ├── crawl/               collection capture UI (file/list/sitemap/llms/crawl)
    ├── content/             DOM-bound, injected:
    │   ├── collect.js         orchestrator -> { markdown, metadata, variables }
    │   ├── scroll.js          scroll-to-load lazy content
    │   ├── sharepoint.js      detection + scored content-root finder
    │   ├── article.js         Readability article extraction (generic pages)
    │   ├── clean.js           strip chrome, absolutize URLs -> HTML string
    │   ├── metadata.js        author/dates/description/site from meta + JSON-LD
    │   ├── variables.js       flat variable map for templating
    │   └── dom-utils.js       shared helpers
    ├── lib/                 pure ES modules (unit-tested):
    │   ├── markdown.js        Turndown + GFM config, normalize
    │   ├── compose.js         document assembly (front matter / list / none)
    │   ├── frontmatter.js     YAML emitter
    │   ├── template.js        {{variable|filter}} engine
    │   ├── slug.js            slug / filename / path-segment sanitizing
    │   ├── settings.js        DEFAULT_SETTINGS + load/save
    │   ├── capture.js         executeScript injection wrapper (reused by spider)
    │   ├── download.js        Blob downloads
    │   ├── discover.js        URL list / sitemap parsing
    │   ├── llms.js            llms.txt discovery
    │   ├── collection-import.js TXT / CSV / XLSX URL intake
    │   ├── collections.js     versioned saved-collection model + legacy migration
    │   ├── collection-csv.js  collection/inventory CSV export
    │   ├── collection-library.js incremental local sync + catalog/manifest/review
    │   ├── collection-health.js last crawl results for explicit page review
    │   ├── collection-schedule.js optional sync-due reminder state
    │   ├── activity-summary.js compact clip/source/collection statistics
    │   ├── sharepoint-inventory.js local page snapshots + refresh reconciliation
    │   ├── collection-export.js saved-collection matching + export presets
    │   ├── sitepath.js        URL -> structure-preserving .md path
    │   ├── aggregate.js       per-page files + index + aggregate doc
    │   ├── zip.js             store-only ZIP writer
    │   └── crawl.js           tab-based spider engine
    └── vendor/              generated: Turndown, turndown-plugin-gfm, Readability
```

## Data flow

**Single-page capture**
```
popup → capture.js (executeScript) → content/collect.js
  collect: scroll → pick root (sharepoint | article | full) → clean → Turndown
         → { markdown(body), metadata, variables }
popup → compose.js (front matter + title + body)   [default]
      → template.js (custom note + filename)        [if templating enabled]
      → clipboard / Blob download / report tab
```

**Site export (spider)**
```
crawl page → discover seeds (file/list | sitemap | llms.txt | saved collection | start URL)
           → request host permission for the target origin(s)
           → crawl.js: for each URL — open background tab, wait for load,
             capture.js, (optionally) collect same-host links, close tab
           → aggregate.js → ZIP (buildPageFiles + index, via zip.js) and/or aggregate.md
           → Blob download, or collection-library.js → normal files under the chosen local root
```

## Conversion engine

Vendored **Turndown + turndown-plugin-gfm** (HTML→Markdown, GFM tables/strikethrough/task
lists/fenced code) and **Mozilla Readability** (article extraction for generic pages). Shipped
as browser ES modules under `src/vendor/`, regenerated by `npm run vendor`. SharePoint pages use
the custom scored root-finder instead of Readability; both feed the same Turndown config.

## Permission model

Single-page capture uses `activeTab` + `scripting`. The only install-time host permission is
X/Twitter's public syndication endpoint for clean status capture. The spider
can't use `activeTab` (it visits pages you aren't on, and SharePoint is JS-rendered so a raw
`fetch` returns an empty shell), so it requests **optional host permissions for the specific
site, only when you press Start**. `downloads` and `storage` are the only other permissions;
Chrome's Tabs API is used to create, observe, and close those export tabs, but the sensitive
`tabs` permission is not requested. The exact runtime host grant supplies page access.

## Templating (Obsidian-inspired)

Opt-in. A note template and filename template support `{{variable|filter}}`. Variables:
`{{content}}`, page fields (title/author/published/modified/date/description/url/domain/site/
captured/today/time), `{{meta:NAME}}`, `{{schema:KEY}}` (JSON-LD), and `{{selector:CSS}}`.
Filters: lower, upper, trim, slug, default, replace, truncate, date. The engine is pure; the
content side resolves the DOM-dependent values (meta/schema/selectors) and hands the engine a
flat map.

## Testing

`npm test` runs `node --test` (360 cases), including Markdown conversion, settings, capture
adapters, SharePoint discovery/inventory reconciliation, crawling, templating, the vault, and
DOM integration coverage in jsdom. Browser-only behavior on real authenticated pages is covered
by the manual checklist in [TESTING.md](TESTING.md).

## Status &amp; remaining gates

The expansion branch is code-complete and automated checks are green, but it still needs the
full authenticated browser pass in [browser-verification-checklist.md](browser-verification-checklist.md).
`npm run release:check` validates code and package metadata; `npm run store:check` remains the
final gate after real listing screenshots and the promotional tile are produced.

## Maintainability notes

The plain-module approach remains a good fit: it keeps the shipped source reviewable, avoids
remote code and build-time indirection, and lets browser pages and tests share the same logic.
Two controllers are now natural future extraction points rather than release blockers:
`options/options.js` can split into vault, tag-rule, Collections, prompt, and maintenance controls;
`popup/popup.js` can split surface coordination from capture/action handling.

The movable in-page panel intentionally embeds the packaged popup as a web-accessible extension
page. Only the collector modules and the popup's required dependency chain are exposed, and the
host accepts panel messages only from the iframe it created. A future Shadow DOM or unprivileged
iframe architecture could reduce that public extension-page surface further, but would be a
larger cross-surface rewrite and is not required for the current store gate.
