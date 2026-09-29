const STALE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1e3;
function relativeTime(when) {
  if (!when) return "\u2014";
  const ms = Date.now() - new Date(when).getTime();
  if (Number.isNaN(ms)) return "\u2014";
  const mins = Math.floor(ms / 6e4);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
function formatDateTime(iso) {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "\u2014" : d.toLocaleString();
}

export { STALE_THRESHOLD_MS, formatDateTime, relativeTime };
//# sourceMappingURL=format.esm.js.map
