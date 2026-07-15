// Mounts (or removes) the in-page overlay clipper panel: a shadow-DOM host
// appended to the page holding an <iframe> whose src is the extension's own
// popup page (?context=iframe). The iframe therefore runs at the extension
// origin with full extension privileges (chrome.downloads, chrome.storage,
// chrome.scripting) exactly like the popup or side panel — no message bridge
// is needed. This module is dynamically imported from the popup via
// chrome.scripting.executeScript, the same pattern capture.js uses for
// collect.js.

const HOST_ID = "mwc-panel-host";
const STORAGE_KEY = "mwcPanelGeometry";
const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 780;
const DEFAULT_HEIGHT_VIEWPORT_RATIO = 0.85;
const DEFAULT_HEIGHT_MAX = 780;
const MIN_WIDTH = 300;
const MIN_HEIGHT = 220;
const MARGIN = 12;

// Toggle entry point. Returns { mounted } so the caller (popup.js, via the
// injected executeScript wrapper) can tell what happened, though the popup
// currently just closes itself either way.
export async function togglePanel(tabId) {
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    existing.remove();
    return { mounted: false };
  }
  await mount(tabId);
  return { mounted: true };
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
    console.error("Markdown Clipper panel: could not save geometry:", error);
  }
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

  const container = shadow.getElementById("container");
  const dragHandle = shadow.getElementById("drag-handle");
  const resizeHandle = shadow.getElementById("resize-handle");
  const closeButton = shadow.getElementById("close-button");
  const frame = shadow.getElementById("frame");

  const geometry = clampGeometry(await loadGeometry(), viewportSize());
  applyGeometry(container, geometry);

  frame.src = chrome.runtime.getURL(
    `src/popup/index.html?context=iframe&tabId=${encodeURIComponent(tabId)}`
  );

  closeButton.addEventListener("click", () => host.remove());
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

// The resize handle sits in the bottom-left corner (the panel defaults to the
// top-right), so dragging it moves the left edge and grows/shrinks height
// from the bottom, keeping the top-right corner anchored.
function wireResize(container, handle) {
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
      const width = start.width - dx;
      const geometry = clampGeometry(
        {
          left: start.left + dx,
          top: start.top,
          width,
          height: start.height + dy
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
        border: 1px solid light-dark(#cdd5de, #3a4150);
        border-radius: 10px;
        box-shadow: 0 8px 28px light-dark(rgba(16, 32, 40, 0.25), rgba(0, 0, 0, 0.6));
        overflow: hidden;
        font: 12px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #drag-handle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex: 0 0 auto;
        padding: 6px 6px 6px 10px;
        background: light-dark(#dde3ea, #2a2f38);
        border-bottom: 1px solid light-dark(#cdd5de, #3a4150);
        cursor: move;
        touch-action: none;
        user-select: none;
      }
      #drag-title {
        font-weight: 600;
        letter-spacing: 0.01em;
        color: light-dark(#5f6d79, #a3a9b3);
      }
      #close-button {
        display: inline-grid;
        place-items: center;
        width: 22px;
        height: 22px;
        padding: 0;
        border: 0;
        border-radius: 6px;
        color: light-dark(#5f6d79, #a3a9b3);
        background: transparent;
        cursor: pointer;
      }
      #close-button:hover {
        background: light-dark(#cdd5de, #3a4150);
        color: light-dark(#162028, #e8eaed);
      }
      #close-button svg {
        width: 14px;
        height: 14px;
        fill: none;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-width: 2;
      }
      #frame-wrap {
        position: relative;
        flex: 1 1 auto;
        min-height: 0;
      }
      #frame {
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
      }
      #resize-handle {
        position: absolute;
        left: 0;
        bottom: 0;
        width: 20px;
        height: 20px;
        cursor: nesw-resize;
        touch-action: none;
        display: grid;
        place-items: end start;
        padding: 3px;
      }
      #resize-handle svg {
        width: 14px;
        height: 14px;
        fill: none;
        stroke: light-dark(#8b96a3, #5a6270);
        stroke-width: 2;
        stroke-linecap: round;
        pointer-events: none;
      }
      #resize-handle:hover svg {
        stroke: light-dark(#5f6d79, #a3a9b3);
      }
    </style>
    <div id="container">
      <div id="drag-handle">
        <span id="drag-title">Markdown Clipper</span>
        <button id="close-button" type="button" title="Close" aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 5l14 14M19 5L5 19"></path>
          </svg>
        </button>
      </div>
      <div id="frame-wrap">
        <iframe id="frame"></iframe>
        <div id="resize-handle" title="Drag to resize">
          <svg viewBox="0 0 14 14" aria-hidden="true">
            <path d="M2 12L12 2"></path>
            <path d="M6 12L12 6"></path>
            <path d="M10 12L12 10"></path>
          </svg>
        </div>
      </div>
    </div>
  `;
}
