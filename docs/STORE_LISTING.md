# Chrome Web Store Listing

## Name
Markdown Web Clipper

## Short description (≤132 chars)
Capture any web page - including SharePoint - as clean Markdown. Copy, download, open, or export a whole site.

## Category
Productivity

## Detailed description

Markdown Web Clipper turns web pages into clean, portable Markdown — with first-class support
for SharePoint.

Capture the page you're on:
- Copy Markdown to the clipboard, download a .md file, or open it in a new tab.
- SharePoint-aware: scrolls to load lazy sections and keeps the real content, skipping
  navigation and chrome.
- Works on any site: general pages use article extraction (Mozilla Readability) with a
  full-page fallback. Choose the capture mode (auto / SharePoint / article / full).

Make it fit your workflow:
- Add YAML front matter (great for Obsidian and static-site generators), a plain metadata
  list, or nothing.
- Or define your own note and filename templates with variables like {{title}}, {{author}},
  {{date}}, {{meta:...}}, {{schema:...}}, and {{selector:...}}, plus filters.

Export an entire site:
- Discover pages from a pasted URL list, a sitemap.xml, or by crawling same-host links.
- Save per-page Markdown that preserves the site's folder structure (a ZIP with index.md),
  a single aggregate Markdown file, or both.

Private by design:
- Everything runs locally in your browser. No backend, no analytics, no remote code.
- No host permissions at install. Single-page capture uses activeTab; whole-site export asks
  for access to the specific site, only when you start it.

## Permission justifications

- **activeTab** — read the current page only when you click the extension to capture it.
- **scripting** — inject the collector that reads the page DOM and builds the Markdown.
- **downloads** — save the .md file or the site-export archive you requested.
- **storage** — remember your settings and templates on your device.
- **Optional host access (http/https)** — requested only when you start a site export, so the
  extension can open and read the pages of the site you chose.
- **Optional tabs** — used during a site export to manage the background tabs it opens.

## Privacy
See [PRIVACY.md](../PRIVACY.md). No personal data is collected, stored, or transmitted.
