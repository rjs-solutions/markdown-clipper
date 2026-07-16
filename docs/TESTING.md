# Manual Test / Smoke-Test Checklist

Run this before publishing each release. Automated unit tests (`npm test`) cover the pure
logic; this checklist covers the DOM-bound and browser-only behavior they can't.

## 0. Before loading (on your machine)

- [ ] `npm test` → all tests pass.
- [ ] `npm run lint` is clean (or only known warnings).
- [ ] `npm run vendor` has been run so `extension/src/vendor/` exists.
- [ ] `extension/manifest.json` version is correct.

## 1. Load unpacked and confirm it boots

- [ ] `chrome://extensions` → **Developer mode** → **Load unpacked** → select `extension/`.
- [ ] The card shows **no "Errors"** button.
- [ ] Open the extension; **DevTools (F12) → Console is clean** (a bad import would blank the
      popup).

## 2. Single-page capture — SharePoint

- [ ] On a SharePoint page, **Copy Markdown** → paste elsewhere; headings, lists, tables, and
      links are correct; navigation/chrome is excluded.
- [ ] **Download** saves a sensibly named `.md` file with the same content.
- [ ] The folder segment beside **Download** opens Chrome's Save As dialog and allows a different
      location; the main Download segment remains a one-click action.
- [ ] **Open in tab** shows the Markdown preview.
- [ ] A long, lazy-loading page captures the below-the-fold content (scroll-to-load worked).
- [ ] Merely opening the popup does not move the SharePoint page. Choosing Copy, Download,
      Open, or the editor shows a brief loading overlay, then restores the original position.

### Saved SharePoint sites

- [ ] Options → SharePoint → add a signed-in site and discover its pages; the permission prompt
      appears once and the page count/list persists after closing and reopening Options.
- [ ] Collapse and expand the saved site; the state persists after reopening Options.
- [ ] Refresh the site without changes → the same page count, no duplicate rows, and “no changes.”
- [ ] After a SharePoint page is created or edited, Refresh reports it as new or updated. Removing
      a page reports it as removed. **Refresh all sites** processes every saved site once.

## 3. Single-page capture — general webpage

- [ ] On a news/article page, capture produces clean article Markdown (Readability mode).
- [ ] On a non-article page, the full-page fallback still produces usable Markdown.

## 4. Options, side panel, and templating

- [ ] Options uses the General / Capture / Output / Template left navigation; switching panes,
      Save, and Reset all work.
- [ ] From the popup, **Open in side panel** opens a docked, full-width clip card; Copy,
      Download, and Open work there.
- [ ] Switching to another tab hides the clipper panel instead of showing an empty capture;
      returning to the original tab restores it, with no horizontal scrolling at narrow widths.
- [ ] In the full-page editor, Close has a visible secondary-button outline before hover.
- [ ] Enable a custom template containing `{{title|slug}}` and `{{content}}`; save, capture,
      and confirm both the rendered Markdown and filename.

## 5. Site export

- [ ] Run URL-list, sitemap, and same-host crawl modes once each.
- [ ] The host-access prompt appears when needed and does not repeat for an already-approved
      host.
- [ ] ZIP output contains per-page Markdown plus `index.md`; aggregate output downloads when
      selected.
- [ ] A sitemap containing page URLs on unapproved origins skips them with a clear message;
      use URL-list mode to explicitly approve multiple hosts.

## 6. Permissions sanity

- [ ] On the extensions card, confirm the only install-time site access is the narrow
      `cdn.syndication.twimg.com` permission used for X/Twitter status capture.
- [ ] Optional host access is requested only when starting a site export.

## Expected console noise from captured sites (not bugs)

When the spider opens target pages in real tabs, those pages' own console output appears under
`chrome://extensions` → the extension → **Errors**. Messages pointing at third-party URLs (the
captured site) are not defects. Anything referencing `chrome-extension://…` or the extension's
own files **is** worth investigating.
