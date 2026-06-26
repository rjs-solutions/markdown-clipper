(() => {
  const LOADED_FLAG = "__sharePointMarkdownExporterLoaded";

  if (window[LOADED_FLAG]) {
    return;
  }

  window[LOADED_FLAG] = true;

  const DEFAULT_OPTIONS = {
    includeSource: true,
    maxScrollMs: 12000,
    scrollBeforeCapture: true,
    scrollPauseMs: 450
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "SPMD_COLLECT") {
      return false;
    }

    collectPage(message.options || {})
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error && error.message ? error.message : String(error)
        });
      });

    return true;
  });

  async function collectPage(rawOptions) {
    const options = sanitizeOptions(rawOptions);
    const originalScroll = getCurrentScroll();
    let scrollStats = null;

    if (options.scrollBeforeCapture) {
      scrollStats = await scrollThroughPage(options);
      await sleep(250);
    }

    const root = findContentRoot();
    const title = getPageTitle(root);
    const metadata = collectPageMetadata(root);
    const markdown = buildMarkdown(root, title, metadata, options);

    restoreScroll(originalScroll);

    return {
      markdown,
      metadata,
      title,
      url: location.href,
      stats: {
        characters: markdown.length,
        root: describeElement(root),
        scroll: scrollStats
      }
    };
  }

  function sanitizeOptions(rawOptions) {
    return {
      includeSource: rawOptions.includeSource !== false,
      maxScrollMs: clampNumber(rawOptions.maxScrollMs, 3000, 45000, DEFAULT_OPTIONS.maxScrollMs),
      scrollBeforeCapture: rawOptions.scrollBeforeCapture !== false,
      scrollPauseMs: clampNumber(rawOptions.scrollPauseMs, 150, 2500, DEFAULT_OPTIONS.scrollPauseMs)
    };
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, number));
  }

  async function scrollThroughPage(options) {
    const target = findScrollTarget();
    const start = Date.now();
    let steps = 0;
    let stablePasses = 0;
    let lastHeight = getScrollHeight(target);

    while (Date.now() - start < options.maxScrollMs) {
      scrollToPosition(target, getScrollHeight(target));
      steps += 1;
      await sleep(options.scrollPauseMs);

      const nextHeight = getScrollHeight(target);
      const atBottom = getScrollTop(target) + getViewportHeight(target) >= nextHeight - 8;

      if (Math.abs(nextHeight - lastHeight) < 8 && atBottom) {
        stablePasses += 1;
      } else {
        stablePasses = 0;
      }

      lastHeight = nextHeight;

      if (stablePasses >= 3) {
        break;
      }
    }

    return {
      durationMs: Date.now() - start,
      height: lastHeight,
      steps,
      target: describeElement(target)
    };
  }

  function findScrollTarget() {
    const documentScroller = document.scrollingElement || document.documentElement;
    const candidates = [
      documentScroller,
      ...document.querySelectorAll(
        [
          "[data-automation-id='contentScrollRegion']",
          "[data-automation-id='pageScrollRegion']",
          "[role='main']",
          "main"
        ].join(",")
      )
    ];

    return candidates
      .filter(Boolean)
      .filter((element) => getScrollHeight(element) > getViewportHeight(element) + 150)
      .sort((a, b) => getScrollHeight(b) - getScrollHeight(a))[0] || documentScroller;
  }

  function getCurrentScroll() {
    const target = findScrollTarget();
    return {
      target,
      top: getScrollTop(target),
      windowX: window.scrollX,
      windowY: window.scrollY
    };
  }

  function restoreScroll(position) {
    if (!position) {
      return;
    }

    scrollToPosition(position.target, position.top);
    window.scrollTo(position.windowX, position.windowY);
  }

  function getScrollHeight(target) {
    if (isDocumentScroller(target)) {
      return Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.documentElement ? document.documentElement.scrollHeight : 0,
        target.scrollHeight || 0
      );
    }

    return target.scrollHeight || 0;
  }

  function getViewportHeight(target) {
    return isDocumentScroller(target) ? window.innerHeight : target.clientHeight;
  }

  function getScrollTop(target) {
    return isDocumentScroller(target) ? window.scrollY : target.scrollTop;
  }

  function scrollToPosition(target, top) {
    if (isDocumentScroller(target)) {
      window.scrollTo({ top, left: window.scrollX, behavior: "auto" });
      return;
    }

    target.scrollTo({ top, left: 0, behavior: "auto" });
  }

  function isDocumentScroller(target) {
    return target === document.body ||
      target === document.documentElement ||
      target === document.scrollingElement;
  }

  function findContentRoot() {
    const selectors = [
      "[data-automation-id='Canvas']",
      "[data-sp-feature-tag='PageCanvas']",
      "#spPageCanvasContent",
      ".CanvasComponent",
      "article",
      "main[role='main']",
      "main",
      "[role='main']"
    ];

    const candidates = selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter(isUsableRoot);

    if (candidates.length === 0) {
      return document.body;
    }

    return candidates.sort((a, b) => scoreRoot(b) - scoreRoot(a))[0];
  }

  function isUsableRoot(element) {
    return element && isVisible(element) && getVisibleText(element).length > 80;
  }

  function scoreRoot(element) {
    const textLength = getVisibleText(element).length;
    const linkCount = element.querySelectorAll("a").length;
    const headingCount = element.querySelectorAll("h1,h2,h3,h4,h5,h6").length;
    const navPenalty = element.querySelectorAll("nav,[role='navigation'],header,footer").length * 300;

    return textLength + headingCount * 120 - linkCount * 5 - navPenalty;
  }

  function getPageTitle(root) {
    const selectors = [
      "[data-automation-id='pageTitle']",
      "[data-automation-id='TitleTextId']",
      "h1"
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector) || (root ? root.querySelector(selector) : null);
      const text = element ? cleanText(element.innerText || element.textContent || "") : "";
      if (text) {
        return text;
      }
    }

    const fallback = cleanText(document.title || "SharePoint page");
    return fallback.replace(/\s+-\s+SharePoint\s*$/i, "") || "SharePoint page";
  }

  function buildMarkdown(root, title, metadata, options) {
    const sections = [`# ${escapeHeading(title)}`];

    if (options.includeSource) {
      sections.push(renderMetadata(metadata));
    }

    let body = normalizeMarkdown(renderChildren(root, { depth: 0 })).trim();
    body = removeDuplicateLeadTitle(body, title);

    if (body.length < 80) {
      body = fallbackText(root);
    }

    if (body) {
      sections.push(body);
    }

    return normalizeMarkdown(sections.filter(Boolean).join("\n\n")) + "\n";
  }

  function collectPageMetadata(root) {
    const published = firstValue([
      metaContent("article:published_time"),
      metaContent("og:published_time"),
      metaContent("datePublished"),
      metaContent("publishdate"),
      jsonLdValue(["datePublished", "dateCreated"])
    ]);
    const modified = firstValue([
      metaContent("article:modified_time"),
      metaContent("og:updated_time"),
      metaContent("dateModified"),
      metaContent("last-modified"),
      jsonLdValue(["dateModified"])
    ]);
    const visibleDate = firstValue([
      visibleDateFromSelectors(root),
      metaContent("date"),
      metaContent("DC.date"),
      metaContent("DC.date.issued")
    ]);

    return {
      author: findPageAuthor(root),
      exportedAt: new Date().toLocaleString(),
      modified,
      pageDate: visibleDate,
      published,
      url: location.href
    };
  }

  function renderMetadata(metadata) {
    const lines = [`Page URL: ${metadata.url}`];

    if (metadata.author) {
      lines.push(`Author: ${metadata.author}`);
    }

    if (metadata.published) {
      lines.push(`Published: ${metadata.published}`);
    }

    if (metadata.modified && metadata.modified !== metadata.published) {
      lines.push(`Modified: ${metadata.modified}`);
    }

    if (metadata.pageDate && ![metadata.published, metadata.modified].includes(metadata.pageDate)) {
      lines.push(`Page date: ${metadata.pageDate}`);
    }

    lines.push(`Exported: ${metadata.exportedAt}`);
    return lines.join("\n");
  }

  function findPageAuthor(root) {
    return firstValue([
      metaContent("author"),
      metaContent("article:author"),
      metaContent("parsely-author"),
      metaContent("creator"),
      metaContent("DC.creator"),
      jsonLdAuthor(),
      visibleAuthorFromSelectors(root)
    ]);
  }

  function metaContent(nameOrProperty) {
    const escaped = cssEscape(nameOrProperty);
    const selectors = [
      `meta[name='${escaped}']`,
      `meta[property='${escaped}']`,
      `meta[itemprop='${escaped}']`
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const value = element ? cleanText(element.getAttribute("content") || "") : "";
      if (value) {
        return value;
      }
    }

    return "";
  }

  function visibleAuthorFromSelectors(root) {
    const selectors = [
      "[data-automation-id='pageAuthor']",
      "[data-automation-id='newsAuthor']",
      "[data-automation-id='AuthorByline']",
      "[data-automation-id='authorByline']",
      "[data-automation-id='author']",
      "[itemprop='author']",
      ".author",
      ".byline"
    ];

    return firstVisibleText(selectors, root).replace(/^by\s+/i, "");
  }

  function visibleDateFromSelectors(root) {
    const dateSelectors = [
      "[data-automation-id='pagePublishedDate']",
      "[data-automation-id='pageModifiedDate']",
      "[data-automation-id='newsDate']",
      "[data-automation-id='modifiedDate']",
      "[itemprop='datePublished']",
      "[itemprop='dateModified']",
      "time[datetime]"
    ];

    for (const selector of dateSelectors) {
      const elements = [
        ...document.querySelectorAll(selector),
        ...(root ? Array.from(root.querySelectorAll(selector)) : [])
      ];

      for (const element of elements) {
        if (!isVisible(element)) {
          continue;
        }

        const value = cleanText(element.getAttribute("datetime") || element.getAttribute("content") || element.innerText || element.textContent || "");
        if (looksLikeDate(value)) {
          return value;
        }
      }
    }

    return "";
  }

  function firstVisibleText(selectors, root) {
    for (const selector of selectors) {
      const elements = [
        ...document.querySelectorAll(selector),
        ...(root ? Array.from(root.querySelectorAll(selector)) : [])
      ];

      for (const element of elements) {
        if (!isVisible(element)) {
          continue;
        }

        const value = cleanText(element.innerText || element.textContent || "");
        if (value) {
          return value;
        }
      }
    }

    return "";
  }

  function jsonLdAuthor() {
    const author = jsonLdValue(["author", "creator"]);

    if (Array.isArray(author)) {
      return firstValue(author.map(authorName));
    }

    return authorName(author);
  }

  function authorName(value) {
    if (!value) {
      return "";
    }

    if (typeof value === "string") {
      return cleanText(value);
    }

    if (typeof value === "object") {
      return cleanText(value.name || value.givenName || "");
    }

    return "";
  }

  function jsonLdValue(keys) {
    const scripts = Array.from(document.querySelectorAll("script[type='application/ld+json']"));

    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent || "{}");
        const value = findNestedValue(parsed, keys);
        if (value) {
          return value;
        }
      } catch (_error) {
        // Ignore malformed page-provided JSON-LD.
      }
    }

    return "";
  }

  function findNestedValue(value, keys) {
    if (!value) {
      return "";
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findNestedValue(item, keys);
        if (found) {
          return found;
        }
      }
      return "";
    }

    if (typeof value !== "object") {
      return "";
    }

    for (const key of keys) {
      if (value[key]) {
        return value[key];
      }
    }

    for (const nested of Object.values(value)) {
      const found = findNestedValue(nested, keys);
      if (found) {
        return found;
      }
    }

    return "";
  }

  function firstValue(values) {
    for (const value of values) {
      const normalized = typeof value === "string" ? cleanText(value) : value;
      if (normalized) {
        return normalized;
      }
    }

    return "";
  }

  function looksLikeDate(value) {
    return /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(value);
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }

    return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  function removeDuplicateLeadTitle(markdown, title) {
    const normalizedTitle = cleanText(title).toLowerCase();
    const lines = markdown.split("\n");

    while (lines.length > 0 && !lines[0].trim()) {
      lines.shift();
    }

    if (lines.length === 0) {
      return "";
    }

    const firstHeadingMatch = lines[0].match(/^#{1,6}\s+(.+)$/);
    if (firstHeadingMatch && cleanText(firstHeadingMatch[1]).toLowerCase() === normalizedTitle) {
      lines.shift();
      while (lines.length > 0 && !lines[0].trim()) {
        lines.shift();
      }
      return lines.join("\n");
    }

    return markdown;
  }

  function renderChildren(parent, context) {
    return Array.from(parent.childNodes)
      .map((node) => renderNode(node, context))
      .filter(Boolean)
      .join("");
  }

  function renderNode(node, context) {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeInline(normalizeTextNode(node.textContent || ""));
    }

    if (node.nodeType !== Node.ELEMENT_NODE || shouldSkipElement(node)) {
      return "";
    }

    const tag = node.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      const text = inlineContent(node);
      return text ? `\n\n${"#".repeat(level)} ${escapeHeading(text)}\n\n` : "";
    }

    if (tag === "p") {
      const text = inlineContent(node);
      return text ? `\n\n${text}\n\n` : "";
    }

    if (tag === "br") {
      return "\n";
    }

    if (tag === "ul" || tag === "ol") {
      return renderList(node, context, tag === "ol");
    }

    if (tag === "table") {
      return renderTable(node);
    }

    if (tag === "pre") {
      const text = trimBlankLines(node.innerText || node.textContent || "");
      return text ? `\n\n\`\`\`\n${text}\n\`\`\`\n\n` : "";
    }

    if (tag === "blockquote") {
      const text = normalizeMarkdown(renderChildren(node, context)).trim();
      return text ? `\n\n${text.split("\n").map((line) => `> ${line}`).join("\n")}\n\n` : "";
    }

    if (tag === "img") {
      const image = imageMarkdown(node);
      return image ? `\n\n${image}\n\n` : "";
    }

    if (tag === "a") {
      const link = linkMarkdown(node);
      return link ? ` ${link} ` : "";
    }

    if (isBlockElement(tag)) {
      const text = renderChildren(node, context);
      return text ? `\n${text}\n` : "";
    }

    return renderChildren(node, context);
  }

  function inlineContent(parent) {
    const text = Array.from(parent.childNodes)
      .map((node) => renderInlineNode(node))
      .filter(Boolean)
      .join("");

    return cleanInlineMarkdown(text);
  }

  function renderInlineNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeInline(normalizeTextNode(node.textContent || ""));
    }

    if (node.nodeType !== Node.ELEMENT_NODE || shouldSkipElement(node)) {
      return "";
    }

    const tag = node.tagName.toLowerCase();

    if (tag === "br") {
      return "\n";
    }

    if (tag === "a") {
      return linkMarkdown(node);
    }

    if (tag === "strong" || tag === "b") {
      const text = inlineContent(node);
      return text ? `**${text}**` : "";
    }

    if (tag === "em" || tag === "i") {
      const text = inlineContent(node);
      return text ? `*${text}*` : "";
    }

    if (tag === "code") {
      const text = cleanText(node.innerText || node.textContent || "");
      return text ? `\`${text.replace(/`/g, "\\`")}\`` : "";
    }

    if (tag === "img") {
      return imageMarkdown(node);
    }

    if (tag === "ul" || tag === "ol" || tag === "table") {
      return "";
    }

    return Array.from(node.childNodes)
      .map((child) => renderInlineNode(child))
      .filter(Boolean)
      .join("");
  }

  function renderList(list, context, ordered) {
    const depth = context.depth || 0;
    const items = Array.from(list.children).filter((child) => child.tagName.toLowerCase() === "li");

    if (items.length === 0) {
      return "";
    }

    const lines = items.map((item, index) => {
      const nestedLists = [];
      const pieces = [];

      for (const child of item.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE && ["ul", "ol"].includes(child.tagName.toLowerCase())) {
          nestedLists.push(renderList(child, { depth: depth + 1 }, child.tagName.toLowerCase() === "ol"));
        } else {
          pieces.push(renderNode(child, { depth }));
        }
      }

      const marker = ordered ? `${index + 1}. ` : "- ";
      const itemText = cleanInlineMarkdown(normalizeMarkdown(pieces.join(" ")).replace(/\n+/g, " "));
      const baseLine = `${"  ".repeat(depth)}${marker}${itemText || " "}`;
      const nested = nestedLists.filter(Boolean).join("");

      return nested ? `${baseLine}\n${nested.trimEnd()}` : baseLine;
    });

    return `\n\n${lines.join("\n")}\n\n`;
  }

  function renderTable(table) {
    const rows = Array.from(table.querySelectorAll("tr"))
      .filter(isVisible)
      .map((row) => {
        return Array.from(row.querySelectorAll("th,td"))
          .filter(isVisible)
          .map((cell) => cleanInlineMarkdown(inlineContent(cell)).replace(/\|/g, "\\|"));
      })
      .filter((row) => row.length > 0);

    if (rows.length === 0) {
      return "";
    }

    const width = Math.max(...rows.map((row) => row.length));
    const hasHeader = Boolean(table.querySelector("th"));
    const header = hasHeader ? rows[0] : Array.from({ length: width }, (_value, index) => `Column ${index + 1}`);
    const bodyRows = hasHeader ? rows.slice(1) : rows;
    const normalizedHeader = padRow(header, width);
    const separator = normalizedHeader.map(() => "---");
    const markdownRows = [normalizedHeader, separator, ...bodyRows.map((row) => padRow(row, width))]
      .map((row) => `| ${row.join(" | ")} |`)
      .join("\n");

    return `\n\n${markdownRows}\n\n`;
  }

  function padRow(row, width) {
    return Array.from({ length: width }, (_value, index) => row[index] || "");
  }

  function shouldSkipElement(element) {
    if (!element || !isVisible(element)) {
      return true;
    }

    const tag = element.tagName.toLowerCase();
    if (["script", "style", "noscript", "template", "svg", "canvas", "iframe"].includes(tag)) {
      return true;
    }

    return Boolean(element.closest([
      "[aria-hidden='true']",
      "[data-automation-id='pageCommandBar']",
      "[data-automation-id='SiteHeader']",
      "[data-automation-id='SuiteNavWrapper']",
      "[role='banner']",
      "[role='navigation']",
      ".ms-CommandBar",
      "footer",
      "header",
      "nav"
    ].join(",")));
  }

  function isVisible(element) {
    if (!(element instanceof Element)) {
      return true;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0 || getVisibleText(element).length > 0;
  }

  function isBlockElement(tag) {
    return [
      "address",
      "article",
      "aside",
      "div",
      "dl",
      "fieldset",
      "figure",
      "figcaption",
      "form",
      "hr",
      "main",
      "section"
    ].includes(tag);
  }

  function linkMarkdown(anchor) {
    const text = inlineContentWithoutLink(anchor) || cleanText(anchor.href || "");
    const href = anchor.href || anchor.getAttribute("href") || "";

    if (!text) {
      return "";
    }

    if (!href || href.startsWith("javascript:")) {
      return escapeInline(text);
    }

    return `[${escapeLinkText(text)}](${escapeUrl(href)})`;
  }

  function inlineContentWithoutLink(anchor) {
    return cleanInlineMarkdown(Array.from(anchor.childNodes)
      .map((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return escapeInline(normalizeTextNode(node.textContent || ""));
        }

        if (node.nodeType !== Node.ELEMENT_NODE || shouldSkipElement(node)) {
          return "";
        }

        if (node.tagName.toLowerCase() === "a") {
          return inlineContentWithoutLink(node);
        }

        return renderInlineNode(node);
      })
      .join(""));
  }

  function imageMarkdown(image) {
    const src = image.currentSrc || image.src || image.getAttribute("src") || "";
    const alt = cleanText(image.alt || image.getAttribute("aria-label") || "Image");

    if (!src) {
      return "";
    }

    return `![${escapeLinkText(alt)}](${escapeUrl(src)})`;
  }

  function fallbackText(root) {
    const text = getVisibleText(root)
      .split("\n")
      .map((line) => cleanText(line))
      .filter(Boolean)
      .filter((line, index, lines) => index === 0 || line !== lines[index - 1])
      .join("\n\n");

    return text ? escapeInline(text) : "";
  }

  function getVisibleText(element) {
    return element ? (element.innerText || element.textContent || "") : "";
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeTextNode(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  }

  function cleanInlineMarkdown(value) {
    return String(value || "")
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\s+([\])])/g, "$1")
      .replace(/([\[(])\s+/g, "$1")
      .trim();
  }

  function normalizeMarkdown(value) {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function trimBlankLines(value) {
    return String(value || "").replace(/^\s+|\s+$/g, "");
  }

  function escapeInline(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\*/g, "\\*")
      .replace(/_/g, "\\_")
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]");
  }

  function escapeHeading(value) {
    return String(value || "").replace(/^#+\s*/, "").trim();
  }

  function escapeLinkText(value) {
    return String(value || "").replace(/\]/g, "\\]");
  }

  function escapeUrl(value) {
    return String(value || "").replace(/\)/g, "%29").replace(/\s/g, "%20");
  }

  function describeElement(element) {
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

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
