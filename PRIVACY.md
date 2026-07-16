# Markdown Clipper Privacy Policy

_Last updated: July 16, 2026_

Markdown Clipper converts user-selected web pages, including SharePoint pages, into Markdown.
This policy describes the website data it processes, what it stores, and the one limited network
request it may make.

## Summary

Markdown Clipper has no developer-operated backend, account, advertising, or analytics. The
developer does not receive or have access to captured pages, browsing activity, settings, files,
or export results. Page conversion and export happen in the browser.

## Data the extension processes

The extension acts only after a user invokes a capture, selection clip, saved-collection
refresh, or collection capture/export. It may process:

- the URL, rendered website content, headings, links, images, tables, selected text, and page
  metadata such as title, author, and dates for the page or pages the user chose;
- the URLs discovered during a user-started sitemap, `llms.txt`, same-site crawl, or platform discovery;
- the user's capture settings, templates, tag rules, saved collection definitions and relative
  library paths, chosen vault folder, and chosen Local Collections Library folder; and
- generated Markdown, filenames, crawl progress, and local clip-history metadata needed to
  complete or update the requested export.

With the user's existing Chrome session, selected pages can include content behind a login. The
extension does not request the `cookies` permission and does not read, display, export, or store
cookies or passwords.

## Local and browser storage

- Settings, templates, tag rules, and saved collection definitions use
  `chrome.storage.sync`. Chrome may sync this configuration between browsers signed into the
  same Chrome profile, according to the user's Chrome sync settings.
- Collection page inventories, crawl job metadata, the active crawl reference, and in-page panel
  geometry use extension-local browser storage.
- Crawl page bodies, clip-history records, and chosen vault and Collections Library directory handles use IndexedDB
  in the extension's browser profile. A chosen directory handle is only used to write files after
  browser permission is granted.
- Short-lived selection and editor handoff data use session storage.
- Markdown files and ZIP archives are written only when the user chooses Download, Save as, or a
  configured vault or collection-sync action. Those files remain in the destination the user selected.

The extension provides reset, removal, and activity controls for its stored configuration and
work history. Uninstalling the extension removes browser-managed extension storage; exported
files are ordinary user files and are not deleted automatically.

## Network access and sharing

- Single-page capture uses temporary `activeTab` access after the user invokes the extension.
- Collection capture and saved-collection discovery request access at runtime to the exact site
  origin selected by the user. The extension may open background tabs for those pages and uses
  the user's existing browser session. It does not monitor unrelated browsing or run persistently
  on websites.
- When the user clips an X/Twitter status, the extension sends only that public status ID to
  X's public syndication endpoint to obtain a cleaner public representation. It does not send
  other captured page content. Protected or unavailable posts fall back to normal page capture.

No captured content, settings, files, or browsing activity is sold, used for advertising or
credit decisions, or transferred to the developer or data brokers. All executable code and
libraries are packaged with the extension; it does not execute remote code.

## Permissions

- **`activeTab`** — access the current page after a user invokes a capture.
- **`scripting`** — run the on-demand collector in a user-selected page or export tab.
- **`downloads`** — save a requested Markdown file or collection archive.
- **`storage`** — keep settings, saved-collection definitions and relative library paths,
  inventories, and resumable work state. Directory handles stay in local IndexedDB.
- **`sidePanel`** — show the clip card in Chrome's side panel when the user chooses that surface.
- **`alarms`** — wake the service worker to resume a user-started crawl after Chrome suspends it.
- **`contextMenus`** — provide explicit page and selection clipping commands.
- **`https://cdn.syndication.twimg.com/*`** — retrieve a public X/Twitter status when the user
  clips it.
- **Optional `http://*/*` and `https://*/*` host access** — establish the maximum runtime scope;
  the extension requests the specific origin needed for a user-selected collection capture or
  saved-collection refresh.

## Limited Use

Markdown Clipper's use of information obtained from Chrome APIs complies with the Chrome Web
Store User Data Policy, including the Limited Use requirements. Data is used only to provide or
improve the extension's user-facing clipping and export purpose. It is not transferred except as
described above where necessary to provide a feature the user requested, and humans do not read
the user's captured data.

## User responsibility

Use Markdown Clipper only on pages and sites you are authorized to access and capture.

## Changes and contact

Material changes will be posted at this location with an updated date. Questions can be directed
to the developer through the
[Markdown Clipper issue tracker](https://github.com/rjs-solutions/markdown-clipper/issues) or
the Chrome Web Store listing's support contact.
