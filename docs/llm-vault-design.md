# LLM Vault, Wiki Preset & Prompt Generator — Design

Status: **design, pre-implementation.** Captures the research and the agreed direction
for turning Markdown Clipper's output into an LLM-readable knowledge base. Nothing here
is built yet; the foundation (vault mode + clip log) is speced first.

## Principle

The extension is a **general-purpose** clipper. These features make its output good raw
material for an LLM ("second brain" / knowledge base), without specializing the tool
around any one user's topic. Topical interests (e.g. AI-visibility research) are served
by clipping normal pages with good metadata plus the prompt generator's task presets —
not by topic-specific capture modes.

## The three features share one foundation

1. **Clip-history log** — the extension must remember what it clipped (url, title,
   relative path, capture date, content-type, tags, description). Today it is
   fire-and-forget; the generator and the index both need this record.
2. **Vault folder** (File System Access API) — the user picks a folder once; the
   extension writes into it directly and can maintain a **living `index.md`** across
   individual clips. Falls back to the existing downloads path when no vault is set or
   permission is lost.

The wiki preset, the prompt generator, and the (future) MCP server all sit on this
foundation and all point at the same vault folder.

## Highest-leverage artifact: `index.md`

Both research threads converged here: pointing an LLM at a generated index is ~10× more
efficient than letting it roam the folder, and it is the one artifact the extension can
produce **without reading disk** — it is written from the extension's own clip log.

Format (also the content-inventory deliverable):

| title | path | source_url | clipped | type | tags | summary |

For site exports, additionally a per-site `index.md` and a master `index.md`, aligned to
the Open Knowledge Format (directory-of-markdown + YAML frontmatter) for portability.

## Frontmatter — a routing layer, not decoration

Its job is to let an LLM decide whether to open a file without reading the body, and to
preserve provenance. `description` must be auto-filled from meta tags — a blank summary
is the most common thing that makes a vault useless.

### `article` (general web)
```yaml
title, source_url, author, published, clipped, description, tags, type: article
```

### `sharepoint`
```yaml
title, source_url, site, path, page_type, last_modified, captured, author, type: sharepoint
```
Site-partitioned folders (`/<site>/<section>/…`) so cross-site duplication and
consistency analysis knows which site each page came from.

### `confluence`
As `article`, plus `space` and `path`.

Deliberately **not** built: a topic-specific `ai-result` schema (prompt/engine/brand
position/sentiment). That specializes a general tool around one interest; the general
path plus prompt presets covers the same need.

## Prompt generator

Emits a paste-able prompt: role/goal + an **inline inventory table built from the clip
log** + the vault path + "read the files, start with the index" + a structured task with
source_url citations. The "can't read disk" limit is moot because the inventory is
supplied inline. Task presets: **synthesis** (themes across all), **comparison** (how a
topic shifted across the capture window), **gap/duplication** (esp. SharePoint estates).

## SharePoint: stay on DOM scraping — do NOT make Graph API core

A site *owner* cannot self-enable Graph API access: app registration, admin consent, and
per-site `Sites.Selected` grants all require tenant-admin involvement the owner does not
control. And `standardWebPart` bodies come back from the API as config JSON, not rendered
text — so the DOM scraper gets **better body fidelity** than the API. Graph is at most a
future opt-in metadata enrichment via delegated auth, never a dependency. The defensible
wedge is exactly the rendered body + citation-grade frontmatter that ShareGate/Syskit
skip (they inventory files, not words).

Positioning note (not a code feature): the sharpest 2026 framing is the Copilot angle —
bad SharePoint content now surfaces as bad Copilot answers, giving owners an external
reason to justify cleanup. "Export, LLM-audit, fix what Copilot would repeat."

## MCP server (future, separate process)

Pairs with vault mode: the extension **writes** the vault, an MCP server **reads** it,
giving any MCP client (Claude Desktop, Cowork, ChatGPT connectors) access to the corpus.
- **Read-the-vault** (schema-aware search/read over the folder): high value, low cost —
  build first.
- **Clip-a-public-URL** (reuse the pure `lib/markdown.js` pipeline server-side): viable
  bonus; honest limit — no JS rendering for SPA-heavy pages.
- **Drive authenticated clipping** (native-messaging bridge to the extension, or Graph):
  high cost, commitment boundary — defer, wants Fable sign-off.

## Build order

1. **Foundation** — clip-history log + vault abstraction (File System Access impl +
   downloads fallback) + a Vault settings section. *(speced first)*
2. **Wiki preset** — content-type frontmatter + auto `description` + `index.md`
   generation (per-crawl now; living cross-clip once vault mode exists).
3. **Prompt generator** — inventory-from-log + vault path + task presets.
4. **MCP server** — read-the-vault, then clip-public-URL.
