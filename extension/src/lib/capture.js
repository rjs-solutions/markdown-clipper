// Inject the ES-module collector into a tab and return its result. The injected
// function is tiny and serializable: it dynamically imports the collector
// (a web-accessible module) in the page's isolated world and returns its
// JSON-serializable result. Reused by the popup and the site spider.

// Runs in the page (isolated world).
async function injectedCollect(moduleUrl, options) {
  try {
    const mod = await import(moduleUrl);
    return await mod.collectPage(options);
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) };
  }
}

export async function capturePage(tabId, options) {
  const moduleUrl = chrome.runtime.getURL("src/content/collect.js");
  const injections = await chrome.scripting.executeScript({
    target: { tabId },
    func: injectedCollect,
    args: [moduleUrl, options]
  });
  const result = injections && injections[0] && injections[0].result;
  if (!result || !result.ok) {
    throw new Error((result && result.error) || "The page could not be captured.");
  }
  return result;
}
