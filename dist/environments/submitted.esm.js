const SUBMITTED_MAX_AGE_MS = 14 * 24 * 3600 * 1e3;
const key = (owner, appName) => `tower:environments:submitted:${owner}/${appName}`;
function loadSubmitted(owner, appName, now = Date.now()) {
  try {
    const raw = window.localStorage.getItem(key(owner, appName));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((r) => r && typeof r.at === "number" && now - r.at < SUBMITTED_MAX_AGE_MS) : [];
  } catch {
    return [];
  }
}
function saveSubmitted(owner, appName, list) {
  try {
    if (list.length === 0) window.localStorage.removeItem(key(owner, appName));
    else window.localStorage.setItem(key(owner, appName), JSON.stringify(list));
  } catch {
  }
}
function pendingFrom(records, declared) {
  const names = new Set(declared.map((e) => e.name));
  const open = [];
  const adds = [];
  const removals = [];
  for (const record of records) {
    const stillAdded = record.added.filter((e) => !names.has(e.name));
    const stillRemoved = record.removed.filter((n) => names.has(n));
    if (stillAdded.length === 0 && stillRemoved.length === 0) continue;
    open.push(record);
    for (const env of stillAdded) if (!adds.some((a) => a.env.name === env.name)) adds.push({ env, record });
    for (const n of stillRemoved) if (!removals.includes(n)) removals.push(n);
  }
  return { records: open, adds, removals };
}

export { SUBMITTED_MAX_AGE_MS, loadSubmitted, pendingFrom, saveSubmitted };
//# sourceMappingURL=submitted.esm.js.map
