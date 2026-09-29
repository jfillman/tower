// Shared, pure formatting helpers used across Glidepath and its sibling
// plugins (pullRequests, ...) - extracted out of GlidepathPage.tsx
// specifically so a shared "3 days is stale" convention and shared
// relative/absolute time formatting stay in exactly one place rather than
// drifting into near-identical copies. Anything with UI dependencies
// (styles, React components) stays local to each module instead - a
// consistent *look* is worth more shared code than these three are, but
// pulling a whole styling system into a "shared" grab-bag tends to make it
// a dumping ground instead.

export const STALE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

export function relativeTime(when?: string | Date): string {
  if (!when) return '—';
  const ms = Date.now() - new Date(when).getTime();
  if (Number.isNaN(ms)) return '—';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}
