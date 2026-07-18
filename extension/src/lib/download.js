// Blob-based downloads from an extension page. Blob URLs avoid the length
// limits of data: URLs and handle large captures and ZIP archives. The object
// URL is revoked as soon as chrome.downloads reports the download reaching a
// terminal state ("complete" or "interrupted"), with a 10-minute fallback
// timer for environments where chrome.downloads.onChanged isn't available
// (tests) or the event is missed.

export async function downloadBlob(blob, filename, { saveAs = false } = {}) {
  const url = URL.createObjectURL(blob);
  let revoked = false;
  const revoke = () => {
    if (revoked) {
      return;
    }
    revoked = true;
    URL.revokeObjectURL(url);
  };
  const fallback = setTimeout(revoke, 10 * 60_000);

  const onChanged = chrome.downloads && chrome.downloads.onChanged;
  if (onChanged && typeof onChanged.addListener === "function") {
    let downloadId;
    const listener = (delta) => {
      if (delta.id !== downloadId) {
        return;
      }
      const state = delta.state && delta.state.current;
      if (state === "complete" || state === "interrupted") {
        onChanged.removeListener(listener);
        clearTimeout(fallback);
        revoke();
      }
    };
    onChanged.addListener(listener);
    try {
      downloadId = await chrome.downloads.download({ url, filename, saveAs });
    } catch (error) {
      onChanged.removeListener(listener);
      clearTimeout(fallback);
      revoke();
      throw error;
    }
    return;
  }

  try {
    await chrome.downloads.download({ url, filename, saveAs });
  } catch (error) {
    clearTimeout(fallback);
    revoke();
    throw error;
  }
}

export function downloadText(text, filename, { type = "text/markdown;charset=utf-8", saveAs = false } = {}) {
  return downloadBlob(new Blob([text], { type }), filename, { saveAs });
}
