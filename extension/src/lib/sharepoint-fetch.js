// SharePoint page-discovery probe (Phase 1b). Opens the saved site in a
// background tab and runs a same-origin credentialed fetch against the Site
// Pages REST list from inside that tab, since reads ride the user's session
// cookies and a cross-origin service-worker fetch would be blocked by CORS.
// See sharepoint-discover.js for the pure URL builder + row normalizer this
// module drives.

import { sitePagesQueryUrl, normalizeDiscoveredPages } from "./sharepoint-discover.js";
import { normalWindowId } from "./crawl.js";

const TAB_READY_TIMEOUT_MS = 20_000;

// Runs in the site tab (isolated world) via chrome.scripting.executeScript.
// Must stay fully self-contained: no imports, no closures over anything but
// its own arguments, since it is serialized and re-parsed in the page.
export async function injectedFetchSitePages(startUrl, maxItems) {
  try {
    let url = startUrl;
    const items = [];
    let pages = 0;

    while (url && items.length < maxItems && pages < 25) {
      const res = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json;odata=nometadata" }
      });

      if (!res.ok) {
        return { ok: false, status: res.status };
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("json")) {
        return { ok: false, status: res.status, reason: "not-json" };
      }

      const json = await res.json();
      const rawItems = (json && (json.value || (json.d && json.d.results))) || [];
      const nextLink = (json && (json["odata.nextLink"] || (json.d && json.d.__next))) || null;

      for (const item of Array.isArray(rawItems) ? rawItems : []) {
        items.push(item);
      }
      url = nextLink;
      pages += 1;
    }

    return { ok: true, status: 200, items };
  } catch (error) {
    return { ok: false, reason: "fetch-failed", message: String(error) };
  }
}

// Saved site records (sharepoint-sites.js) don't carry an explicit origin
// field; derive it from webUrl so normalizeDiscoveredPages can build full
// page URLs even for sites saved before this field existed.
function deriveOrigin(webUrl) {
  try {
    return new URL(webUrl).origin;
  } catch {
    return "";
  }
}

function waitForTabComplete(tabId, timeoutMs = TAB_READY_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) {
        return;
      }
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve(ok);
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") {
        finish(true);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    const timer = setTimeout(() => finish(false), timeoutMs);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab && tab.status === "complete") {
        finish(true);
      }
    }).catch(() => {});
  });
}

// Open the site in a background tab, run the injected fetch, and always
// close the tab afterward. Returns a structured result rather than throwing,
// so callers (the options page) can render friendly status text.
export async function discoverSitePages(site, { top = 100, maxItems = 2000 } = {}) {
  if (!site || !site.apiBase || !site.webUrl) {
    return { ok: false, reason: "invalid-site" };
  }
  if (typeof chrome === "undefined" || !chrome.tabs || !chrome.scripting) {
    return { ok: false, reason: "unavailable", message: "The browser extension APIs are not available." };
  }

  const startUrl = sitePagesQueryUrl(site.apiBase, { top });
  let tab;
  try {
    const windowId = await normalWindowId();
    if (chrome.windows?.getAll && windowId == null) {
      return { ok: false, reason: "no-window", message: "Open a normal Chrome window and try again." };
    }
    tab = await chrome.tabs.create({
      url: site.webUrl,
      active: false,
      ...(windowId == null ? {} : { windowId })
    });
  } catch (error) {
    return { ok: false, reason: "tab-failed", message: error && error.message ? error.message : String(error) };
  }

  try {
    const ready = await waitForTabComplete(tab.id);
    if (!ready) {
      return { ok: false, reason: "tab-timeout", message: "The site tab did not finish loading in time." };
    }

    const injections = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectedFetchSitePages,
      args: [startUrl, maxItems]
    });
    const result = injections && injections[0] && injections[0].result;

    if (!result) {
      return { ok: false, reason: "no-result", message: "The site tab returned no result." };
    }
    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        reason: result.reason,
        message: result.message
      };
    }

    const origin = site.origin || deriveOrigin(site.webUrl);
    const pages = normalizeDiscoveredPages(result.items, origin);
    return { ok: true, pages, count: pages.length, status: result.status };
  } catch (error) {
    return { ok: false, reason: "execute-failed", message: error && error.message ? error.message : String(error) };
  } finally {
    try {
      await chrome.tabs.remove(tab.id);
    } catch {
      // tab may already be gone
    }
  }
}
