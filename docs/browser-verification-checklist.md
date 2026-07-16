# Browser verification checklist — feature/clipper-expansion

Everything on this branch passes 360 automated tests and a static load-safety audit
(service worker has no load-fatal DOM globals, no `createObjectURL` in the worker tree,
all manifest-referenced files exist). What remains can only be checked in a real Chrome
because it needs the extension loaded, the File System Access API, real IndexedDB, or a
live authenticated SharePoint/Confluence session. Work top to bottom; each section is
independent once the extension is loaded.

## 0. Load
- [ ] `chrome://extensions` → Developer mode → Load unpacked → select the `extension/` folder.
- [ ] The card shows no errors; the service worker reads "active" (not "errored"). *(Static audit says it should — this confirms it.)*

## 1. Open-in-Page overlay panel  *(P0 = the tabId chain)*
- [ ] Open the popup on any https page → click "Open in page". Popup closes, a floating panel appears top-right of the page.
- [ ] **The panel's card shows the HOST page's title and URL — not a blank/extension page.** This is the one that would prove the tabId plumbing. If it shows blank, stop and tell me.
- [ ] Drag by the title bar; drop near a viewport edge. Reload the page, reopen the panel → it restores on-screen (clamped), not off-screen.
- [ ] Resize from the bottom-right handle → min size respected, top-left corner stays anchored.
- [ ] Close (×) → the whole panel is gone (no leftover DOM node, right-click → Inspect to confirm).

## 2. Confluence detection  *(needs real Confluence + Jira)*
- [ ] On a real Confluence page (Cloud `*.atlassian.net/wiki/...` or Server/DC) → popup mode auto-detects "Confluence"; captured body is the page, not nav/sidebar chrome.
- [ ] On a **Jira** page (`*.atlassian.net` with NO `/wiki` path) → mode does NOT say Confluence. *(This is the false-positive guard.)*

## 2a. Saved Collections refresh and intake
- [ ] Options → Collections → add a SharePoint site and discover pages. The inventory persists after Options is closed and reopened.
- [ ] Collapse/expand the site row; the chevron and saved state agree after reopening Options.
- [ ] Refresh with no SharePoint edits → “no changes,” the same page count, and no duplicates.
- [ ] Edit or add a test page, refresh again → the page is labeled Updated or New. Refresh all handles every saved site sequentially.
- [ ] On a page within the saved site, open **Export a collection** → the selector chooses that collection and loads its refreshed page inventory. Its Manage button and the popup header Collections icon both open Options directly on Collections.
- [ ] Add a website and confirm `llms.txt` or sitemap auto-discovery, with crawl offered as fallback.
- [ ] Import a URL list from TXT, CSV, and XLSX. Save one custom collection, then export its CSV and the all-collections CSV.
- [ ] Choose a Local Collections Library root, adjust one collection's relative folder, and click
      Sync. Confirm page `.md` files, `index.md`, `collection.json`, and `_sync-report.md` are
      directly readable without extracting a ZIP. A second sync updates files in place.
- [ ] Reopen Chrome and verify the folder status; use Re-grant access if Chrome requires it.
- [ ] Click **Sync all collections**, let at least two collections finish, close/reopen the export
      window, and confirm completed collections are not repeated. Weekly/monthly reminder choices
      should show a `SYNC` toolbar badge only when due; they do not run unattended.
- [ ] Confirm the library root contains `_collections.md` and `_collections.json`; a second sync
      with no source edits reports unchanged files rather than rewriting them.
- [ ] For a multi-host custom list, confirm page files are grouped by host.
- [ ] After a failed capture or removed source page, confirm Page health marks it red. Open failed
      URLs for review, and explicitly Archive or Delete stale local files.

## 3. Crawler v2 — durability  *(THE acceptance test; also the only check of IndexedDB body storage)*
- [ ] Start a follow-links crawl (max pages ~15) on a site you may crawl; approve the permission prompt. Watch a few pages capture.
- [ ] **Close the crawl window entirely. Wait ~15s. Reopen it.** The log replays prior progress and status still shows running (or done) — not reset to empty. *(This is impossible with the old in-window crawler.)*
- [ ] Let it finish → a ZIP (or aggregate .md) downloads. **Open a couple of the exported files and confirm they contain real page content** — this is the only end-to-end check that page bodies survived the IndexedDB round-trip (no automated test exercises that path).
- [ ] Pause mid-crawl → status "paused", log stops. Resume → continues without re-capturing or duplicating.

## 4. Vault mode  *(File System Access)*
- [ ] Options → Knowledge Base → "Choose folder", pick a folder → status reads "…(access granted)".
- [ ] Turn "Save clips to a vault folder" ON. Clip a page from the popup → the .md lands **in the chosen folder**, nothing in `chrome://downloads`.
- [ ] Turn the toggle OFF (leave the folder chosen). Clip again → it goes to **Downloads**, NOT the vault. *(This is the toggle bug we fixed — confirm it's really fixed.)*
- [ ] Restart Chrome fully. Reopen Options → the folder name still shows. Note whether permission says "granted" or "access needed"; if the latter, "Re-grant access" → accept → a subsequent clip lands in the vault without re-picking.
- [ ] Delete/rename the vault folder, then clip with the toggle on → the UI surfaces an error (no silent fallback to Downloads).

## 5. Wiki preset  *(needs vault mode working)*
- [ ] Enable "Use LLM-friendly frontmatter and keep an index". Clip two different pages into the vault.
- [ ] The vault folder root has an `index.md` with a table row per clip (newest first, with `source_url`, `clipped`, `type`, `tags`).
- [ ] Open a clipped `.md`: frontmatter shows `source_url`, `clipped`, `type: article`, and a `description` that is **auto-filled even if the page showed no summary**. No empty `author:`/`published:` lines when the page lacked them.
- [ ] Clip a SharePoint page and a Confluence page → each uses its content-type frontmatter shape: SharePoint shows `site`/`path`/`last_modified`/`page_type` (news or page); Confluence shows `space`.

## 6. Prompt generator
- [ ] Popup → "Generate LLM prompt…" → a new tab opens, no console errors.
- [ ] "N items included" matches the selected scope. Generate once for All saved clips and once
      for a locally synced collection. The prompt identifies the scope and browser-visible folder,
      asks for folder access when needed, includes an inventory table, and uses the selected task.
- [ ] Task choices read Aggregate — Group clips into themes, Timeline — Trace changes over time,
      and Coverage review — Find gaps and duplicates.
- [ ] Copy → paste elsewhere → matches the textarea.
- [ ] Change the type filter / since date / limit → the count and rows change.
- [ ] With an empty clip log → the page shows an "empty vault" prompt, not a broken table.

## 7. Tag rules  *(deterministic auto-tagging)*
- [ ] Options -> Knowledge Base -> Tag rules -> Add rule: scope `domain`, pattern a site you will visit, tags `test-tag`. It auto-saves.
- [ ] Visit a matching page, open the popup -> the Tags field pre-fills with `test-tag` (plus any page tags) before you click anything.
- [ ] Add a tag by hand, then save the clip -> the file frontmatter `tags:` has both the rule tag and your manual one; the clip log / index shows the same set.
- [ ] A rule with a deliberately broken regex (e.g. `(unterminated[`, regex checked) does NOT break tagging on other rules or the clip.

## 8. UX feedback pass (popup slim, panel, entry points)
- [ ] Save a page, reopen its clipper, and confirm the header indicator says **Appears current**.
      Change visible page content and reopen to confirm **Page changed**. Click the indicator to
      see its saved date/path and, for a saved collection, open that collection expanded in Options.
- [ ] Header icon hover tiles are centered. Collection export appears before Manage Collections,
      and a divider separates Manage Collections from Options.
- [ ] Collections intake gives the URL a full row; platform, discovery, and Add & discover remain
      readable below it. Saved names/URLs have room to wrap or truncate cleanly, clicking the
      identity expands the row, and every compact action has a clear tooltip.
- [ ] Per-collection inventory export offers both CSV and TXT. Select controls across Options and
      Export Collection have rounded corners, readable text, and a chevron inset from the edge.
- [ ] Popup: only a **Source** row up top (no Author/Published/Modified/Site); Download/Copy/Open visible with little/no scroll. The full editor (expand icon) still shows all fields.
- [ ] Popup, in-page panel, native side panel, and editor: Copy and Download have equal visual
      weight. Main Copy copies only the displayed body and briefly changes to **Copied**; its
      secondary segment copies the complete document. The Body character count matches main Copy.
- [ ] The wide **Download** segment keeps the normal behavior; the narrow folder segment shows
      “Choose download location” on hover and opens Chrome's Save As dialog.
- [ ] On a modern SharePoint Site Page with a Page details description, confirm Description is
      prefilled even when no ordinary meta-description tag exists.
- [ ] Settings > Knowledge Base contains the inline **Prompt generator**; the popup does not duplicate it.
- [ ] Open in Page: panel is noticeably bigger, the bottom-right **resize grip is visible** and drags; Description/Markdown fields are taller than in the plain popup.
- [ ] Side panel: an **X** closes it (only shown there).
- [ ] Settings > General > **Toolbar icon click**: set to Popup / Side panel / Open in page, save, click the icon each time — behavior matches. Fresh reload still opens the popup before the worker adjusts.
- [ ] Right-click a page > **Clip with Markdown Clipper** → the in-page overlay opens.

## 9. Tweet / X clipping
- [ ] Confirm extension Details shows the narrow `cdn.syndication.twimg.com` access used for
      clean X/Twitter status capture. No settings toggle or runtime prompt is expected.
- [ ] Open a normal tweet with an image, click the icon > clip. Body is a clean blockquote (author, date, text, image, "View on X"), no t.co noise.
- [ ] A **quote tweet** shows the quoted tweet nested under "Quoting @author"; an **X article** shows title + preview + "Read the full article" link (preview only, by design).
- [ ] A tweet whose author left a **follow-up reply** below it: the clip includes an "--- Author's follow-up ---" section with that reply. (Toggle Settings > Capture > "Include the author's follow-up replies" off to skip it.)
- [ ] A protected/unavailable tweet falls back to normal page capture with a status note.

---
Anything that fails, paste me the symptom (and console text if any) and I'll route a fix. Items 1-card, 3-close/reopen, 3-file-content, and 4-toggle are the four I'd most want confirmed.
