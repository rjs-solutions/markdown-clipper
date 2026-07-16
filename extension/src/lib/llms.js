import { parseUrlList } from "./discover.js";

export function parseLlmsText(text, baseUrl = "") {
  const candidates = [];
  const markdownLink = /\[[^\]]*\]\(([^\s)]+)(?:\s+["'][^"']*["'])?\)/g;
  for (const match of String(text || "").matchAll(markdownLink)) candidates.push(match[1]);
  candidates.push(...String(text || "").match(/https?:\/\/[^\s<>"')\]]+/gi) || []);

  const resolved = candidates.flatMap((candidate) => {
    try {
      return [new URL(candidate, baseUrl || undefined).href];
    } catch {
      return [];
    }
  });
  return parseUrlList(resolved.join("\n"));
}

export async function fetchLlmsPages(url, { maxPages = 500, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Could not load llms.txt (status ${response.status}).`);
  return parseLlmsText(await response.text(), url).slice(0, maxPages);
}
