# Changelog

All notable changes to Markdown Clipper are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

- Generalize saved SharePoint sites into **Collections** for SharePoint, Confluence, websites,
  and custom URL lists, with automatic classification and sitemap, `llms.txt`, crawl, or manual
  discovery modes.
- Add TXT, CSV, and XLSX URL-list import to Export Collection, plus per-collection and all-
  collections CSV inventory export.
- Redesign Export Collection with branded, collapsible sections and open it beside the in-page
  clipper when space allows.
- Add an opt-in Local Collections Library: one chosen root, safe per-collection folder overrides,
  direct Markdown synchronization, overwrite-in-place updates, and non-destructive removed-page
  reporting. Snapshot ZIP and aggregate downloads remain available.
- Add incremental local-library writes, hostname grouping for multi-host custom lists, root
  `_collections.md`/`_collections.json` catalogs, resumable **Sync all**, weekly/monthly sync-due
  reminders, and an explicit page-health review for failed, removed, archived, or deleted pages.
- Make Copy a first-class split action: the primary segment copies the displayed body and its
  counter now says **Body**; the secondary segment copies the complete assembled document with
  title and metadata. Success is acknowledged on the button instead of a mismatched footer count.
- Read the Site Pages `Description` from SharePoint's serialized page context when standard
  metadata does not expose it.
- Add a clipped-page header indicator with saved date/path, current/changed fingerprint status,
  and a deep link to the matching saved collection. Legacy clip records remain supported and
  gain freshness data the next time they are saved.
- Reorder and clarify the header's collection actions, center SVGs within their hover tiles, and
  visually separate collection management from general Options.
- Reflow Collections intake and saved rows for long names and URLs, replace wide per-collection
  text buttons with accessible icon actions, and offer URL inventory as CSV or TXT.
- Standardize rounded, padded custom select controls across Options and Export Collection.
- Clarify settings terminology and help text, add consistent icons to meaningful actions, and
  provide descriptive hover labels for compact and icon-only controls.
- Simplify Saved Collections by removing the low-value definition backup controls, combining
  per-collection exports into one menu, and reducing row actions to quiet bare icons.
- Add a concise introduction beneath every major Options tab heading so users can understand
  each section before scanning its controls.

- Add an accessible split Download action: the main segment keeps one-click download/vault behavior, while a folder segment opens Chrome's native location chooser in the popup, side panel, in-page overlay, and full editor.

- Persist collection page inventories locally, with collapsible rows, per-collection refresh,
  refresh-all, and new/updated/removed change detection without duplicate pages.

### Added
- Preview expansion with popup/side-panel/in-page action modes, draggable and resizable in-page
  panel, context-menu page/selection clipping, durable crawler jobs, SharePoint and Confluence
  adapters, X/Twitter status capture, local knowledge vault output, wiki indexing, tag rules,
  prompt generation, settings schema/backup, and saved SharePoint-site discovery foundations.

### Fixed
- Golden Markdown tests now compare normalized newlines, so the full suite is stable on Windows
  and Unix checkouts. In-page panel control messages are accepted only from its extension iframe.

## [1.1.0] — 2026-07-13

### Changed
- Renamed the product from **Markdown Web Clipper** to **Markdown Clipper** ("web" was
  misleading given internal SharePoint capture). Folder and npm package names are unchanged.
- Unified theming: a single shared `src/theme.css` token set now drives the popup, options,
  report, and site-export pages, ending the light-popup / dark-export mismatch and the two
  different accent colors. The accent is now the icon's teal brand throughout.
- The popup is wider with rounded, accent-highlighted action rows and a clearer secondary
  "Export a whole site" row. The stray "Ready" status is gone — the status line stays empty
  until there's something to report.
- "Export a whole site…" now opens in a focused popup window instead of a new tab, so it reads
  as a deliberate action rather than navigating into a settings page.
- Popup actions are now three equal **Download / Copy / Open** buttons in one row under a
  "Markdown action" label (graded shades of the accent), and a very long image URL in the
  preview no longer forces the popup to scroll horizontally.
- Tightened the popup for less scrolling: a single header band (wordmark + expand/settings
  icons) instead of a title-plus-subtitle stack, the capture mode folded into the preview
  header, the auto-generated "Captured" property removed, and a taller Markdown preview.
- The extension icon now appears in the header lockup (popup, options, editor) for consistent
  brand identity, and the single accent moved from indigo-purple to a clear blue (`#2563eb`) so
  every button, link, and highlight shares one blue that matches the icon's cooler tones. The
  icon was redesigned to a Markdown "M" beside an upright pair of **scissors** ("clipper") on
  the folded-corner card, recolored teal→indigo → **teal→blue** so the mark and the app share
  one blue/green (web + SharePoint) ethos with no purple; PNGs regenerated from the SVG.
- **Site export permissions hardened:** host permission is requested as the first async work
  from the Start click so user activation is still valid. Link crawling is explicitly
  same-host, and sitemap entries on unapproved origins are skipped with guidance to use URL-list
  mode for intentional multi-host exports.
- Stronger surface contrast in both light and dark so the header, panels, inputs, and page
  background read as distinct layers; the popup header is now its own shaded band, and the
  read-only Source/Site context is a condensed strip at the top of the card. Theme tokens were
  refactored to CSS `light-dark()` (one definition per token) to end light/dark drift.
- Scroll-to-load now runs **only for SharePoint** captures (whose content is virtualized).
  Article and full-page captures use the DOM as-is — no scrolling, no delay — so those clips
  are instant. Opening the popup no longer starts the full SharePoint scroll: it is deferred
  until Copy, Download, Open, or the editor is chosen, with a brief loading overlay masking
  the page movement. (The single-page popup previously scrolled every page.)
- **Conversion:** div-based ARIA grids (`role="grid"`/`role="table"`, e.g. SharePoint list
  views) now convert to GFM tables instead of loose per-cell paragraphs. A duplicate page-title
  heading is dropped even when a banner image precedes it. Iframes (maps, videos, embedded
  forms) become a plain `[Embedded: …](url)` link instead of leaking raw `<iframe>` HTML.

### Added
- **Side panel.** An "open in side panel" button in the popup docks the same clip card to the
  side of the window (`chrome.sidePanel`) so it stays open while you read the page. It captures
  the tab that was active when opened and is scoped to that tab, hiding on unrelated tabs
  instead of showing an empty global fallback. (Requires Chrome 116+; the button hides where
  unsupported.)
- **Options page left-nav.** The options view is now a grouped left-nav layout (General /
  Capture / Output / Template) instead of one long scrolling column of fieldsets.
- **Edit before saving.** The popup's Markdown preview and Description are now editable, and a
  new **full-screen editor** (the Expand ⤢ icon) lets you edit every property — title, file
  name, tags, description, author/published/modified/site, source URL — and the full Markdown
  body, with a live output preview, a collapsible **page-variables** reference panel, and
  icon-labeled Copy / Download, and a Close button (separated by a divider) that warns if there
  are edits not yet copied or downloaded. Output assembly is shared with the popup via
  `lib/assemble.js`.
- **Rich clip card in the popup** (inspired by the Obsidian Web Clipper): the popup now captures
  a fast preview as soon as it opens and shows the extracted properties (source, author,
  published, site, captured, description), an editable **title**, **file name**, and **tags**,
  and a scrollable Markdown preview. Primary **Download .md** button plus one-click
  **Copy Markdown** and **Open .md in tab**. When scroll-to-load is enabled, the full capture
  is pre-warmed in the background as soon as the card appears, so the actions feel instant
  while still including lazy-loaded content.
- **Theme** setting (System default / Light / Dark) on the options page, with live preview.

## [1.0.0] — 2026-06-30

Graduated from the alpha (`SharePoint Markdown Exporter` 0.1.0) into a general-purpose Markdown
web clipper with SharePoint as a first-class mode. (Load unpacked and run the
[manual smoke test](docs/TESTING.md) before publishing to the Chrome Web Store.)

### Added
- Project scaffolding to match the BulkStatus reference: git repo, `package.json`, ESLint flat
  config, `node --test` suite, license, privacy policy, and developer docs.
- Vendored conversion libraries (Turndown + GFM plugin + Mozilla Readability) as browser ES
  modules in `extension/src/vendor/`, regenerated via `npm run vendor`.

- HTML→Markdown now uses Turndown + the GFM plugin (tables, strikethrough, task lists,
  fenced code), replacing the hand-rolled 921-line renderer.
- General-webpage **article mode** via Mozilla Readability, with a full-page fallback; a
  capture **mode** setting (auto / sharepoint / article / full).
- Modular content pipeline (`content/`: scroll, sharepoint, clean, metadata, article,
  collect) injected via a dynamic-import ESM bootstrap; pure logic in `lib/`.
- Output options: **YAML front matter**, a plain metadata list, or none; optional title H1.
- `node --test` suites for markdown, slug, front matter, compose, cleaning, templating, and an
  end-to-end collector integration test.
- **Templating** (opt-in) inspired by the Obsidian Web Clipper: a note template and filename
  template with `{{variable|filter}}` substitution. Variables include `{{content}}`, page
  fields (title/author/published/modified/date/description/url/domain/site/captured/today/time),
  `{{meta:NAME}}`, `{{schema:KEY}}` (JSON-LD), and `{{selector:CSS}}`. Filters: lower, upper,
  trim, slug, default, replace, truncate, date.
- **Site spider / export** (`Export a whole site...` in the popup): discover pages from a
  pasted URL list, a `sitemap.xml`, or by crawling same-host links from a start page; each
  page is captured in a background tab (so JS-rendered SharePoint pages work). Output as a ZIP
  preserving the site's folder structure (one `.md` per page + `index.md`) and/or a single
  aggregate Markdown file with a table of contents. Host access is requested per-site at start.
- Store-only ZIP writer, URL discovery, structure-preserving path mapping, and aggregate
  builders are pure and unit-tested (53 tests total).

### Changed
- Restructured to the `extension/` layout (manifest + `src/` + `assets/` under `extension/`).
- Renamed to **Markdown Clipper** (v0.2.0); manifest gains `short_name`, an `extension_pages`
  CSP, an `Alt+M` command, and `web_accessible_resources` for the content modules.
- Modernized the popup/report: native promises, **Blob** downloads (no more data: URLs), and
  clipboard via `navigator.clipboard` — dropped the deprecated `execCommand` fallback and the
  `clipboardWrite` permission.
- New icon (Markdown `M` + down arrow on a teal→indigo card). Icons are now rasterized from
  `icon-source.svg` via `npm run icons` (resvg), replacing the PowerShell redraw generator.

## [0.1.0] — alpha (pre-graduation baseline)

- Initial `SharePoint Markdown Exporter`: copy / open-tab / download the active SharePoint page
  as Markdown, with scroll-to-load and a scored content-root finder. Hand-rolled HTML→Markdown
  renderer. Imported as the baseline commit before graduation.
