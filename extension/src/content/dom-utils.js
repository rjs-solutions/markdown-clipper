// Small DOM helpers shared by the content-side modules. These run in the page
// (isolated world), so a live `document`/`window` is always available.

export function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function describeElement(element) {
  if (!element || !element.tagName) {
    return "document";
  }
  const parts = [element.tagName.toLowerCase()];
  if (element.id) {
    parts.push(`#${element.id}`);
  }
  if (element.classList && element.classList.length > 0) {
    parts.push(`.${Array.from(element.classList).slice(0, 3).join(".")}`);
  }
  return parts.join("");
}

export function isVisible(element) {
  if (!element || element.nodeType !== 1) {
    return true;
  }
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0 || getVisibleText(element).length > 0;
}

export function getVisibleText(element) {
  return element ? (element.innerText || element.textContent || "") : "";
}

export function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(value);
  }
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function looksLikeDate(value) {
  return /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(value);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
