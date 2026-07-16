# Publishing

## 1. Pre-flight
- [ ] `npm test` passes and `npm run lint` is clean.
- [ ] `npm run vendor` has been run (so `extension/src/vendor/` is current).
- [ ] `extension/manifest.json` and `package.json` versions match and are bumped.
- [ ] Worked through [TESTING.md](TESTING.md) with the unpacked `extension/` loaded.
- [ ] `CHANGELOG.md` has an entry for this version.

## 2. Package
```powershell
.\scripts\package-extension.ps1
```
This zips the **contents** of `extension/` (manifest at the ZIP root) to
`dist\markdown-clipper-<version>.zip` and validates the layout.

## 3. Chrome Web Store
1. Go to the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Create or select the item; upload the ZIP from `dist/`.
3. Fill the listing from [STORE_LISTING.md](STORE_LISTING.md) (name, descriptions, category).
4. Add screenshots (1280×800 or 640×400) showing: the popup actions, a captured Markdown
   result, the options/templating page, and the site-export page.
5. Complete the **Privacy** tab:
   - Single purpose: convert web pages to Markdown.
   - Justify each permission using STORE_LISTING.md.
   - Declare no data collection; link [PRIVACY.md](../PRIVACY.md).
6. Submit for review.

## 4. After publishing
- [ ] Tag the release in git (e.g. `git tag v<version>`).
- [ ] Keep the packaged ZIP in `dist/` (gitignored) for your records.

## Notes
- The only install-time host permission is X/Twitter's public syndication endpoint. Site export
  requests access to specific sites at runtime. Both are covered in STORE_LISTING.md and
  PRIVACY.md.
- All third-party libraries are bundled locally (no remote code); licenses are in
  [NOTICE.md](../NOTICE.md).
