// Blob-based downloads from an extension page. Blob URLs avoid the length
// limits of data: URLs and handle large captures and ZIP archives. The object
// URL is revoked after a delay so the download has time to start.

export async function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({ url, filename, saveAs: false });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export function downloadText(text, filename, { type = "text/markdown;charset=utf-8" } = {}) {
  return downloadBlob(new Blob([text], { type }), filename);
}
