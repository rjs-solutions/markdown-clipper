# Markdown Clipper

A Chrome extension that turns web pages into clean Markdown — with first-class support for
SharePoint. Copy, download, or open the active page as Markdown, and (coming as part of the
1.0 work) export an entire SharePoint site preserving its structure.

> **Status:** 1.0.0, graduated from its alpha (`SharePoint Markdown Exporter` 0.1.0). All
> features below are implemented and covered by automated tests. Load the unpacked `extension/`
> and run the [manual smoke test](docs/TESTING.md) before publishing. See
> [CHANGELOG.md](CHANGELOG.md) for details.

## What it does

- **Capture the active page as Markdown** — copy to clipboard, download a `.md` file, or open
  the Markdown in a new tab.
- **SharePoint-aware** — scrolls to trigger lazy-loaded sections and uses a scored content-root
  finder to skip chrome/navigation and keep the real page content.
- **Works on any page** — general webpages use Mozilla Readability article extraction, with a
  full-page fallback. A capture **mode** setting (auto / sharepoint / article / full) lets you
  override.
- **Front matter & templating** — emit YAML front matter (or a plain list, or nothing), or
  define your own note + filename templates with `{{variable|filter}}` substitution
  (`{{title}}`, `{{author}}`, `{{date}}`, `{{meta:…}}`, `{{schema:…}}`, `{{selector:…}}`),
  inspired by the Obsidian Web Clipper.
- **Export a whole site** — discover pages from a URL list, a `sitemap.xml`, or by crawling
  same-host links, then export per-page Markdown preserving the site structure (ZIP + `index.md`)
  and/or a single aggregate Markdown file. Host access is requested per-site, only when you start.
- **Local and private** — all conversion happens in your browser. No backend, no analytics, no
  remote code. See [PRIVACY.md](PRIVACY.md).

## Install locally (unpacked)

1. `npm install` (first time only — pulls dev tooling and vendored libraries).
2. `npm run vendor` (first time only — writes the bundled libraries into
   `extension/src/vendor/`).
3. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select
   the **`extension/`** folder (not the repo root).

## Develop

| Command | What it does |
| --- | --- |
| `npm test` | Run the `node --test` suite. |
| `npm run lint` | Lint `extension/src` with ESLint. |
| `npm run vendor` | Regenerate `extension/src/vendor/` from `node_modules`. |

The extension ships from [`extension/`](extension/); everything else (tests, lint, scripts) is
dev tooling. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for architecture and
[docs/TESTING.md](docs/TESTING.md) for the manual smoke-test checklist.

## License

Source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE.md). Bundled
third-party libraries keep their own licenses — see [NOTICE.md](NOTICE.md).
