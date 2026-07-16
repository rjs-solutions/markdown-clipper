// Mounts (or removes) the in-page overlay clipper panel: a shadow-DOM host
// appended to the page holding an <iframe> whose src is the extension's own
// popup page (?context=iframe). The iframe therefore runs at the extension
// origin with full extension privileges (chrome.downloads, chrome.storage,
// chrome.scripting) exactly like the popup or side panel. The only bridge
// back to this host is a postMessage close signal, since the iframe's own
// header carries the close control (see popup.js's #do-close-panel). This
// module is dynamically imported from the popup via chrome.scripting.executeScript,
// the same pattern capture.js uses for collect.js.

const HOST_ID = "mwc-panel-host";
const STORAGE_KEY = "mwcPanelGeometry";
const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 900;
const DEFAULT_HEIGHT_VIEWPORT_RATIO = 0.9;
const DEFAULT_HEIGHT_MAX = 900;
const MIN_WIDTH = 300;
const MIN_HEIGHT = 220;
const MARGIN = 12;

// Toggle entry point. Returns { mounted } so the caller (popup.js, via the
// injected executeScript wrapper) can tell what happened, though the popup
// currently just closes itself either way.
export async function togglePanel(tabId) {
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    removeHost(existing);
    return { mounted: false };
  }
  await mount(tabId);
  return { mounted: true };
}

// Single teardown path for the host: also drops the window message listener
// mount() installs, so toggling the panel on and off repeatedly on the same
// page never accumulates listeners.
function removeHost(host) {
  if (host.mcMessageHandler) {
    window.removeEventListener("message", host.mcMessageHandler);
  }
  host.remove();
}

// Clamps a stored/default geometry into the current viewport so a panel
// dragged (or restored from a since-resized window) is never unreachable.
export function clampGeometry(geometry, viewport) {
  const width = clamp(geometry.width, MIN_WIDTH, Math.max(MIN_WIDTH, viewport.width));
  const height = clamp(geometry.height, MIN_HEIGHT, Math.max(MIN_HEIGHT, viewport.height));
  const maxLeft = Math.max(0, viewport.width - width);
  const maxTop = Math.max(0, viewport.height - height);
  const left = clamp(geometry.left, 0, maxLeft);
  const top = clamp(geometry.top, 0, maxTop);
  return { left, top, width, height };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function defaultGeometry() {
  const width = DEFAULT_WIDTH;
  const height = Math.min(window.innerHeight * DEFAULT_HEIGHT_VIEWPORT_RATIO, DEFAULT_HEIGHT_MAX);
  const left = Math.max(MARGIN, window.innerWidth - width - MARGIN);
  const top = MARGIN;
  return { left, top, width, height };
}

async function loadGeometry() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const geometry = stored && stored[STORAGE_KEY];
    if (
      geometry &&
      Number.isFinite(geometry.left) &&
      Number.isFinite(geometry.top) &&
      Number.isFinite(geometry.width) &&
      Number.isFinite(geometry.height)
    ) {
      return geometry;
    }
  } catch (error) {
    console.error("Markdown Clipper panel: could not read saved geometry:", error);
  }
  return defaultGeometry();
}

async function saveGeometry(geometry) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: geometry });
  } catch (error) {
    // Geometry persistence is best-effort; never break the panel over it.
    // A reloaded extension leaves old in-page panels with an invalidated
    // context -- a later drag-release hitting that is expected and harmless,
    // so only log genuinely unexpected failures.
    if (isContextInvalidated(error)) {
      return;
    }
    console.error("Markdown Clipper panel: could not save geometry:", error);
  }
}

function isContextInvalidated(error) {
  if (!chrome.runtime || chrome.runtime.id === undefined) {
    return true;
  }
  const message = error && error.message ? String(error.message).toLowerCase() : "";
  return message.includes("context invalidated");
}

// Resolves the saved theme setting the same way popup.js does (loadSettings,
// then applyTheme's "system" handling), but without touching document.dataset
// -- this host lives in an arbitrary host page, not an extension page, so the
// result is only used to force the shadow host's own color-scheme. Returns
// "light" or "dark" when the user picked one explicitly, or null when they
// chose "system" (or the setting couldn't be read), meaning the host should
// keep following the OS scheme like it already does.
async function resolveColorScheme() {
  try {
    const { loadSettings } = await import(chrome.runtime.getURL("src/lib/settings.js"));
    const settings = await loadSettings();
    if (settings.theme === "light" || settings.theme === "dark") {
      return settings.theme;
    }
  } catch (error) {
    console.error("Markdown Clipper panel: could not read saved theme:", error);
  }
  return null;
}

async function mount(tabId) {
  const host = document.createElement("div");
  host.id = HOST_ID;
  // Reset any inherited host-page styles before the shadow root takes over.
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.zIndex = String(2147483647 - 1);
  host.style.top = "0";
  host.style.left = "0";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = template();

  const colorScheme = await resolveColorScheme();
  if (colorScheme) {
    host.style.colorScheme = colorScheme;
  }

  const container = shadow.getElementById("container");
  const dragHandle = shadow.getElementById("drag-handle");
  const resizeHandle = shadow.getElementById("resize-handle");
  const frame = shadow.getElementById("frame");

  const geometry = clampGeometry(await loadGeometry(), viewportSize());
  applyGeometry(container, geometry);

  frame.src = chrome.runtime.getURL(
    `src/popup/index.html?context=iframe&tabId=${encodeURIComponent(tabId)}`
  );

  // The iframe's own sleek header carries the close control now (see
  // popup.js's #do-close-panel in the in-iframe context); this is the other
  // side of that bridge, since the iframe has no direct handle to this host.
  // The same bridge also carries the header-drag affordance (popup.js's
  // wireHeaderDrag): the iframe has no direct handle to the container it is
  // sitting inside either, so drag start/move/end arrive as postMessage
  // deltas and get applied here with the exact same clamp/apply helpers the
  // #drag-handle strip uses.
  let dragGeometry = null;
  host.mcMessageHandler = (event) => {
    if (event.data && event.data.type === "mc-panel-close") {
      removeHost(host);
    } else if (event.data && event.data.type === "mc-panel-color-scheme") {
      if (event.data.scheme === "light" || event.data.scheme === "dark") {
        host.style.colorScheme = event.data.scheme;
      }
    } else if (event.data && event.data.type === "mc-panel-drag-start") {
      dragGeometry = currentGeometry(container);
    } else if (event.data && event.data.type === "mc-panel-drag") {
      if (!dragGeometry) {
        dragGeometry = currentGeometry(container);
      }
      dragGeometry.left += event.data.dx;
      dragGeometry.top += event.data.dy;
      dragGeometry = clampGeometry(dragGeometry, viewportSize());
      applyGeometry(container, dragGeometry);
    } else if (event.data && event.data.type === "mc-panel-drag-end") {
      saveGeometry(currentGeometry(container));
      dragGeometry = null;
    }
  };
  window.addEventListener("message", host.mcMessageHandler);
  wireDrag(container, dragHandle);
  wireResize(container, resizeHandle);
}

function viewportSize() {
  return { width: window.innerWidth, height: window.innerHeight };
}

function applyGeometry(container, geometry) {
  container.style.left = `${geometry.left}px`;
  container.style.top = `${geometry.top}px`;
  container.style.width = `${geometry.width}px`;
  container.style.height = `${geometry.height}px`;
}

function currentGeometry(container) {
  return {
    left: parseFloat(container.style.left) || 0,
    top: parseFloat(container.style.top) || 0,
    width: parseFloat(container.style.width) || DEFAULT_WIDTH,
    height: parseFloat(container.style.height) || DEFAULT_HEIGHT
  };
}

function wireDrag(container, handle) {
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const start = currentGeometry(container);
    const startX = event.clientX;
    const startY = event.clientY;
    handle.setPointerCapture(event.pointerId);

    function onMove(moveEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const geometry = clampGeometry(
        { ...start, left: start.left + dx, top: start.top + dy },
        viewportSize()
      );
      applyGeometry(container, geometry);
    }

    function onUp() {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      saveGeometry(currentGeometry(container));
    }

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  });
}

// The resize handle sits in the bottom-right corner, so dragging it keeps the
// panel's top-left corner anchored and grows/shrinks width and height from
// the pointer's position relative to that anchored corner.
function wireResize(container, handle) {
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const start = currentGeometry(container);
    handle.setPointerCapture(event.pointerId);

    function onMove(moveEvent) {
      const width = moveEvent.clientX - start.left;
      const height = moveEvent.clientY - start.top;
      const geometry = clampGeometry(
        {
          left: start.left,
          top: start.top,
          width,
          height
        },
        viewportSize()
      );
      applyGeometry(container, geometry);
    }

    function onUp() {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      saveGeometry(currentGeometry(container));
    }

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  });
}

function template() {
  return `
    <style>
      :host {
        all: initial;
        color-scheme: light dark;
      }
      #container {
        position: absolute;
        display: flex;
        flex-direction: column;
        background: light-dark(#ffffff, #1b1e25);
        color: light-dark(#162028, #e8eaed);
        border-radius: 10px;
        box-shadow: 0 2px 10px light-dark(rgba(16, 32, 40, 0.14), rgba(0, 0, 0, 0.5)),
          0 10px 32px light-dark(rgba(16, 32, 40, 0.16), rgba(0, 0, 0, 0.45));
        overflow: hidden;
        font: 12px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #drag-handle {
        flex: 0 0 auto;
        height: 6px;
        background: light-dark(#dde3ea, #2a2f38);
        cursor: move;
        touch-action: none;
        user-select: none;
      }
      #frame-wrap {
        flex: 1 1 auto;
        min-height: 0;
      }
      #frame {
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
      }
      #resize-bar {
        flex: 0 0 auto;
        display: flex;
        justify-content: flex-end;
        align-items: center;
        height: 17px;
        background: light-dark(#ffffff, #1b1e25);
        border-top: 1px solid light-dark(#e4e8ed, #2a2f38);
      }
      #resize-handle {
        display: grid;
        place-items: center;
        width: 20px;
        height: 100%;
        cursor: nwse-resize;
        touch-action: none;
      }
      #resize-handle svg {
        width: 12px;
        height: 12px;
        fill: none;
        stroke: light-dark(#8b96a3, #5a6270);
        stroke-width: 1.5;
        stroke-linecap: round;
        pointer-events: none;
      }
      #resize-handle:hover svg {
        stroke: light-dark(#5f6d79, #a3a9b3);
      }
    </style>
    <div id="container">
      <div id="drag-handle" title="Drag to move"></div>
      <div id="frame-wrap">
        <iframe id="frame"></iframe>
      </div>
      <div id="resize-bar">
        <div id="resize-handle" title="Drag to resize">
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M10 1L1 10"></path>
            <path d="M10 5L5 10"></path>
            <path d="M10 9L9 10"></path>
          </svg>
        </div>
      </div>
    </div>
  `;
}
