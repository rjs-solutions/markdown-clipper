# Publishing Markdown Clipper

## 1. Pre-publish gate

- [ ] Pull the intended release branch and confirm the working tree is clean.
- [ ] Run `npm ci`, then `npm run release:check`.
- [ ] Run `npm run vendor` and confirm it creates no unexpected diff.
- [ ] Confirm `extension/manifest.json`, `package.json`, `CHANGELOG.md`, and this listing all use
      the intended version.
- [ ] Remove and re-add the unpacked `extension/` folder after manifest changes.
- [ ] Complete [browser-verification-checklist.md](browser-verification-checklist.md), including
      an authenticated SharePoint capture, saved-collection refresh/import/export, popup, in-page panel,
      Chrome side panel, templates, vault save, and collection export.
- [ ] Confirm the public [privacy policy](../PRIVACY.md) matches the dashboard disclosures.
- [ ] Capture the listing images in [SCREENSHOTS.md](SCREENSHOTS.md), then run
      `npm run store:check`.

## 2. Build the package

```powershell
.\scripts\package-extension.ps1
```

This creates `dist\markdown-clipper-<version>.zip` with `manifest.json` at the ZIP root and
validates the archive layout. Rebuild after any change under `extension/`.

## 3. Chrome Web Store dashboard

1. Open the Chrome Web Store Developer Dashboard and create or select Markdown Clipper.
2. **Package:** upload the versioned ZIP from `dist/` and resolve every validation warning.
3. **Store listing:** paste the title, descriptions, category, language, URLs, and release notes
   from [STORE_LISTING.md](STORE_LISTING.md). Upload the assets in the documented order.
4. **Privacy practices:** paste the single-purpose and permission justifications from the same
   document. Disclose Website content and browsing activity, certify Limited Use, select no
   remote code, and use the public privacy-policy URL.
5. **Distribution:** confirm visibility, regions, and pricing. Choose automatic or deferred
   publishing intentionally.
6. **Test instructions:** explain that normal capture works on any public article and that the
   SharePoint flows require a signed-in SharePoint session. Include a small public-page smoke
   path so review is not blocked by private corporate content.
7. Save every tab, re-check the package version and screenshots, then submit for review.

## 4. Release sequence

1. Commit the verified source and release documents; push and merge into `main`.
2. Verify README, privacy, support, and listing links on public GitHub.
3. Build the ZIP from that exact source state.
4. Tag the submitted commit as `v<version>` and push the tag.
5. Keep the submitted ZIP and final listing assets in the local gitignored `dist/` archive.
6. Record the Web Store item ID and final listing URL in this document after first publication.

## Permission posture

Required permissions are tied to visible features: active-page collection, on-demand scripting,
downloads, settings/state, side-panel display, crawl recovery, and context-menu commands. The
only install-time host is X's public syndication endpoint. Arbitrary HTTP/HTTPS access is optional
and requested for the exact selected origin. There is no `tabs`, `cookies`, `history`,
`unlimitedStorage`, `debugger`, or persistent content-script access.

## Language

The extension and listing are currently English-only. There is no `_locales/` directory or
`default_locale`, which is appropriate until UI localization is added.
