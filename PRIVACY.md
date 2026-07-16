# Markdown Clipper Privacy Policy

_Last updated: July 15, 2026_

Markdown Clipper ("the extension") converts web pages — including SharePoint pages — into
Markdown. This policy explains what the extension does and does not do with data.

## Summary

Markdown Clipper does **not** collect, store, sell, or transmit your personal information.
All processing happens locally in your browser. There is no external backend and no analytics.

## What the extension accesses

The extension only acts when you click it and choose an action (copy, download, open, or start
a site export). When you do, it reads the content of the page (or pages) you asked it to
capture — text, headings, links, images, tables, and page metadata such as title, author, and
dates — and converts that content to Markdown on your device.

- **Single-page capture** uses Chrome's `activeTab` permission: the extension can read the
  current tab only after you invoke it, and only that tab.
- **Site export ("spider")** visits the pages you point it at within a site by opening them in
  Chrome tabs and reading the rendered content. This requires host access, which the extension
  requests **only when you start an export**, scoped to the site you are exporting.

## Permissions

The extension has one narrow install-time host permission for X/Twitter's public syndication
endpoint. Broader website access is optional and requested only after you act:

- **`activeTab`** — read the current page when you invoke the extension to capture it.
- **`scripting`** — inject the collector that reads the page DOM and builds the Markdown.
- **`downloads`** — save the Markdown file (or site export archive) you requested.
- **`storage`** — remember your settings and templates on your device.
- **`sidePanel`** — display the clip card beside the page when you explicitly open the side
  panel.
- **Optional `tabs`** — open and close the background tabs required for a site export.
- **`https://cdn.syndication.twimg.com/*`** — retrieve the public JSON representation of an
  X/Twitter status when you clip that status. The request contains the public status ID; protected
  or unavailable posts fall back to normal page capture.
- **Optional host access (`http://*/*`, `https://*/*`)** — requested only when you start a
  site export, so the extension can open and read the pages within the site you chose. It does
  not monitor your browsing and does not run automatically on websites.

With your existing Chrome session, captured pages can include content behind your login (for
example, your organization's SharePoint). That content is converted to Markdown locally and is
never transmitted anywhere.

## Data storage and sharing

- **Captured Markdown** stays in your browser until you copy it, download it, or open it in a
  tab. It is never sent anywhere by the extension.
- **Preferences and templates** are saved in your browser's storage on your device.
- The extension does **not** read, display, export, or store cookies.
- When clipping an X/Twitter status, the extension requests that status from X's public
  syndication endpoint. It does not send captured page content to that endpoint.
- The extension does **not** use remote code; all libraries are bundled locally.
- The extension does **not** sell or transfer user data to third parties.

## Your responsibility

Use Markdown Clipper only on pages and sites you are authorized to access and capture.

## Changes to this policy

If this policy changes, the updated version will be posted at the same location with a new
"Last updated" date.

## Contact

Questions about this policy can be directed to the developer through the Chrome Web Store
listing's support contact.
