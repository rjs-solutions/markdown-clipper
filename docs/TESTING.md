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
- [ ] **Open in tab** shows the Markdown preview.
- [ ] A long, lazy-loading page captures the below-the-fold content (scroll-to-load worked).

## 3. Single-page capture — general webpage (once Phase 2 lands)

- [ ] On a news/article page, capture produces clean article Markdown (Readability mode).
- [ ] On a non-article page, the full-page fallback still produces usable Markdown.

## 4. Permissions sanity

- [ ] On the extensions card, confirm **no host permissions requested at install**.
- [ ] Optional host access is requested only when starting a site export (Phase 4).

## Expected console noise from captured sites (not bugs)

When the spider opens target pages in real tabs, those pages' own console output appears under
`chrome://extensions` → the extension → **Errors**. Messages pointing at third-party URLs (the
captured site) are not defects. Anything referencing `chrome-extension://…` or the extension's
own files **is** worth investigating.
