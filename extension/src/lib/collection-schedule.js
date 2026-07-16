const SETTINGS_KEY = "collectionSyncSchedule";
const STATE_KEY = "collectionSyncState";
const PERIODS = { weekly: 7 * 24 * 60 * 60 * 1000, monthly: 30 * 24 * 60 * 60 * 1000 };

export function isCollectionSyncDue(frequency, lastCompletedAt, now = Date.now()) {
  if (!PERIODS[frequency]) return false;
  const completed = Number(lastCompletedAt) || 0;
  return completed === 0 || now - completed >= PERIODS[frequency];
}

export async function loadCollectionSchedule() {
  const [settings, state] = await Promise.all([
    chrome.storage.sync.get({ [SETTINGS_KEY]: { frequency: "off" } }),
    chrome.storage.local.get({ [STATE_KEY]: { lastCompletedAt: null } })
  ]);
  return { frequency: settings[SETTINGS_KEY]?.frequency || "off", lastCompletedAt: state[STATE_KEY]?.lastCompletedAt || null };
}

export async function saveCollectionSchedule(frequency) {
  const value = PERIODS[frequency] ? frequency : "off";
  await chrome.storage.sync.set({ [SETTINGS_KEY]: { frequency: value } });
  return value;
}

export async function markCollectionSyncCompleted(completedAt = Date.now()) {
  await chrome.storage.local.set({ [STATE_KEY]: { lastCompletedAt: completedAt } });
}
