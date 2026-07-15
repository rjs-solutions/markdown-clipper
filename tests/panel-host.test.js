// Unit tests for the in-page overlay panel mounter (extension/src/content/panel-host.js).
// Verifies the shadow-DOM host lifecycle (mount/toggle/close) and the geometry
// clamp that keeps a restored panel reachable on-screen.

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://example.com/page"
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  Object.defineProperty(dom.window, "innerWidth", { value: 1200, configurable: true });
  Object.defineProperty(dom.window, "innerHeight", { value: 800, configurable: true });
  return dom;
}

function installFakeChrome(initialGeometry) {
  const store = { mwcPanelGeometry: initialGeometry };
  globalThis.chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`
    },
    storage: {
      local: {
        async get(key) {
          return key in store ? { [key]: store[key] } : {};
        },
        async set(values) {
          Object.assign(store, values);
        }
      }
    }
  };
  return store;
}

test("togglePanel mounts exactly one shadow host", async () => {
  installDom();
  installFakeChrome(undefined);
  const { togglePanel } = await import(
    `../extension/src/content/panel-host.js?case=mount-once`
  );

  const result = await togglePanel(42);
  assert.equal(result.mounted, true);

  const hosts = document.querySelectorAll("#mwc-panel-host");
  assert.equal(hosts.length, 1);
  assert.ok(hosts[0].shadowRoot, "host should carry an open shadow root");

  const iframe = hosts[0].shadowRoot.getElementById("frame");
  assert.match(iframe.src, /context=iframe&tabId=42/);
});

test("togglePanel mounting twice toggles it off instead of stacking", async () => {
  installDom();
  installFakeChrome(undefined);
  const { togglePanel } = await import(
    `../extension/src/content/panel-host.js?case=toggle-off`
  );

  await togglePanel(7);
  assert.equal(document.querySelectorAll("#mwc-panel-host").length, 1);

  const second = await togglePanel(7);
  assert.equal(second.mounted, false);
  assert.equal(document.querySelectorAll("#mwc-panel-host").length, 0);
});

test("an mc-panel-close message removes the host entirely, leaving no residue", async () => {
  installDom();
  installFakeChrome(undefined);
  const { togglePanel } = await import(
    `../extension/src/content/panel-host.js?case=close-message`
  );

  await togglePanel(1);
  assert.ok(document.getElementById("mwc-panel-host"), "host should be mounted before closing");

  window.dispatchEvent(
    new window.MessageEvent("message", { data: { type: "mc-panel-close" } })
  );

  assert.equal(document.getElementById("mwc-panel-host"), null);
  assert.equal(document.documentElement.querySelector("#mwc-panel-host"), null);
});

test("an unrelated message is ignored and leaves the panel mounted", async () => {
  installDom();
  installFakeChrome(undefined);
  const { togglePanel } = await import(
    `../extension/src/content/panel-host.js?case=ignore-message`
  );

  await togglePanel(1);
  window.dispatchEvent(
    new window.MessageEvent("message", { data: { type: "something-else" } })
  );

  assert.ok(document.getElementById("mwc-panel-host"), "unrelated messages must not close the panel");
});

test("clampGeometry pulls an off-screen-restored panel back into the viewport", async () => {
  installDom();
  installFakeChrome(undefined);
  const { clampGeometry } = await import(
    `../extension/src/content/panel-host.js?case=clamp`
  );

  const viewport = { width: 1200, height: 800 };

  const offRight = clampGeometry({ left: 5000, top: 100, width: 420, height: 600 }, viewport);
  assert.ok(offRight.left + offRight.width <= viewport.width);
  assert.ok(offRight.left >= 0);

  const offBottom = clampGeometry({ left: 100, top: 5000, width: 420, height: 600 }, viewport);
  assert.ok(offBottom.top + offBottom.height <= viewport.height);
  assert.ok(offBottom.top >= 0);

  const negative = clampGeometry({ left: -400, top: -300, width: 420, height: 600 }, viewport);
  assert.equal(negative.left, 0);
  assert.equal(negative.top, 0);

  const oversized = clampGeometry(
    { left: 0, top: 0, width: 5000, height: 5000 },
    viewport
  );
  assert.ok(oversized.width <= viewport.width);
  assert.ok(oversized.height <= viewport.height);
});

test("a saved geometry is restored (clamped) rather than replaced by the default", async () => {
  installDom();
  installFakeChrome({ left: 6000, top: 100, width: 420, height: 600 });
  const { togglePanel } = await import(
    `../extension/src/content/panel-host.js?case=restore`
  );

  await togglePanel(3);
  const host = document.getElementById("mwc-panel-host");
  const container = host.shadowRoot.getElementById("container");
  const left = parseFloat(container.style.left);
  const width = parseFloat(container.style.width);
  assert.ok(left + width <= 1200, "restored geometry must be clamped onto the viewport");
});
