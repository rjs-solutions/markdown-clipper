# SharePoint sites: saved sites + sync (design proposal)

Status: proposed, not scheduled. Runs as its own effort after the current UI-polish stream.

## User story

"I work in the same few SharePoint sites every week. Let me add a site once,
then pull all its pages into my vault as Markdown, and later re-sync so new
pages are added and changed pages are updated, without duplicating anything."

## Why this fits what already exists

This is mostly wiring together pieces the extension already has, not new
infrastructure:

- A **crawl** engine (`crawl.js`) that already walks a site.
- A **vault** with an **`index.md`** manifest of every clip.
- **Dedup-on-reclip** (the frontmatter/index preset already updates an existing
  clip instead of duplicating when the same URL is re-clipped).

"Saved sites + sync" = a saved list of sites + a discovery step + the existing
add/update/dedup applied across a whole site instead of one page at a time.

## Discovery: find the pages of a site

The user pastes a site URL. They will not know REST/Graph endpoints, so we
**derive everything from that URL**.

### Endpoint auto-detection (from the pasted URL)

Parse the URL into `{tenant}.sharepoint.com` + the server-relative site path
(`/sites/{name}` or `/teams/{name}`). From that we can build:

- SharePoint REST base: `https://{tenant}.sharepoint.com/sites/{name}/_api`
- Modern pages list: `.../_api/web/lists/getByTitle('Site Pages')/items?$select=Title,FileRef,GUID,Modified`
- Graph site resolver (optional path): `https://graph.microsoft.com/v1.0/sites/{tenant}.sharepoint.com:/sites/{name}`

No manual endpoint entry. The only input is the site URL.

### Method 1 (primary): SharePoint REST, on the user's existing session

Run the discovery request **same-origin from a content script on the
SharePoint site** (the reliable way to carry the user's SSO cookies and avoid
cross-origin blocks), exactly as the crawler already operates on-page. The Site
Pages list returns each page's `FileRef` (server-relative URL), `GUID`, and
`Modified` timestamp in one call. `FileRef`/`GUID` become the stable identity;
`Modified` drives change detection.

### Method 2 (fallback): crawl

If REST is unavailable (classic sites, list access denied, tenant lockdown),
fall back to the existing crawl of the site's pages. Crawl yields URLs and
content but not always a reliable server `Modified`, so change detection there
falls back to a content hash (see below).

### Method 3 (optional enhancement): Microsoft Graph

Graph (`/sites/{id}/pages`) is cleaner and works off-page, but needs an Azure AD
app registration + OAuth (`chrome.identity.launchWebAuthFlow`) and admin/user
consent. Heavier setup; treat as a later enhancement, not v1.

**Order:** try REST (Method 1) -> fall back to crawl (Method 2). Graph is a
separate opt-in track once an app registration exists.

## Sync model: add, update, skip (never duplicate)

Store per-page sync state in the vault index:

```
{ siteId, pageId (GUID or FileRef), vaultFilename, lastModified, contentHash }
```

On a sync run for a saved site:

1. Discover the current page inventory (Method 1/2).
2. For each discovered page:
   - **not in index** -> ADD (clip it, record identity + `Modified`/hash).
   - **in index, `Modified` (or hash) changed** -> UPDATE the existing vault file in place.
   - **in index, unchanged** -> SKIP.
3. (Optional) flag pages that are in the index but no longer discovered as
   removed-upstream; do not auto-delete local files without asking.

Identity is the page GUID/FileRef, so re-sync targets the same vault file and
never creates duplicates. This is the existing single-page dedup generalized to
a whole site.

Change-detection signal: prefer the server `Modified` timestamp (REST); fall
back to a content hash when only crawl is available.

## Auth

- Method 1/2 ride the user's **existing browser session** (SSO cookies) via
  same-origin/content-script requests. No new login, no stored credentials.
- Method 3 (Graph) would use OAuth via `chrome.identity`; out of v1 scope.
- No secrets stored by the extension.

## UI / settings shape

- A **"SharePoint" (or "Sites")** tab/section in options.
- "Add a site": input for the site URL (+ optional friendly name). Auto-detect
  and validate the endpoint from the URL; show the resolved site name as
  confirmation.
- Per saved site: last-synced time, page count, a **Sync now** button, and a
  remove option.
- Sync writes into the existing vault (respects the vault folder + index).
- Optional later: scheduled/background sync (alarms) vs manual-only for v1.

## Phasing

- **Phase 1**: add/save sites (URL -> auto-detected endpoint), Method 1 discovery
  with Method 2 fallback, manual "Sync now" doing add/update/skip against the
  vault index. Manual only.
- **Phase 2**: removed-upstream handling, better conflict/versioning UI, richer
  per-site filters (subsites, page libraries).
- **Phase 3**: Graph (Method 3) opt-in, optional scheduled sync.

## Open questions / risks (settle before building)

1. REST read access with cookie auth varies by tenant config; confirm the Site
   Pages list is readable same-origin without a form digest for GETs. If not,
   Method 2 becomes primary sooner.
2. Cross-origin vs content-script: decide the request surface (content script on
   the site is the safe default; background fetch needs host permissions and may
   hit CORS).
3. Change detection when only crawl is available (hash cost on large sites).
4. Scale: large sites (hundreds of pages) need batching + progress + resumability
   (the crawl engine already has some of this).
5. Vault index schema change to hold per-page sync state; migrate existing
   indexes.
6. Permissions/manifest: `host_permissions` for `*.sharepoint.com`, and (Phase 3)
   the identity/OAuth scopes.

## Not in scope for v1

Graph/OAuth, scheduled background sync, deleting local files for
removed-upstream pages, cross-tenant/multi-account handling.
