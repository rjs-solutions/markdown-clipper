# Markdown Clipper

A Chrome extension that turns web pages into clean Markdown — with first-class support for
SharePoint. Copy, download, save into a local knowledge vault, or export whole sites while
preserving their structure.

> **Status:** 1.1.0 plus the `feature/clipper-expansion` preview. The preview is covered by
> 308 automated tests but still requires the
> [browser verification checklist](docs/browser-verification-checklist.md). Load the unpacked
> `extension/` before testing. See
> [CHANGELOG.md](CHANGELOG.md) for details.

## What it does

- **Capture the active page as Markdown** — copy to clipboard, download a `.md` file, or open
  the Markdown in a new tab.
- **SharePoint-aware** — scrolls to trigger lazy-loaded sections and uses a scored content-root
  finder to skip chrome/navigation and keep the real page content.
- **Saved SharePoint inventories** — save sites, collapse their page lists, and refresh one or all
  sites to detect new, updated, and removed pages without accumulating duplicates. Collection
  export can load a refreshed saved-site inventory directly as its exact URL list.
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
- **Flexible surfaces** — use the toolbar popup, Chrome side panel, or a draggable/resizable
  in-page panel; selection clipping is also available from the context menu.
- **Knowledge vault workflow** — save clips to a chosen local folder, maintain a wiki-style
  index, apply deterministic tag rules, and generate prompts from the local clip log.
- **Site-aware capture** — adapters for SharePoint and Confluence plus cleaner X/Twitter post,
  quote, article-preview, and author-thread capture.
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
