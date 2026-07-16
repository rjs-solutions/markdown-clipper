import { slugify, sanitizeFilename } from "../lib/slug.js";
import { loadSettings } from "../lib/settings.js";
import { applyTemplate, extractSelectorRefs } from "../lib/template.js";
import { assembleOutput, parseTags } from "../lib/assemble.js";
import { capturePage } from "../lib/capture.js";
import { isTweetUrl, fetchTweet, fetchTweetThread, buildTweetMarkdown } from "../lib/tweet.js";
import { writeArtifact } from "../lib/vault.js";
import { appendClip, updateClip, findClipByUrl, listClips } from "../lib/clip-log.js";
import { buildWikiIndexMarkdown } from "../lib/wiki-index.js";
import { applyTheme } from "../lib/theme.js";
import { applyTagRules, loadRules } from "../lib/tag-rules.js";
import { openCollectionWindow } from "../lib/window-placement.js";
import { compareMarkdownFingerprint, fingerprintMarkdown } from "../lib/content-fingerprint.js";
import { loadCollections } from "../lib/collections.js";
import { matchSavedCollection } from "../lib/collection-export.js";

const el = {
  optionsButton: document.getElementById("open-options"),
  collectionsButton: document.getElementById("open-collections"),
  clipStateWrap: document.getElementById("clip-state-wrap"),
  clipState: document.getElementById("clip-state"),
  clipStatePopover: document.getElementById("clip-state-popover"),
  clipStateTitle: document.getElementById("clip-state-title"),
  clipStateDetail: document.getElementById("clip-state-detail"),
  clipStatePath: document.getElementById("clip-state-path"),
  clipStateCollection: document.getElementById("clip-state-collection"),
  expand: document.getElementById("do-expand"),
  sidepanel: document.getElementById("do-sidepanel"),
  panel: document.getElementById("do-panel"),
  closePanel: document.getElementById("do-close-panel"),
  closeDivider: document.getElementById("close-divider"),
  loading: document.getElementById("loading"),
  empty: document.getElementById("empty"),
  emptyMessage: document.getElementById("empty-message"),
  card: document.getElementById("card"),
  title: document.getElementById("f-title"),
  props: document.getElementById("props"),
  filename: document.getElementById("f-filename"),
  tags: document.getElementById("f-tags"),
  description: document.getElementById("f-description"),
  charCount: document.getElementById("char-count"),
  contentType: document.getElementById("content-type"),
  previewBody: document.getElementById("preview-body"),
  actions: document.getElementById("actions"),
  download: document.getElementById("do-download"),
  downloadLocation: document.getElementById("do-download-location"),
  copy: document.getElementById("do-copy"),
  copyFull: document.getElementById("do-copy-full"),
  export: document.getElementById("do-export"),
  status: document.getElementById("status")
};

let settings = null;
let tagRules = [];
let tab = null;
let inPanel = false; // shown in the native side panel (manifest ?panel=1)
let inIframe = false; // shown in the in-page overlay panel (?context=iframe)
let preview = null; // fast (no-scroll) capture used to populate the card
let fullResult = null; // cached full-settings capture, once produced
let fullResultPromise = null; // in-flight full capture (deduped / pre-warmed)
let busy = false;
let clipStateCollectionId = "";

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  wireEvents();
  const params = new URLSearchParams(location.search);
  inPanel = params.get("panel") === "1";
  inIframe = params.get("context") === "iframe";
  if (inPanel) {
    document.body.classList.add("in-panel");
    el.closePanel.hidden = false;
    el.closeDivider.hidden = false;
    el.closePanel.addEventListener("click", () => window.close());
  }
  if (inIframe) {
    document.body.classList.add("in-iframe");
    el.closePanel.hidden = false;
    el.closeDivider.hidden = false;
    // The in-page overlay is a same-origin iframe hosted by panel-host.js,
    // which removes itself on this message. There is no direct handle to the
    // host element from inside the iframe, so postMessage is the bridge.
    el.closePanel.addEventListener("click", () => {
      window.parent.postMessage({ type: "mc-panel-close" }, "*");
    });
    wireHeaderDrag();
  }
  try {
    settings = await loadSettings();
    applyTheme(settings.theme);
    if (inIframe) {
      // Report the concrete resolved scheme (not just the setting) so
      // panel-host.js can match the shadow host's chrome exactly, even when
      // the setting is "system".
      const resolvedScheme =
        settings.theme === "dark" || settings.theme === "light"
          ? settings.theme
          : window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
      window.parent.postMessage({ type: "mc-panel-color-scheme", scheme: resolvedScheme }, "*");
    }
    try {
      tagRules = await loadRules();
    } catch (error) {
      // Tag rules are a convenience layer; a storage read failure should
      // never take down the clipper.
      console.error("Markdown Clipper tag rules failed to load:", error);
      tagRules = [];
    }
    await loadPreview();
    // The native side panel and the in-page overlay are mutually exclusive
    // surfaces from the plain popup, but each still offers a one-way switch
    // to the other: the overlay can hand off to the side panel, and the side
    // panel can hand off back to the overlay. The plain popup offers both.
    //
    // Neither surface offers a switch back to the plain popup. Chrome only
    // opens an extension's action popup from a real toolbar-icon gesture
    // when defaultAction is "popup"; chrome.action.openPopup is unreliable
    // and gated, so there is no dependable API to reopen it from here.
    if (!inPanel) {
      try {
        await setupSidePanel();
      } catch (error) {
        // Side-panel setup is optional; never take down the main clipper UI.
        console.error("Markdown Clipper side-panel setup failed:", error);
      }
    }
    if (!inIframe) {
      el.panel.hidden = false;
      el.panel.addEventListener("click", openInPagePanel);
    }
  } catch (error) {
    console.error("Markdown Clipper popup failed to initialize:", error);
    showEmpty(messageFrom(error) || "Something went wrong opening the clipper.");
  }
}

function wireEvents() {
  el.optionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
  el.collectionsButton.addEventListener("click", openCollectionsSettings);
  el.expand.addEventListener("click", openEditor);
  el.download.addEventListener("click", () => run("download"));
  el.downloadLocation.addEventListener("click", () => run("save-as"));
  el.copy.addEventListener("click", () => run("copy"));
  el.copyFull.addEventListener("click", () => run("copy-full"));
  el.export.addEventListener("click", exportWholeSite);
  el.clipState.addEventListener("click", () => {
    const open = el.clipStatePopover.hidden;
    el.clipStatePopover.hidden = !open;
    el.clipState.setAttribute("aria-expanded", String(open));
  });
  el.clipStateCollection.addEventListener("click", () => openCollectionsSettings(clipStateCollectionId));
  document.addEventListener("click", (event) => {
    if (!el.clipStateWrap.contains(event.target)) closeClipStatePopover();
  });

  // Keep the filename in sync with the title until the user edits it directly.
  el.title.addEventListener("input", () => {
    if (!el.filename.dataset.edited) {
      el.filename.value = slugify(el.title.value, { fallback: "page" });
    }
  });
  el.filename.addEventListener("input", () => {
    el.filename.dataset.edited = "1";
  });
  // Mark the body as user-edited so background/full captures stop overwriting it.
  el.previewBody.addEventListener("input", () => {
    el.previewBody.dataset.edited = "1";
    el.charCount.textContent = `Body · ${el.previewBody.value.length.toLocaleString()} chars`;
  });
  // Mirror the same guard for tags: once the user edits the pre-filled tags,
  // a later full-capture refresh must not clobber their edit.
  el.tags.addEventListener("input", () => {
    el.tags.dataset.edited = "1";
  });
}

// The in-page overlay's own header carries no drag handle of its own -- the
// thin strip lives on panel-host.js's shadow host, above the iframe. Letting
// the user grab the header bar here forwards the drag as a postMessage
// bridge (movementX/Y deltas), since this iframe has no direct handle to the
// host element that actually owns the panel's position. Icon buttons inside
// the header stay clickable: a pointerdown on a button is left alone so the
// button's own click still fires.
function wireHeaderDrag() {
  const header = document.querySelector(".header");
  if (!header) {
    return;
  }
  let dragging = false;
  header.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) {
      return;
    }
    event.preventDefault();
    dragging = true;
    header.setPointerCapture(event.pointerId);
    window.parent.postMessage({ type: "mc-panel-drag-start" }, "*");
  });
  header.addEventListener("pointermove", (event) => {
    if (!dragging) {
      return;
    }
    window.parent.postMessage(
      { type: "mc-panel-drag", dx: event.movementX, dy: event.movementY },
      "*"
    );
  });
  const endDrag = (event) => {
    if (!dragging) {
      return;
    }
    dragging = false;
    try {
      header.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released (e.g. lost focus); harmless.
    }
    window.parent.postMessage({ type: "mc-panel-drag-end" }, "*");
  };
  header.addEventListener("pointerup", endDrag);
  header.addEventListener("pointercancel", endDrag);
}

// Union any number of tag arrays, deduped, first-seen order preserved.
function unionTags(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const raw of list || []) {
      const tag = String(raw || "").trim();
      if (!tag || seen.has(tag)) {
        continue;
      }
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

// Best-effort domain from the capture result's url (falls back to the tab's
// url on the very first, pre-metadata pass).
function tagContext(result) {
  const url = (result && result.url) || (tab && tab.url) || "";
  let domain = "";
  try {
    domain = url ? new URL(url).hostname : "";
  } catch {
    domain = "";
  }
  return {
    url,
    domain,
    title: (result && result.title) || "",
    text: (result && result.markdown) || ""
  };
}

// suggestedTags = union(existing metadata tags, deterministic rule matches).
// Rules only ever ADD tags -- see docs/llm-vault-design.md ("Clip routing").
function computeSuggestedTags(result) {
  const existing = Array.isArray(result.metadata && result.metadata.tags) ? result.metadata.tags : [];
  const ruleTags = applyTagRules(tagRules, tagContext(result));
  return unionTags(existing, ruleTags);
}

// Once a later capture (full SharePoint scroll, or just the preview itself)
// lands, refresh the tags field -- unless the user has already started
// editing it. Mirrors syncBodyFromFull.
function syncTagsFromResult(result) {
  if (!el.tags.dataset.edited) {
    el.tags.value = computeSuggestedTags(result).join(", ");
  }
}

async function loadPreview() {
  // In the in-page overlay, the tab we must capture is the host page the
  // panel was opened on, not whatever tab happens to be focused (the iframe
  // itself has no "active tab" of its own). The id travels in via the query
  // string, set by panel-host.js from the tabId the popup passed at inject
  // time — see openInPagePanel().
  tab = inIframe ? await hostTab() : await activeTab();
  if (!tab || !tab.id || !/^https?:\/\//i.test(tab.url || "")) {
    showEmpty("This page can’t be captured. Open a normal web page and try again.");
    return;
  }
  // One-shot handoff from the "Clip selection with Markdown Clipper" context
  // menu (service-worker.js's handleSelectionClip): the selection HTML was
  // already grabbed and converted at click time, since the browser's live
  // selection is gone by the time the panel opens. Consuming it here (and
  // removing the key immediately) means a later, unrelated open of the panel
  // never replays a stale selection as a normal page capture.
  const selectionKey = `selection:${tab.id}`;
  const stashed = await chrome.storage.session.get(selectionKey);
  const selection = stashed[selectionKey];
  if (selection) {
    await chrome.storage.session.remove(selectionKey);
    preview = selectionCaptureResult(selection);
    populateCard(preview);
    return;
  }
  // Tweet fast path: a single X/Twitter status URL is served far cleaner by
  // the syndication JSON endpoint than by scraping the live DOM. The host
  // permission for cdn.syndication.twimg.com is now static (manifest.json),
  // so this always runs with no opt-in step. On a protected/unavailable
  // tweet, fall back to the normal capture below (the tweet's own page is
  // still clippable via DOM scraping).
  // Carries a status message through the normal-capture fallback below,
  // since populateCard() always clears the status line once it runs.
  let fallbackNote = null;
  const tweetMatch = isTweetUrl(tab.url);
  if (tweetMatch) {
    try {
      const tweet = await fetchTweetForTab(tweetMatch.id, tab);
      preview = tweetCaptureResult(tweet);
      populateCard(preview);
      return;
    } catch (error) {
      console.error("Markdown Clipper tweet capture failed, falling back to page capture:", error);
      fallbackNote = { message: messageFrom(error), isError: true };
    }
  }
  try {
    // Fast preview: skip scrolling so the card appears immediately.
    preview = await withTimeout(
      capturePage(tab.id, { ...captureOptions(), scrollBeforeCapture: false }),
      12000,
      "Timed out reading this page. It may block extension scripts (CSP)."
    );
    populateCard(preview);
    if (fallbackNote) {
      setStatus(fallbackNote.message, fallbackNote.isError);
    }
  } catch (error) {
    console.error("Markdown Clipper preview capture failed:", error);
    showEmpty(messageFrom(error) || "This page could not be captured.");
  }
}

// Runs in the host page (isolated world) to find the focal author's
// follow-up reply ids in the live, rendered DOM -- syndication JSON can't
// see replies, only the page itself can. extractAuthorReplyIds is pure and
// jsdom-tested on its own; this wrapper is just how it reaches a real page,
// mirroring injectedGrabSelection's dynamic-import-in-page pattern.
async function injectedExtractReplyIds(moduleUrl, focalId, focalHandle) {
  const mod = await import(moduleUrl);
  return mod.extractAuthorReplyIds(document, focalId, focalHandle);
}

// Best-effort handle out of a tweet's own URL (isTweetUrl only returns the
// status id, since the handle isn't needed to fetch the focal tweet itself).
function tweetHandleFromUrl(url) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean)[0] || null;
  } catch {
    return null;
  }
}

// The thread is strictly additive: any failure here (setting off, DOM shape
// changed, executeScript blocked by the page's CSP) just yields no reply
// ids, and the caller falls back to the plain focal tweet.
async function findAuthorReplyIds(focalId, tab) {
  if (!settings.includeTweetThread) {
    return [];
  }
  try {
    const focalHandle = tweetHandleFromUrl(tab.url);
    if (!focalHandle) {
      return [];
    }
    const injections = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectedExtractReplyIds,
      args: [chrome.runtime.getURL("src/lib/tweet.js"), focalId, focalHandle],
      world: "ISOLATED"
    });
    const result = injections && injections[0] && injections[0].result;
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error("Markdown Clipper thread reply extraction failed, clipping the tweet alone:", error);
    return [];
  }
}

// Fetch the focal tweet, plus its author's follow-up replies as a thread
// when the setting is on and the page's DOM yields any reply ids.
async function fetchTweetForTab(focalId, tab) {
  const replyIds = await findAuthorReplyIds(focalId, tab);
  if (replyIds.length) {
    return fetchTweetThread(focalId, replyIds);
  }
  return fetchTweet(focalId);
}

// Shape a normalized tweet (extension/src/lib/tweet.js) into the same
// capture-result contract capturePage() returns, so the rest of the popup
// (card, tags, save, clip-log, assemble) needs no tweet-specific handling.
function tweetCaptureResult(tweet) {
  const markdown = buildTweetMarkdown(tweet);
  const firstLine = String(tweet.text || "").split("\n")[0].trim();
  return {
    ok: true,
    url: tweet.permalink,
    mode: "tweet",
    title: `${tweet.author} on X`,
    markdown,
    metadata: {
      author: tweet.author,
      handle: tweet.handle,
      site: "X",
      published: tweet.createdAt,
      description: firstLine
    },
    stats: { chars: markdown.length }
  };
}

// Shape a stashed selection clip (from the "Clip selection" context menu)
// into the same capture-result contract capturePage() returns, so the rest
// of the popup (card, tags, save, clip-log, assemble) needs no
// selection-specific handling. contentTypeFromMode (assemble.js) treats any
// non-sharepoint/confluence/tweet mode as "article".
function selectionCaptureResult(selection) {
  const markdown = selection.markdown || "";
  const firstLine = markdown.split("\n").find((line) => line.trim()) || "";
  const title = selection.title || firstLine.slice(0, 60).trim() || "Clipped selection";
  return {
    ok: true,
    url: selection.url,
    mode: "selection",
    title,
    markdown,
    metadata: { url: selection.url, description: firstLine.trim() },
    stats: { chars: markdown.length }
  };
}

// Friendly label for the content-type indicator above the preview body.
// Mirrors contentTypeFromMode (compose.js) but with the reader-facing names
// this popup wants, plus the "full" (whole-page) and default cases that
// compose.js's frontmatter mapping doesn't need to distinguish.
const CONTENT_TYPE_LABELS = {
  article: "Article",
  sharepoint: "SharePoint",
  confluence: "Confluence",
  tweet: "Tweet",
  full: "Page"
};

function contentTypeLabel(mode) {
  return CONTENT_TYPE_LABELS[mode] || "Article";
}

function populateCard(result) {
  el.loading.hidden = true;
  el.empty.hidden = true;
  el.card.hidden = false;
  el.actions.hidden = false;

  el.title.value = result.title || "";
  el.tags.value = computeSuggestedTags(result).join(", ");
  el.description.value = result.metadata.description || "";
  el.filename.value = deriveFilename(result);
  el.previewBody.value = result.markdown || "";
  delete el.filename.dataset.edited;
  delete el.previewBody.dataset.edited;
  delete el.tags.dataset.edited;

  el.contentType.textContent = contentTypeLabel(result.mode);
  updateCharCount();
  setStatus("");
  refreshClipState(result).catch((error) => {
    console.error("Markdown Clipper clipped-state lookup failed:", error);
  });
}

function closeClipStatePopover() {
  el.clipStatePopover.hidden = true;
  el.clipState.setAttribute("aria-expanded", "false");
}

function formatClippedDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "an earlier date" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

async function refreshClipState(result) {
  const existing = await findClipByUrl(result && result.url);
  if (!existing) {
    el.clipStateWrap.hidden = true;
    closeClipStatePopover();
    return;
  }

  const storedFingerprint = existing.previewFingerprint
    || (result.mode === "sharepoint" ? "" : existing.contentFingerprint);
  const state = existing.type === "selection" ? "known" : compareMarkdownFingerprint(storedFingerprint, result.markdown);
  const title = state === "current" ? "Appears current" : state === "changed" ? "Page changed" : "Previously clipped";
  const detail = state === "current"
    ? `Matches the visible page content. Clipped ${formatClippedDate(existing.updatedAt || existing.clipped)}.`
    : state === "changed"
      ? `Visible page content differs from the clip saved ${formatClippedDate(existing.updatedAt || existing.clipped)}.`
      : `Clipped ${formatClippedDate(existing.updatedAt || existing.clipped)}. Freshness will be available after the next save.`;

  el.clipState.classList.toggle("is-current", state === "current");
  el.clipState.classList.toggle("is-changed", state === "changed");
  el.clipState.title = `${title}. Click for details.`;
  el.clipState.setAttribute("aria-label", `${title}. Click for details.`);
  el.clipStateTitle.textContent = title;
  el.clipStateDetail.textContent = detail;
  el.clipStatePath.textContent = existing.path ? `Saved as ${existing.path}` : "";
  el.clipStatePath.hidden = !existing.path;

  let collection = null;
  try {
    collection = matchSavedCollection(await loadCollections(), result.url);
  } catch (error) {
    console.error("Markdown Clipper collection match failed:", error);
  }
  clipStateCollectionId = collection && collection.id || "";
  el.clipStateCollection.hidden = !clipStateCollectionId;
  if (collection) el.clipStateCollection.textContent = `View ${collection.name}`;
  el.clipStateWrap.hidden = false;
}

function updateCharCount() {
  const length = el.previewBody.value.length;
  el.charCount.textContent = `Body · ${length.toLocaleString()} chars`;
}

// Scrolling to load lazy content only helps virtualized SharePoint pages; for
// everything else the DOM is already complete and the preview is the result.
function needsFullCapture(result) {
  return settings.scrollBeforeCapture && !!result && result.mode === "sharepoint";
}

// Once the full SharePoint capture lands, refresh the body — unless the user has
// already started editing it.
function syncBodyFromFull(result) {
  if (!el.previewBody.dataset.edited) {
    el.previewBody.value = result.markdown || "";
    updateCharCount();
  }
}

// Derive the default filename base (without .md).
function deriveFilename(result) {
  if (settings.useTemplate && settings.filenameTemplate) {
    const values = { ...result.variables, content: result.markdown };
    const rawName = applyTemplate(settings.filenameTemplate, values).trim();
    const base = sanitizeFilename(rawName, { fallback: "" }).replace(/\.md$/i, "");
    if (base) {
      return base;
    }
  }
  return slugify(result.title, { fallback: "page" });
}

// Fields currently entered in the card.
function currentFields() {
  return {
    title: el.title.value,
    body: el.previewBody.value,
    tags: el.tags.value,
    description: el.description.value,
    filenameBase: el.filename.value
  };
}

function buildPayload(result) {
  return assembleOutput({ result, fields: currentFields(), settings });
}

async function run(action) {
  if (busy) {
    return;
  }
  busy = true;
  setBusy(true);
  try {
    const result = await ensureFullResult();
    if (!el.previewBody.dataset.edited) {
      syncBodyFromFull(result);
    }
    syncTagsFromResult(result);

    // Dedup / update-on-re-clip (vault only, gated by settings.dedupeOnReclip):
    // look up any existing clip for this URL BEFORE composing, so a match can
    // seed the composed frontmatter with its original `clipped` date plus a
    // fresh `updated` date. result.metadata flows straight into compose.js's
    // metadata (assembleOutput spreads it), so mutating it here is enough --
    // no changes needed in assemble.js/compose.js's call sites.
    let existingClip = null;
    if (action === "download" && settings.vaultEnabled && settings.dedupeOnReclip) {
      existingClip = await findClipByUrl(result.url);
      if (existingClip) {
        result.metadata = {
          ...result.metadata,
          clippedAt: existingClip.clipped,
          updated: new Date().toISOString()
        };
      }
    }

    const payload = buildPayload(result);

    if (action === "copy" || action === "copy-full") {
      const copyText = action === "copy" ? currentFields().body : payload.markdown;
      await navigator.clipboard.writeText(copyText);
      setStatus("");
      showActionSuccess(action === "copy" ? el.copy : el.copyFull);
    } else {
      // Reuse the existing record's path on a matched re-clip so the write
      // overwrites the same file instead of creating a new one; otherwise
      // fall back to today's freshly derived filename.
      const relativePath = existingClip ? existingClip.path : payload.filename;
      const chooseLocation = action === "save-as";
      const written = await writeArtifact({
        relativePath,
        content: payload.markdown,
        saveAs: chooseLocation,
        useVault: chooseLocation ? false : settings.vaultEnabled
      });
      if (!written.ok) {
        throw new Error(written.error || "Could not save the file.");
      }
      const fields = currentFields();
      if (existingClip) {
        await updateClip(existingClip.id, {
          title: payload.title,
          tags: parseTags(fields.tags),
          description: fields.description || "",
          byteLength: new TextEncoder().encode(payload.markdown).length,
          contentFingerprint: fingerprintMarkdown(result.markdown),
          previewFingerprint: fingerprintMarkdown(preview && preview.markdown),
          updatedAt: new Date().toISOString(),
          path: existingClip.path
        });
      } else {
        await appendClip({
          url: payload.url,
          title: payload.title,
          path: written.path,
          clipped: new Date().toISOString(),
          type: payload.mode,
          tags: parseTags(fields.tags),
          description: fields.description || "",
          byteLength: new TextEncoder().encode(payload.markdown).length,
          contentFingerprint: fingerprintMarkdown(result.markdown),
          previewFingerprint: fingerprintMarkdown(preview && preview.markdown)
        });
      }
      if (written.backend === "vault" && settings.knowledgeBasePreset) {
        await regenerateVaultIndex();
      }
      setStatus(
        existingClip
          ? `Updated existing clip: ${written.path}`
          : written.backend === "vault"
            ? `Saved to vault: ${written.path}`
            : chooseLocation
              ? `Downloaded ${payload.filename} to the selected location`
              : `Downloaded ${payload.filename}`
      );
      await refreshClipState(preview || result);
    }
  } catch (error) {
    console.error("Markdown Clipper action failed:", error);
    setStatus(messageFrom(error), true);
  } finally {
    busy = false;
    setBusy(false);
  }
}

// Rebuild index.md from the full clip log and write it back into the vault.
// Best-effort: an index write failure should never surface as a clip failure.
async function regenerateVaultIndex() {
  try {
    const records = await listClips();
    const content = buildWikiIndexMarkdown(records);
    const written = await writeArtifact({ relativePath: "index.md", content, useVault: true });
    if (!written.ok) {
      console.error("Markdown Clipper index.md write failed:", written.error);
    }
  } catch (error) {
    console.error("Markdown Clipper index.md regeneration failed:", error);
  }
}

// Open the full-screen editor in a tab, seeded with the current capture + edits.
async function openEditor() {
  if (busy) {
    return;
  }
  busy = true;
  setBusy(true);
  setStatus("Opening editor…");
  try {
    const result = await ensureFullResult();
    if (!el.previewBody.dataset.edited) {
      syncBodyFromFull(result);
    }
    syncTagsFromResult(result);
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await chrome.storage.session.set({
      [`edit:${id}`]: { result, fields: currentFields(), settings }
    });
    await chrome.tabs.create({
      url: chrome.runtime.getURL(`src/editor/index.html?id=${encodeURIComponent(id)}`)
    });
    // The overlay panel stays open after handing off to the editor tab; the
    // plain popup and native side panel close as before.
    if (!inIframe) {
      window.close();
    }
  } catch (error) {
    console.error("Markdown Clipper open-editor failed:", error);
    setStatus(messageFrom(error), true);
  } finally {
    busy = false;
    setBusy(false);
  }
}

function startFullCapture() {
  if (!fullResultPromise) {
    fullResultPromise = withTimeout(
      capturePage(tab.id, captureOptions()),
      settings.maxScrollMs + 15000,
      "Timed out capturing the full page."
    )
      .then((result) => {
        fullResult = result;
        return result;
      })
      .catch((error) => {
        fullResultPromise = null;
        throw error;
      });
  }
  return fullResultPromise;
}

async function ensureFullResult() {
  if (!needsFullCapture(preview)) {
    return preview;
  }
  if (fullResult) {
    return fullResult;
  }
  setStatus("Loading complete SharePoint page…");
  const result = await startFullCapture();
  if (el.status.textContent === "Loading complete SharePoint page…") {
    setStatus("");
  }
  return result;
}

function captureOptions() {
  const selectors = settings.useTemplate
    ? extractSelectorRefs(settings.template, settings.filenameTemplate)
    : [];
  return {
    mode: settings.mode,
    scrollBeforeCapture: settings.scrollBeforeCapture,
    maxScrollMs: settings.maxScrollMs,
    scrollPauseMs: settings.scrollPauseMs,
    dropHidden: settings.dropHidden,
    selectors
  };
}

// The same popup card is reused as the side panel (manifest side_panel path).
// When shown there we tag the body so CSS can go full-width; the "open in side
// panel" button is only offered from the popup, on browsers that support it.
async function setupSidePanel() {
  if (!chrome.sidePanel || !chrome.sidePanel.open || !tab || tab.id == null) {
    return;
  }
  // Configure the tab-specific path before exposing the button. The click
  // handler can then call open() immediately while its user gesture is active.
  // Disable the manifest's global fallback first: otherwise Chrome keeps a
  // second, contextless panel open when the user switches to another tab.
  if (chrome.sidePanel.setOptions) {
    await chrome.sidePanel.setOptions({ enabled: false });
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: "src/popup/index.html?panel=1",
      enabled: true
    });
  }
  el.sidepanel.hidden = false;
  el.sidepanel.addEventListener("click", openSidePanel);
}

function openSidePanel() {
  if (!tab || tab.id == null) {
    return;
  }
  // sidePanel.open() must be invoked directly from the click gesture.
  chrome.sidePanel.open({ tabId: tab.id }).then(() => {
    closeSelf();
  }).catch((error) => {
    console.error("Markdown Clipper open-side-panel failed:", error);
    setStatus(messageFrom(error), true);
  });
}

// Closes this surface once it has handed off to another one. The plain popup
// and the native side panel are real windows, so window.close() works; the
// in-page overlay is an iframe with no window of its own to close, so it has
// to ask panel-host.js to remove the host element instead, same bridge
// do-close-panel uses.
function closeSelf() {
  if (inIframe) {
    window.parent.postMessage({ type: "mc-panel-close" }, "*");
  } else {
    window.close();
  }
}

async function openCollectionsSettings(collectionId = "") {
  const collectionQuery = collectionId ? `&collection=${encodeURIComponent(collectionId)}` : "";
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`src/options/index.html?section=collections${collectionQuery}`)
  });
  if (!inIframe) {
    window.close();
  }
}

async function exportWholeSite() {
  const seedUrl = tab && /^https?:\/\//i.test(tab.url || "") ? tab.url : "";
  const query = seedUrl ? `seed=${encodeURIComponent(seedUrl)}` : "";
  await openCollectionWindow(query);
  if (!inIframe) {
    window.close();
  }
}

// Injects the overlay-panel mounter into the active tab. Mirrors capturePage
// (capture.js): a tiny serializable function dynamically imports the
// web-accessible module in the page's isolated world, since executeScript
// can't otherwise tell panel-host.js which tab it was launched from.
async function injectedTogglePanel(moduleUrl, tabId) {
  const mod = await import(moduleUrl);
  return mod.togglePanel(tabId);
}

async function openInPagePanel() {
  if (!tab || tab.id == null) {
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectedTogglePanel,
      args: [chrome.runtime.getURL("src/content/panel-host.js"), tab.id]
    });
    window.close();
  } catch (error) {
    console.error("Markdown Clipper open-in-page failed:", error);
    setStatus(messageFrom(error), true);
  }
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function activeTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  return active;
}

async function hostTab() {
  const tabId = Number(new URLSearchParams(location.search).get("tabId"));
  if (!Number.isFinite(tabId)) {
    return null;
  }
  try {
    return await chrome.tabs.get(tabId);
  } catch (error) {
    console.error("Markdown Clipper could not resolve the host tab:", error);
    return null;
  }
}

function showEmpty(message) {
  el.clipStateWrap.hidden = true;
  closeClipStatePopover();
  el.loading.hidden = true;
  el.card.hidden = true;
  el.actions.hidden = true;
  el.empty.hidden = false;
  el.emptyMessage.textContent = message;
}

function setBusy(isBusy) {
  for (const button of [el.download, el.downloadLocation, el.copy, el.copyFull, el.expand]) {
    button.disabled = isBusy;
  }
}

function showActionSuccess(button) {
  const label = button.querySelector(".btn-label");
  const originalLabel = label && label.textContent;
  button.classList.add("is-success");
  button.setAttribute("aria-label", "Copied");
  if (label) label.textContent = "Copied";
  setTimeout(() => {
    button.classList.remove("is-success");
    button.setAttribute("aria-label", button === el.copy ? "Copy page Markdown" : "Copy complete Markdown with title and metadata");
    if (label) label.textContent = originalLabel;
  }, 1200);
}

function setStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.classList.toggle("is-error", isError);
}

function messageFrom(error) {
  return error && error.message ? error.message : String(error);
}
