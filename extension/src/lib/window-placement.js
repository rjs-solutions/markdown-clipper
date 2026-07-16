const PANEL_GEOMETRY_KEY = "mwcPanelGeometry";

export function collectionWindowBounds(browserWindow, panelGeometry, { width = 620, height = 760, gap = 14 } = {}) {
  const outerLeft = Number(browserWindow && browserWindow.left) || 0;
  const outerTop = Number(browserWindow && browserWindow.top) || 0;
  const outerWidth = Math.max(width, Number(browserWindow && browserWindow.width) || width);
  const outerHeight = Math.max(480, Number(browserWindow && browserWindow.height) || height);
  const targetHeight = Math.min(height, Math.max(520, outerHeight - 72));
  const panelLeft = panelGeometry && Number.isFinite(panelGeometry.left)
    ? outerLeft + panelGeometry.left
    : outerLeft + outerWidth - 480 - 12;
  const left = Math.max(outerLeft + 12, Math.min(panelLeft - width - gap, outerLeft + outerWidth - width - 12));
  const top = Math.max(outerTop + 36, outerTop + 56);
  return { left: Math.round(left), top: Math.round(top), width, height: Math.round(targetHeight) };
}

export async function openCollectionWindow(query = "") {
  const [browserWindow, stored] = await Promise.all([
    chrome.windows.getCurrent(),
    chrome.storage.local.get(PANEL_GEOMETRY_KEY)
  ]);
  const suffix = query ? `?${query.replace(/^\?/, "")}` : "";
  return chrome.windows.create({
    url: chrome.runtime.getURL(`src/crawl/index.html${suffix}`),
    type: "popup",
    ...collectionWindowBounds(browserWindow, stored && stored[PANEL_GEOMETRY_KEY])
  });
}
