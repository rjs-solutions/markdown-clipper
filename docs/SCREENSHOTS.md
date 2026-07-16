# Chrome Web Store Asset Playbook

Store assets are generated or captured into the gitignored `dist/store-listing/` folder. Keep
raw captures so a future release can reproduce the same framing.

## Required asset set

| File | Content | Size |
| --- | --- | --- |
| `screenshots/01-capture-1280x800.png` | Popup or in-page panel with metadata and primary actions | 1280×800 |
| `screenshots/02-sharepoint-1280x800.png` | Saved SharePoint site, collapsed inventory, refresh controls | 1280×800 |
| `screenshots/03-collection-1280x800.png` | Collection export setup or completed progress | 1280×800 |
| `screenshots/04-vault-template-1280x800.png` | Knowledge-base/vault or template settings | 1280×800 |
| `screenshots/05-editor-1280x800.png` | Full-page editor with Copy, Download, Save as, and Close | 1280×800 |
| `promo-tiles/small-promo-tile-440x280.png` | Brand-led small promotional tile | 440×280 |
| `promo-tiles/marquee-promo-tile-1400x560.png` | Optional brand-led marquee tile | 1400×560 |

Chrome requires the 128×128 packaged icon, a 440×280 small tile, and at least one screenshot.
Use all five screenshots to explain the workflow, ordered from immediate value to advanced setup.

## Capture rules

- Use a clean Chrome profile or sanitized test content. Never expose internal names, tenant URLs,
  credentials, personal data, or confidential SharePoint content in public images.
- Capture at exactly 1280×800 and 100% zoom. Use one OS, browser chrome style, and theme across
  the set unless a dark-mode shot is intentionally included.
- Show realistic output and visible labels; avoid empty states except when the empty state is the
  feature being explained.
- Prefer the in-page panel for the lead shot because it communicates page-to-Markdown conversion
  in one frame. Use Chrome's docked side panel only if its window-level behavior is explained.
- Promotional tiles should be brand-led rather than raw screenshots and should remain legible at
  half size.

## Validation

Place final files at the paths above and run:

```powershell
npm run store:check
```

The validator checks required filenames and exact image dimensions. It intentionally fails until
the real release images exist; placeholder assets must not pass the store gate.
