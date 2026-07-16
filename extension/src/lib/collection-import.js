import { parseUrlList } from "./discover.js";

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function urlsFromValues(values) {
  const candidates = [];
  for (const value of values) {
    candidates.push(...String(value || "").match(/https?:\/\/[^\s<>"']+/gi) || []);
  }
  return parseUrlList(candidates.map((url) => url.replace(/[),.;]+$/, "")).join("\n"));
}

export function extractUrlsFromText(text, { format = "text" } = {}) {
  if (format === "csv") return urlsFromValues(parseCsvRows(text).flat());
  return urlsFromValues(String(text || "").split(/\r?\n/));
}

function findEndOfCentralDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

async function unzipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd < 0) throw new Error("That XLSX file is not a readable ZIP workbook.");
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("The XLSX directory is invalid.");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    let content;
    if (method === 0) {
      content = compressed;
    } else if (method === 8) {
      if (typeof DecompressionStream === "undefined") throw new Error("Compressed XLSX files are not supported by this Chrome version.");
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      content = new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
      throw new Error(`Unsupported XLSX compression method: ${method}.`);
    }
    entries.set(name, content);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function decodeXml(text) {
  return String(text || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
    .replace(/&#x([\da-f]+);/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)));
}

function tagTexts(xml) {
  return [...String(xml || "").matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1])).join("");
}

function sharedStrings(xml) {
  return [...String(xml || "").matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) => tagTexts(match[1]));
}

function worksheetValues(xml, shared) {
  const values = [];
  for (const match of String(xml || "").matchAll(/<c(\s[^>]*)?>([\s\S]*?)<\/c>/g)) {
    const attributes = match[1] || "";
    const body = match[2];
    const type = /\bt="([^"]+)"/.exec(attributes)?.[1] || "";
    if (type === "inlineStr") {
      values.push(tagTexts(body));
      continue;
    }
    const raw = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1];
    if (raw == null) continue;
    values.push(type === "s" ? shared[Number(raw)] || "" : decodeXml(raw));
  }
  return values;
}

export async function extractUrlsFromXlsx(arrayBuffer) {
  const entries = await unzipEntries(arrayBuffer);
  const decoder = new TextDecoder();
  const sharedEntry = entries.get("xl/sharedStrings.xml");
  const shared = sharedEntry ? sharedStrings(decoder.decode(sharedEntry)) : [];
  const values = [];
  for (const [name, content] of entries) {
    const xml = decoder.decode(content);
    if (/^xl\/worksheets\/sheet[^/]*\.xml$/i.test(name)) values.push(...worksheetValues(xml, shared));
    if (/^xl\/worksheets\/_rels\/.*\.rels$/i.test(name)) {
      for (const match of xml.matchAll(/\bTarget="(https?:[^\"]+)"/gi)) values.push(decodeXml(match[1]));
    }
  }
  return urlsFromValues(values);
}

export async function readCollectionFile(file) {
  const name = String(file && file.name || "").toLowerCase();
  if (name.endsWith(".xlsx")) return extractUrlsFromXlsx(await file.arrayBuffer());
  const text = await file.text();
  return extractUrlsFromText(text, { format: name.endsWith(".csv") ? "csv" : "text" });
}
