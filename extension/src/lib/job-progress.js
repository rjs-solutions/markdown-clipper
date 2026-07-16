export function getJobProgress(job, now = Date.now()) {
  const captured = Array.isArray(job?.results) ? job.results.length : 0;
  const failed = Array.isArray(job?.errors) ? job.errors.length : 0;
  const queued = Array.isArray(job?.queue) ? job.queue.length : 0;
  const completed = captured + failed;
  const available = completed + queued;
  const configuredMax = Number(job?.options?.maxPages);
  const cappedTotal = Number.isFinite(configuredMax) && configuredMax > 0
    ? Math.min(available, configuredMax + failed)
    : available;
  const total = job?.status === "done"
    ? completed
    : Math.max(completed, cappedTotal);
  const elapsedMs = Math.max(0, Number(now) - Number(job?.startedAt ?? now));
  const remaining = Math.max(0, total - completed);
  const etaMs = completed > 0 && remaining > 0
    ? Math.round((elapsedMs / completed) * remaining)
    : null;
  const percent = total > 0
    ? Math.max(0, Math.min(100, Math.round((completed / total) * 100)))
    : 0;

  return { captured, failed, completed, total, percent, elapsedMs, etaMs };
}

export function formatClock(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(Number(milliseconds) / 1000) || 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}
