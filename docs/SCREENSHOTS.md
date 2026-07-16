# Screenshot and Store Asset Playbook

Markdown Clipper uses a repeatable two-stage process: capture clean product screenshots, then
apply short marketing labels and generate promotional artwork. The release outputs live under
the gitignored `dist/store-listing/` directory; the reusable scripts and GitHub social preview
are committed.

Chrome's current image guidance calls for at least one—and preferably five—screenshots at
1280×800 or 640×400, plus a 440×280 small promotional tile. A 1400×560 marquee tile is optional
but recommended for featuring eligibility. See Chrome's official
[image requirements](https://developer.chrome.com/docs/webstore/images) and
[listing guidance](https://developer.chrome.com/docs/webstore/best-listing).

## One-command refresh

```powershell
npm run store:prepare
```

That command:

1. opens an isolated temporary Chromium profile with a temporary copy of the extension;
2. serves sanitized local demo content with no company, tenant, credential, or personal data;
3. captures five actual extension surfaces at 1280×800;
4. creates labeled store screenshots, plain screenshot copies, small/marquee promo tiles, and
   the GitHub social preview; and
5. validates filenames, PNG format, and exact dimensions.

The automation copy temporarily grants broad site access only inside its disposable profile so
permission prompts do not make the capture nondeterministic. The packaged manifest is never
modified, and the temporary extension/profile are removed after capture.

## Five-shot story

| Order | Raw capture | Final store file | What it communicates |
| --- | --- | --- | --- |
| 1 | `01-capture-raw.png` | `01-capture-1280x800.png` | A real page beside the movable capture panel and primary Copy/Download actions |
| 2 | `02-collections-raw.png` | `02-collections-1280x800.png` | Saved website and SharePoint collections, refresh, export, and local folders |
| 3 | `03-collection-capture-raw.png` | `03-collection-capture-1280x800.png` | Multi-page capture from a URL list, sitemap, `llms.txt`, or crawl, with combined Markdown as the download default |
| 4 | `04-knowledge-base-raw.png` | `04-knowledge-base-1280x800.png` | Local vault, metadata, templates, and prompt-oriented knowledge workflows |
| 5 | `05-editor-raw.png` | `05-editor-1280x800.png` | Full-page editing before copying or saving Markdown |

Lead with the immediate page-to-Markdown value, then show organization, breadth, knowledge-base
workflows, and final polish. This order also matches [STORE_LISTING.md](STORE_LISTING.md).

## Output layout

```text
dist/store-listing/
├── raw-captures-<version>/
│   ├── 01-capture-raw.png
│   ├── 02-collections-raw.png
│   ├── 03-collection-capture-raw.png
│   ├── 04-knowledge-base-raw.png
│   ├── 05-editor-raw.png
│   └── capture-report.json
├── screenshots/                 # labeled, upload these to the store
├── screenshots-plain/           # unframed 1280×800 product captures
└── promo-tiles/
    ├── small-promo-tile-440x280.png
    └── marquee-promo-tile-1400x560.png
```

The generator also writes `docs/brand/social-preview-1280x640.png` for GitHub's repository
social preview and refreshes `docs/images/capture.png` plus `docs/images/collections.png` from
the labeled set. Review those product images before committing them.

## Capture and framing separately

```powershell
npm run store:capture
npm run store:assets
npm run store:check
```

To regenerate only promo tiles and the GitHub social image after a copy or icon adjustment:

```powershell
npm run store:promos
```

Pass an explicit version to the PowerShell capture wrapper or an alternate raw directory to
the artwork generator when rebuilding an older release:

```powershell
.\scripts\capture-store-screenshots.ps1 -Version 1.1.0
node scripts/create-store-assets.mjs --version 1.1.0
node scripts/create-store-assets.mjs --raw-dir C:\path\to\approved-raws
```

## Manual fallback

If automated capture is unavailable:

1. Use a clean Chrome profile with the unpacked `extension/` folder loaded.
2. Use only public or purpose-built demo content—never an internal SharePoint tenant.
3. Set Chrome zoom to 100% and the viewport to exactly 1280×800.
4. Reproduce the five scenarios above and save the exact raw filenames under
   `dist/store-listing/raw-captures-<version>/`.
5. Run `npm run store:assets` and `npm run store:check`.

Before upload, inspect every image at full size and at roughly half size. Reject captures with
private information, clipped controls, illegible text, transient permission prompts, cursor
artifacts, or feature claims that are not present in the submitted package.
