import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const manifest = JSON.parse(await fs.readFile(path.join(rootDir, "extension", "manifest.json"), "utf8"));
const version = process.argv[2] || manifest.version;
const outputDir = path.join(rootDir, "dist", "store-listing", `raw-captures-${version}`);
const reportPath = path.join(outputDir, "capture-report.json");
const playwrightModule = process.env.MARKDOWN_CLIPPER_PLAYWRIGHT_CORE;
if (!playwrightModule) throw new Error("Set MARKDOWN_CLIPPER_PLAYWRIGHT_CORE to Playwright Core's index.mjs URL.");
const { chromium } = await import(playwrightModule);

const demoPages = {
  "/": `<!doctype html><html><head><meta charset="utf-8"><title>Practical guide to accessible content</title><meta name="description" content="A concise guide to building accessible, durable web content for every reader."><style>*{box-sizing:border-box}body{margin:0;background:#f6f8fb;color:#172331;font:16px/1.65 system-ui,sans-serif}header{height:68px;background:#102b43;color:white;display:flex;align-items:center;padding:0 54px;font-weight:700}header span{color:#48d1cc}main{width:min(760px,calc(100% - 420px));margin:52px 0 100px 86px;background:white;border:1px solid #dfe7ef;border-radius:18px;padding:48px 58px;box-shadow:0 18px 50px rgba(21,44,66,.09)}.eyebrow{color:#147c85;font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:13px}h1{font-size:42px;line-height:1.12;margin:12px 0 18px}h2{margin-top:34px}p{color:#42566a}aside{border-left:4px solid #21b8b5;background:#edf9f8;padding:16px 20px;border-radius:0 8px 8px 0}</style></head><body><header><span>Northstar</span>&nbsp; Documentation</header><main><article><div class="eyebrow">Content design</div><h1>Practical guide to accessible content</h1><p>Make every page easier to understand, navigate, and reuse. This example article contains realistic headings, links, and metadata without private information.</p><h2>Start with a clear structure</h2><p>Use descriptive headings, concise paragraphs, and meaningful link text. Readers and assistive technologies can then scan the page with confidence.</p><aside><strong>Good documentation travels well.</strong><br>Clean structure also produces cleaner Markdown for search, notes, and knowledge tools.</aside><h2>Keep the source portable</h2><p>Prefer durable URLs and plain language. Review the result before publishing or sharing it.</p></article></main></body></html>`,
  "/guide/getting-started": "<!doctype html><title>Getting started</title><main><h1>Getting started</h1><p>Install, configure, and capture your first page.</p></main>",
  "/guide/collections": "<!doctype html><title>Collections</title><main><h1>Collections</h1><p>Keep related pages together and refresh them over time.</p></main>"
};

function startDemoServer() {
  const server = http.createServer((request, response) => {
    const body = demoPages[new URL(request.url, "http://127.0.0.1").pathname];
    response.writeHead(body ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
    response.end(body || "Not found");
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function createAutomationExtension(tempDir) {
  const extensionDir = path.join(tempDir, "extension");
  await fs.cp(path.join(rootDir, "extension"), extensionDir, { recursive: true });
  const manifestPath = path.join(extensionDir, "manifest.json");
  const automationManifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  automationManifest.host_permissions = ["<all_urls>"];
  delete automationManifest.optional_host_permissions;
  await fs.writeFile(manifestPath, `${JSON.stringify(automationManifest, null, 2)}\n`);
  return extensionDir;
}

async function capture(page, filename) {
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(outputDir, filename), type: "png", animations: "disabled" });
  process.stdout.write(`Captured ${filename}\n`);
}

await fs.mkdir(outputDir, { recursive: true });
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "markdown-clipper-store-capture-"));
const extensionDir = await createAutomationExtension(tempDir);
const userDataDir = path.join(tempDir, "profile");
const { server, origin } = await startDemoServer();
const startedAt = new Date().toISOString();
let context;

try {
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: process.env.MARKDOWN_CLIPPER_CHROME_EXE || undefined,
    viewport: { width: 1280, height: 800 },
    screen: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, "--window-size=1280,800", "--no-first-run", "--no-default-browser-check"]
  });

  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 30_000 });
  const extensionId = new URL(worker.url()).host;
  const now = Date.now();
  const collections = [
    { id: "demo-docs", name: "Product documentation", type: "website", sourceMode: "sitemap", sourceUrl: "https://docs.example.com/sitemap.xml", url: "https://docs.example.com", webUrl: "https://docs.example.com", libraryPath: "websites/product-documentation", addedAt: now - 86400000, collapsed: false },
    { id: "demo-sharepoint", name: "Team knowledge hub", type: "sharepoint", sourceMode: "sharepoint", sourceUrl: "https://contoso.sharepoint.com/sites/knowledge", url: "https://contoso.sharepoint.com/sites/knowledge", webUrl: "https://contoso.sharepoint.com/sites/knowledge", libraryPath: "sharepoint/team-knowledge-hub", addedAt: now - 172800000, collapsed: true }
  ];
  await worker.evaluate(async ({ collections, now }) => {
    await chrome.storage.sync.set({ theme: "light", defaultAction: "inpage", knowledgeBasePreset: true, vaultEnabled: true, collectionSyncFrequency: "weekly", savedCollections: { version: 1, items: collections } });
    await chrome.storage.local.set({ sharepointSiteInventories: {
      "demo-docs": { lastRefreshedAt: now - 3600000, pages: [
        { title: "Getting started", url: "https://docs.example.com/guide/getting-started", modified: new Date(now - 86400000).toISOString() },
        { title: "Collections", url: "https://docs.example.com/guide/collections", modified: new Date(now - 172800000).toISOString() },
        { title: "Knowledge base workflow", url: "https://docs.example.com/guide/knowledge-base", modified: new Date(now - 259200000).toISOString() }
      ] }, "demo-sharepoint": { lastRefreshedAt: now - 7200000, pages: [] }
    } });
    await chrome.storage.session.set({ "edit:store-demo": {
      result: { title: "Practical guide to accessible content", url: "https://docs.example.com/guides/accessible-content", markdown: "Make every page easier to understand, navigate, and reuse.\n\n## Start with a clear structure\n\nUse descriptive headings, concise paragraphs, and meaningful link text.\n\n> **Good documentation travels well.** Clean structure also produces cleaner Markdown for search, notes, and knowledge tools.\n\n## Keep the source portable\n\nPrefer durable URLs and plain language.", metadata: { description: "A concise guide to building accessible, durable web content for every reader.", author: "Documentation Team", published: "2026-07-10", site: "Northstar Documentation", tags: ["accessibility", "documentation"] }, variables: {} },
      fields: { title: "Practical guide to accessible content", filenameBase: "practical-guide-accessible-content", tags: "accessibility, documentation" }, settings: { theme: "light", useTemplate: false, metadataStyle: "frontmatter", includeTitleHeading: true }
    } });
  }, { collections, now });

  const article = await context.newPage();
  await article.goto(origin, { waitUntil: "domcontentloaded" });
  await article.bringToFront();
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async (moduleUrl, tabId) => (await import(moduleUrl)).togglePanel(tabId), args: [chrome.runtime.getURL("src/content/panel-host.js"), tab.id] });
  });
  await article.locator("#mwc-panel-host").waitFor({ state: "attached", timeout: 30_000 });
  await article.waitForTimeout(2200);
  await capture(article, "01-capture-raw.png");

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/src/options/index.html?section=collections`, { waitUntil: "domcontentloaded" });
  await options.locator('[data-section="collections"]').waitFor({ state: "visible" });
  await capture(options, "02-collections-raw.png");

  const crawl = await context.newPage();
  await crawl.goto(`chrome-extension://${extensionId}/src/crawl/index.html?mode=list`, { waitUntil: "domcontentloaded" });
  await crawl.locator("#urls").fill([`${origin}/`, `${origin}/guide/getting-started`, `${origin}/guide/collections`].join("\n"));
  await crawl.locator("#collection-name").fill("Documentation starter set");
  await crawl.locator("#output").selectOption("both");
  await capture(crawl, "03-collection-capture-raw.png");

  await options.goto(`chrome-extension://${extensionId}/src/options/index.html?section=knowledgeBase`, { waitUntil: "domcontentloaded" });
  await options.locator('[data-section="knowledgeBase"]').waitFor({ state: "visible" });
  await capture(options, "04-knowledge-base-raw.png");

  const editor = await context.newPage();
  await editor.goto(`chrome-extension://${extensionId}/src/editor/index.html?id=store-demo`, { waitUntil: "domcontentloaded" });
  await editor.locator("#app").waitFor({ state: "visible" });
  await capture(editor, "05-editor-raw.png");

  await fs.writeFile(reportPath, `${JSON.stringify({ version, startedAt, completedAt: new Date().toISOString(), viewport: { width: 1280, height: 800 }, source: "sanitized local demo", files: ["01-capture-raw.png", "02-collections-raw.png", "03-collection-capture-raw.png", "04-knowledge-base-raw.png", "05-editor-raw.png"] }, null, 2)}\n`);
  process.stdout.write(`Wrote ${path.relative(rootDir, reportPath)}\n`);
} finally {
  server.close();
  await context?.close().catch(() => {});
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
}
