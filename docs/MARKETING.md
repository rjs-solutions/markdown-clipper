# Marketing Message Guide

This file keeps Chrome Web Store, GitHub, promo-tile, and screenshot language aligned. Update it
when the product's primary workflow changes, then refresh the generated assets.

## Positioning

**Product:** Markdown Clipper

**Primary promise:** Capture the web as clean, portable Markdown.

**Audience:** People who save web and SharePoint content into notes, documentation, local search,
or LLM-ready knowledge collections.

**Differentiators:**

- first-class SharePoint extraction without preview-time page scrolling;
- popup, docked side panel, or movable in-page panel;
- local vaults and per-collection folders instead of a developer-hosted backend;
- reusable SharePoint, Confluence, website, and custom URL collections;
- sitemap, `llms.txt`, crawl, TXT, CSV, and XLSX intake; and
- local-only conversion with runtime site access for user-started collection work.

## Approved short copy

- **Primary headline:** Capture the web as clean, portable Markdown
- **Short tile headline:** Web pages to clean Markdown
- **Support line:** Clip one page or export a collection—private, local, and ready for your
  knowledge workflow.
- **GitHub line:** SharePoint-aware clipping, reusable collections, and local knowledge-base
  workflows.

Avoid unsupported superlatives, competitor references, promises of perfect extraction, or claims
that content is encrypted by Markdown Clipper. Chrome may sync some settings through the user's
Chrome profile, and selected X/Twitter status IDs may be sent to X's public syndication endpoint;
the privacy copy must retain those qualifications.

## Screenshot headlines

1. **Turn the page in front of you into clean Markdown**
2. **Keep important sites organized as reusable collections**
3. **Export a URL list, sitemap, llms.txt, or whole site**
4. **Build a local knowledge base that stays portable**
5. **Polish the Markdown before it becomes a file**

The canonical bodies and feature chips live in `scripts/create-store-assets.mjs` so a regenerated
set cannot silently drift from the approved design.

## Visual system

- Deep navy background: `#08131f` to `#164b67`
- Teal accent: `#21b8b5`
- Blue accent: `#4c91f6`
- Purple clip detail: inherited from the extension icon
- Typeface: Segoe UI with Arial/system fallback
- Tone: calm, capable, private, and practical

Use the actual extension icon without extra badges. Keep promo tiles brand-led and uncluttered;
use labeled screenshots to explain workflows. Do not place internal tenant names, private page
content, ratings, store badges, or ranking claims in any artwork.
