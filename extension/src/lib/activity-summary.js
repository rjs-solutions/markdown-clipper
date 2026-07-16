function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function summarizeActivity(clips = [], collections = []) {
  const records = Array.isArray(clips) ? clips : [];
  const savedCollections = Array.isArray(collections) ? collections : [];
  const sourceSites = new Set(records.map((clip) => hostOf(clip.url)).filter(Boolean));
  const lastClipped = records.reduce((latest, clip) => {
    const timestamp = new Date(clip.clipped || "").getTime();
    return Number.isFinite(timestamp) && timestamp > latest ? timestamp : latest;
  }, 0);
  return {
    clips: records.length,
    sourceSites: sourceSites.size,
    collections: savedCollections.length,
    lastClipped: lastClipped ? new Date(lastClipped).toISOString() : ""
  };
}
