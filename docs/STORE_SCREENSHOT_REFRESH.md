# Chrome Web Store Screenshot Refresh

Use this checklist whenever a release changes visible UI, primary actions, or positioning.

## Automated path

```powershell
npm ci
npm run release:check
npm run store:prepare
```

Review the five files in `dist/store-listing/screenshots/`, the two files under
`dist/store-listing/promo-tiles/`, and `docs/brand/social-preview-1280x640.png`.

## Approval checklist

- [ ] Every screenshot is 1280×800 PNG with square outer corners and full-canvas artwork.
- [ ] The product UI comes from the exact source version being submitted.
- [ ] Headline, body, and chips describe only visible, shipping capabilities.
- [ ] No internal company, tenant, user, credential, or confidential page data is visible.
- [ ] Copy and controls remain legible when the screenshot is viewed at 640×400.
- [ ] The lead screenshot clearly shows page-to-Markdown capture and primary actions.
- [ ] Collections and Import Collection screenshots explain organization without overwhelming the viewer.
- [ ] Promo tiles use the current packaged icon and match the README/social preview.
- [ ] `capture-report.json` names the intended version and sanitized demo source.
- [ ] `npm run store:check` passes.

## GitHub refresh

The asset generator refreshes the lead and Collections images under `docs/images/` with stable
README-friendly names. After visual approval, commit those files with the release documentation
so GitHub represents the same version users see in the store.

Do not commit the full `dist/` release archive. It is intentionally ignored so old raw captures,
packages, and dashboard-upload artifacts do not bloat the repository.
