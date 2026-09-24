// Structural equality, not an imperative "has this been touched" flag -
// extracted from ConfigTab.tsx (2026-09-13 bug: "if you enable [a switch]
// and then disable it, the changes panel still thinks there's an edit" -
// toggling back to the original value must read as clean again, which a
// touched-once flag can never do). Shared by any Tower tab that tracks
// dirty state against a load-time snapshot (Config, Glidepath).
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    if (ak.length !== bk.length) return false;
    return ak.every(k => bk.includes(k) && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}
