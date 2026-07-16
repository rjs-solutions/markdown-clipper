# Chrome Web Store Listing

## Current package version

1.1.0

## Title

Markdown Clipper

## Short description (132 characters maximum)

Capture web pages—including SharePoint—as clean Markdown. Copy, save to a vault, edit, or export a whole site.

## Category and language

- Category: Productivity
- Language: English

## Detailed description

Markdown Clipper turns the page you choose into clean, portable Markdown, with first-class
support for SharePoint and knowledge-base workflows.

Capture and save the way you work:

- Copy Markdown, download a `.md` file, choose a save location, or edit the result first.
- Use a compact toolbar popup, Chrome's docked side panel, or a movable in-page panel tied to
  the current tab.
- Clip a selected passage from the page context menu.
- Save directly to a chosen local vault folder and maintain an optional `index.md`.

Get cleaner, site-aware output:

- SharePoint capture loads virtualized sections only when a full capture action needs them,
  avoiding a disruptive preview-time scroll.
- Confluence and general article pages use dedicated extraction paths, with a full-page fallback.
- X/Twitter posts can include quotes, article previews, and the author's follow-up thread.
- Add YAML front matter, a plain metadata list, or custom note and filename templates.

Export and revisit collections:

- Import URL lists from TXT, CSV, or XLSX, or discover pages from a sitemap, `llms.txt`,
  same-site crawl, or saved collection.
- Save SharePoint, Confluence, website, and custom URL-list collections; refresh inventories to
  identify new, updated, unchanged, and removed pages without duplicates.
- Export one collection inventory or all saved collection metadata as CSV.
- Choose a Local Collections Library and sync every saved collection into a separate folder of
  directly readable Markdown files, with an index, machine-readable manifest, and safe change report.
- Export structure-preserving Markdown files with `index.md` in a ZIP, one aggregate Markdown
  document, or both.
- Pause and resume longer exports; progress survives service-worker suspension.

Private by design:

- Conversion runs locally in Chrome. There is no developer backend, account, analytics, or
  advertising, and no remote code.
- Normal page clipping uses temporary `activeTab` access. Collection export and saved-collection
  refresh ask for access to the selected site's origin only when needed.
- The developer cannot see captured pages, settings, vault files, or export results.

Markdown Clipper only processes pages after you explicitly invoke a capture, refresh, or export.
It does not monitor ordinary browsing.

## Suggested release notes

Markdown Clipper 1.1 adds a movable in-page clip panel, configurable toolbar behavior, direct
vault saving, generalized Collections with refresh/change detection, URL-list imports, and direct
local library sync,
selection clipping, richer site adapters, and a split Download / Save as control.

## Single purpose

Markdown Clipper has one purpose: convert web content explicitly selected by the user into
portable Markdown and save or organize that Markdown, including single-page, selection,
knowledge-vault, and user-started collection-export workflows.

## Permission justification drafts

- **activeTab** — temporarily access the current page after the user invokes Markdown Clipper so
  it can produce the requested preview or clip.
- **scripting** — run the packaged on-demand collector in the current page or in tabs opened for
  a user-started collection export. No persistent content script is installed.
- **downloads** — save a Markdown file or ZIP archive after the user clicks Download or completes
  an export.
- **storage** — store settings, templates, tag rules, saved collection definitions and
  inventories, relative library paths, panel geometry, resumable crawl metadata, and short-lived
  handoff data. User-chosen directory handles remain local in IndexedDB.
- **sidePanel** — open the clip interface in Chrome's docked side panel when the user explicitly
  selects that surface.
- **alarms** — periodically wake the Manifest V3 service worker only to resume or finish a
  user-started crawl that Chrome may have suspended.
- **contextMenus** — add explicit commands to clip the current page or the user's selection.
- **`https://cdn.syndication.twimg.com/*` host access** — request the public representation of
  an X/Twitter status only when the user clips that status. Only the public status ID is sent.
- **Optional HTTP/HTTPS host access** — declare the maximum runtime scope required for arbitrary
  user-selected sites. At runtime the extension requests the exact origin needed for a collection
  export or saved-collection refresh; it does not monitor other sites.

## Remote code

No. All executable code and third-party libraries are packaged in the extension. Network
responses are treated as content, not executed as code.

## Privacy practices dashboard selections

Use these selections so the dashboard, UI, and [privacy policy](../PRIVACY.md) remain consistent:

- **Website content:** Yes. The extension reads selected rendered pages and metadata to generate
  Markdown and may store requested output locally.
- **Web history / browsing activity:** Yes, if presented as a data category. It processes the
  user-selected URLs and URLs discovered in that user-started export; it does not observe
  unrelated browsing.
- **Authentication information:** No. Existing browser sessions can make a selected page
  available, but the extension does not request cookies, passwords, or authentication tokens.
- **Personally identifiable, health, financial, personal communications, location, and form
  data:** No as separate collection purposes. Such information could be visible inside a page the
  user selects, but the extension does not identify, classify, or transmit it; it processes the
  page locally as website content.
- **Data use:** select only providing or improving the extension's user-facing clipping/export
  functionality. Do not select advertising, analytics, personalization, lending, or sale uses.
- Certify the Limited Use statements and select **No remote code**.
- Privacy URL after the release commit reaches `main`:
  `https://github.com/rjs-solutions/markdown-clipper/blob/main/PRIVACY.md`

## Store and support URLs

- Homepage: `https://github.com/rjs-solutions/markdown-clipper`
- Support: use the repository Issues page or the publisher's established support URL.
- Privacy: `https://github.com/rjs-solutions/markdown-clipper/blob/main/PRIVACY.md`

## Store assets

Follow [SCREENSHOTS.md](SCREENSHOTS.md). Required before submission:

- packaged 128×128 icon: `extension/assets/icons/icon-128.png`;
- at least one, preferably five, 1280×800 screenshots; and
- one 440×280 small promotional tile.

The 1400×560 marquee tile is optional but recommended. Run `npm run store:check` after placing
the final assets under `dist/store-listing/`.
