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

### Changed
- Restructured to the `extension/` layout (manifest + `src/` + `assets/` under `extension/`).

### Planned
- Replace the hand-rolled HTML→Markdown converter with Turndown.
- General-webpage support (Readability article mode) alongside SharePoint capture.
- YAML front matter + templating with page variables (title/author/date/selector/schema).
- Site spider / aggregate export: per-page Markdown preserving site structure (ZIP + index)
  or a single concatenated aggregate file.

## [0.1.0] — alpha (pre-graduation baseline)

- Initial `SharePoint Markdown Exporter`: copy / open-tab / download the active SharePoint page
  as Markdown, with scroll-to-load and a scored content-root finder. Hand-rolled HTML→Markdown
  renderer. Imported as the baseline commit before graduation.
