# Changelog

All notable changes to Markdown Web Clipper are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

The extension is being graduated from its alpha (`SharePoint Markdown Exporter` 0.1.0) into a
general-purpose Markdown web clipper with SharePoint as a first-class mode.

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
- Renamed to **Markdown Web Clipper** (v0.2.0); manifest gains `short_name`, an `extension_pages`
  CSP, an `Alt+M` command, and `web_accessible_resources` for the content modules.
- Modernized the popup/report: native promises, **Blob** downloads (no more data: URLs), and
  clipboard via `navigator.clipboard` — dropped the deprecated `execCommand` fallback and the
  `clipboardWrite` permission.

## [0.1.0] — alpha (pre-graduation baseline)

- Initial `SharePoint Markdown Exporter`: copy / open-tab / download the active SharePoint page
  as Markdown, with scroll-to-load and a scored content-root finder. Hand-rolled HTML→Markdown
  renderer. Imported as the baseline commit before graduation.
