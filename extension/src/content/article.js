// Generic article extraction via Mozilla Readability, for non-SharePoint pages.
// Runs Readability on a clone so the live page is untouched. DOM-bound.

import { Readability } from "../vendor/readability.js";
import { cleanText } from "./dom-utils.js";

// Returns { title, content (HTML), textContent, byline, excerpt, siteName,
// length } or null if Readability cannot find an article.
export function parseArticle() {
  try {
    const docClone = document.cloneNode(true);
    const reader = new Readability(docClone, { keepClasses: false });
    const result = reader.parse();
    if (!result || !result.content) {
      return null;
    }
    return {
      title: cleanText(result.title || ""),
      content: result.content,
      textContent: result.textContent || "",
      byline: cleanText(result.byline || ""),
      excerpt: cleanText(result.excerpt || ""),
      siteName: cleanText(result.siteName || ""),
      length: result.length || 0
    };
  } catch {
    return null;
  }
}
