// Pure helper for the toolbar-icon behavior toggle. The mechanism: setting
// chrome.action's popup to "" makes chrome.action.onClicked fire on a click;
// setting it to the popup page path makes the icon open that page directly
// and onClicked never fires. One setting (defaultAction) therefore drives
// both halves of the toggle from a single source of truth.
const POPUP_PATH = "src/popup/index.html";

// An unknown/undefined value falls back to the popup path (not "") so a
// corrupted or future-incompatible stored value can never leave the icon
// silently doing nothing -- it stays on the safest, best-understood surface.
export function popupPathForAction(defaultAction) {
  if (defaultAction === "sidepanel" || defaultAction === "inpage") {
    return "";
  }
  return POPUP_PATH;
}
