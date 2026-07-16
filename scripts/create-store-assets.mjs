import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const manifest = JSON.parse(await readFile(path.join(rootDir, "extension", "manifest.json"), "utf8"));
const promosOnly = process.argv.includes("--promos-only");
const versionFlag = process.argv.indexOf("--version");
const version = versionFlag >= 0 ? process.argv[versionFlag + 1] : manifest.version;
const rawFlag = process.argv.indexOf("--raw-dir");
const storeDir = path.join(rootDir, "dist", "store-listing");
const rawDir = rawFlag >= 0 ? path.resolve(process.argv[rawFlag + 1]) : path.join(storeDir, `raw-captures-${version}`);
const screenshotDir = path.join(storeDir, "screenshots");
const plainDir = path.join(storeDir, "screenshots-plain");
const promoDir = path.join(storeDir, "promo-tiles");
const brandDir = path.join(rootDir, "docs", "brand");
const docsImageDir = path.join(rootDir, "docs", "images");
const iconPath = path.join(rootDir, "extension", "assets", "icons", "icon-128.png");

const shots = [
  { raw: "01-capture-raw.png", output: "01-capture-1280x800.png", headline: "Turn the page in front of you into clean Markdown", body: "Review the capture, adjust metadata, then copy or download without leaving the page.", chips: ["SharePoint-aware", "Copy or download", "Movable panel"] },
  { raw: "02-collections-raw.png", output: "02-collections-1280x800.png", headline: "Keep important sites organized as reusable collections", body: "Save inventories, refresh for changes, and give every collection its own local folder.", chips: ["Saved collections", "Change detection", "Local library"] },
  { raw: "03-collection-capture-raw.png", output: "03-collection-capture-1280x800.png", headline: "Capture pages from a list, sitemap, llms.txt, or whole site", body: "Bring related pages together, then save, sync, or export clean Markdown.", chips: ["TXT, CSV, XLSX", "Sitemaps", "ZIP + index.md"] },
  { raw: "04-knowledge-base-raw.png", output: "04-knowledge-base-1280x800.png", headline: "Build a local knowledge base that stays portable", body: "Choose a vault, apply repeatable metadata, and prepare focused prompts for your clips.", chips: ["Local vault", "Templates", "LLM-ready"] },
  { raw: "05-editor-raw.png", output: "05-editor-1280x800.png", headline: "Polish the Markdown before it becomes a file", body: "Edit content and metadata in a focused full-page workspace, then copy or save it.", chips: ["Full-page editor", "Live output", "Save anywhere"] }
];

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function pngSize(bytes) {
  if (bytes.toString("ascii", 1, 4) !== "PNG") throw new Error("Expected a PNG image.");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function dataUri(bytes) {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function renderSvg(svg, width) {
  return new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: true, defaultFontFamily: "Segoe UI" } }).render().asPng();
}

async function saveSvg(svg, width, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderSvg(svg, width));
  process.stdout.write(`Created ${path.relative(rootDir, outputPath)}\n`);
}

function chipMarkup(labels) {
  let x = 74;
  return labels.map((label) => {
    const width = Math.max(112, 30 + label.length * 8.2);
    const markup = `<rect x="${x}" y="174" width="${width}" height="34" rx="17" fill="#dbeafe" stroke="#bfdbfe"/><text x="${x + 16}" y="196" class="chip">${escapeXml(label)}</text>`;
    x += width + 12;
    return markup;
  }).join("");
}

function marketingSvg(raw, shot) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f4f8fb"/><stop offset="1" stop-color="#e4eef8"/></linearGradient><filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#0f2740" flood-opacity=".18"/></filter><clipPath id="preview"><rect x="70" y="232" width="1140" height="520" rx="18"/></clipPath><style>.headline{font-family:'Segoe UI',Arial,sans-serif;font-size:36px;font-weight:700;fill:#0b1f33}.body{font-family:'Segoe UI',Arial,sans-serif;font-size:20px;font-weight:400;fill:#40576d}.chip{font-family:'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:600;fill:#1d4f91}</style></defs><rect width="1280" height="800" fill="url(#bg)"/><path d="M0 0h1280v8H0z" fill="#21b8b5"/><path d="M560 0h720v8H560z" fill="#4c91f6"/><text x="74" y="74" class="headline">${escapeXml(shot.headline)}</text><text x="74" y="125" class="body">${escapeXml(shot.body)}</text>${chipMarkup(shot.chips)}<rect x="58" y="220" width="1164" height="544" rx="26" fill="#fff" filter="url(#shadow)"/><g clip-path="url(#preview)"><image href="${dataUri(raw)}" x="70" y="232" width="1140" height="520" preserveAspectRatio="xMidYMid slice"/></g></svg>`;
}

function promoSvg(icon, width, height, headline, body, social = false) {
  const wide = width > 800;
  const pad = wide ? 72 : 28;
  const iconSize = wide ? 126 : 76;
  const brandSize = wide ? 34 : 21;
  const headlineSize = social ? 52 : wide ? 46 : 28;
  const bodySize = wide ? 23 : 15;
  const headlineY = social ? 300 : wide ? 292 : 166;
  const bodyY = social ? 382 : wide ? 374 : 224;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#08131f"/><stop offset=".58" stop-color="#102c44"/><stop offset="1" stop-color="#164b67"/></linearGradient><radialGradient id="glow"><stop stop-color="#4c91f6" stop-opacity=".34"/><stop offset="1" stop-color="#4c91f6" stop-opacity="0"/></radialGradient><style>.brand{font-family:'Segoe UI',Arial,sans-serif;font-size:${brandSize}px;font-weight:700;fill:#f5fbff}.headline{font-family:'Segoe UI',Arial,sans-serif;font-size:${headlineSize}px;font-weight:700;fill:#fff}.body{font-family:'Segoe UI',Arial,sans-serif;font-size:${bodySize}px;font-weight:400;fill:#c9dae8}</style></defs><rect width="${width}" height="${height}" fill="url(#bg)"/><circle cx="${width * .82}" cy="${height * .18}" r="${height * .7}" fill="url(#glow)"/><path d="M0 ${height - 9}h${width}v9H0z" fill="#21b8b5"/><path d="M${width * .44} ${height - 9}h${width * .56}v9H${width * .44}z" fill="#4c91f6"/><image href="${dataUri(icon)}" x="${pad}" y="${pad}" width="${iconSize}" height="${iconSize}"/><text x="${pad + iconSize + 20}" y="${pad + iconSize * .62}" class="brand">Markdown Clipper</text><text x="${pad}" y="${headlineY}" class="headline">${escapeXml(headline)}</text><text x="${pad}" y="${bodyY}" class="body">${escapeXml(body)}</text></svg>`;
}

await mkdir(promoDir, { recursive: true });
await mkdir(brandDir, { recursive: true });
const icon = await readFile(iconPath);
await saveSvg(promoSvg(icon, 440, 280, "Web pages to clean Markdown", "Capture, organize, and export—locally."), 440, path.join(promoDir, "small-promo-tile-440x280.png"));
await saveSvg(promoSvg(icon, 1400, 560, "Capture the web as clean, portable Markdown", "Clip one page or capture a collection, then export clean Markdown—private and local."), 1400, path.join(promoDir, "marquee-promo-tile-1400x560.png"));
await saveSvg(promoSvg(icon, 1280, 640, "Capture the web as clean Markdown", "SharePoint-aware clipping, reusable collections, and local knowledge-base workflows.", true), 1280, path.join(brandDir, "social-preview-1280x640.png"));

if (promosOnly) process.exit(0);
if (!existsSync(rawDir)) throw new Error(`Raw capture folder not found: ${rawDir}. Run npm run store:capture first.`);

await mkdir(screenshotDir, { recursive: true });
await mkdir(plainDir, { recursive: true });
for (const shot of shots) {
  const rawPath = path.join(rawDir, shot.raw);
  if (!existsSync(rawPath)) throw new Error(`Missing raw capture: ${rawPath}`);
  const raw = await readFile(rawPath);
  const size = pngSize(raw);
  if (size.width !== 1280 || size.height !== 800) throw new Error(`${shot.raw} must be 1280x800; got ${size.width}x${size.height}.`);
  await saveSvg(marketingSvg(raw, shot), 1280, path.join(screenshotDir, shot.output));
  await writeFile(path.join(plainDir, shot.output), raw);
}

await mkdir(docsImageDir, { recursive: true });
await copyFile(path.join(screenshotDir, "01-capture-1280x800.png"), path.join(docsImageDir, "capture.png"));
await copyFile(path.join(screenshotDir, "02-collections-1280x800.png"), path.join(docsImageDir, "collections.png"));

process.stdout.write(`Store artwork prepared for Markdown Clipper ${version}.\n`);
