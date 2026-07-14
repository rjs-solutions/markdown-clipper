# Browser verification checklist — feature/clipper-expansion

Everything on this branch passes 192 automated tests and a static load-safety audit
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
- [ ] Resize from the bottom-left handle → min size respected, top-right corner stays anchored.
- [ ] Close (×) → the whole panel is gone (no leftover DOM node, right-click → Inspect to confirm).

## 2. Confluence detection  *(needs real Confluence + Jira)*
- [ ] On a real Confluence page (Cloud `*.atlassian.net/wiki/...` or Server/DC) → popup mode auto-detects "Confluence"; captured body is the page, not nav/sidebar chrome.
- [ ] On a **Jira** page (`*.atlassian.net` with NO `/wiki` path) → mode does NOT say Confluence. *(This is the false-positive guard.)*

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
- [ ] Clip a SharePoint page and a Confluence page → each uses its content-type frontmatter shape (`site`/`path`/`last_modified` for SharePoint). *(Note: `page_type` and `space` are intentionally absent — pending an adapter follow-up.)*

## 6. Prompt generator
- [ ] Popup → "Generate LLM prompt…" → a new tab opens, no console errors.
- [ ] "N items included" matches your clip log. For each preset (Synthesis / Comparison / Gap), Generate → the textarea shows a goal line, a `VAULT:` line, an inventory table of your clips, and the task instruction.
- [ ] Copy → paste elsewhere → matches the textarea.
- [ ] Change the type filter / since date / limit → the count and rows change.
- [ ] With an empty clip log → the page shows an "empty vault" prompt, not a broken table.

---
Anything that fails, paste me the symptom (and console text if any) and I'll route a fix. Items 1-card, 3-close/reopen, 3-file-content, and 4-toggle are the four I'd most want confirmed.
