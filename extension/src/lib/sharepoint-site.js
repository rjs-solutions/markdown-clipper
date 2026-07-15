// Parse a user-entered SharePoint site URL into its addressable parts. Pure,
// no chrome APIs, no network -- see docs for the "saved SharePoint sites"
// feature. Accepts a root-web URL, a /sites/ or /teams/ site URL, or a page
// URL inside one of those (the page path is discarded down to the site).

function withProtocol(input) {
  const value = String(input || "").trim();
  if (!value) {
    return value;
  }
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
}

export function parseSharePointSite(input) {
  let url;
  try {
    url = new URL(withProtocol(input));
  } catch {
    return { ok: false, reason: "That does not look like a valid URL." };
  }

  const hostname = url.hostname;
  if (!hostname.toLowerCase().endsWith(".sharepoint.com")) {
    return { ok: false, reason: "Enter a SharePoint site URL (something.sharepoint.com)." };
  }

  const tenant = hostname.split(".")[0];
  const origin = url.origin;

  const siteMatch = url.pathname.match(/^\/(sites|teams)\/([^/]+)/);
  const sitePath = siteMatch ? `/${siteMatch[1]}/${siteMatch[2]}` : "";

  const webUrl = origin + sitePath;
  const apiBase = `${webUrl}/_api`;
  const name = sitePath ? sitePath.slice(sitePath.lastIndexOf("/") + 1) : tenant;

  return { ok: true, hostname, tenant, sitePath, origin, webUrl, apiBase, name };
}
