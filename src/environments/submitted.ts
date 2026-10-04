import type { EnvDef } from './stagedChanges';

// Changes the user has submitted from the Environments tab whose pull request is not merged yet. Without a record
// the tab forgot them the moment the pull request opened: the new environment vanished from the table and the
// panel emptied, and a person had to leave the tab and come back after the merge to see anything (2026-10-04).
// The record is kept in the browser (localStorage, keyed by service), pure helpers decide what is still pending.

export interface SubmittedChange {
  id: string;
  at: number;
  /** The cicd.yaml pull request. */
  prUrl: string;
  /** Environment name to its ApplicationEnvironment request pull request (Flight environments only). */
  requests: Record<string, string>;
  added: EnvDef[];
  removed: string[];
  summary: string[];
}

/** A record older than this is dropped even if it never completed (closed unmerged, abandoned). */
export const SUBMITTED_MAX_AGE_MS = 14 * 24 * 3600 * 1000;

const key = (owner: string, appName: string) => `tower:environments:submitted:${owner}/${appName}`;

export function loadSubmitted(owner: string, appName: string, now = Date.now()): SubmittedChange[] {
  try {
    const raw = window.localStorage.getItem(key(owner, appName));
    const list = raw ? (JSON.parse(raw) as SubmittedChange[]) : [];
    return Array.isArray(list) ? list.filter(r => r && typeof r.at === 'number' && now - r.at < SUBMITTED_MAX_AGE_MS) : [];
  } catch {
    return [];
  }
}

export function saveSubmitted(owner: string, appName: string, list: SubmittedChange[]): void {
  try {
    if (list.length === 0) window.localStorage.removeItem(key(owner, appName));
    else window.localStorage.setItem(key(owner, appName), JSON.stringify(list));
  } catch {
    // Private window or blocked storage: the tab still works, it just forgets after a reload.
  }
}

/**
 * What of the submitted changes the live cicd.yaml does not show yet. A record is finished once every environment it
 * added is declared and every one it removed is gone, so a merge makes it disappear on the next read.
 */
export function pendingFrom(
  records: SubmittedChange[],
  declared: EnvDef[],
): { records: SubmittedChange[]; adds: Array<{ env: EnvDef; record: SubmittedChange }>; removals: string[] } {
  const names = new Set(declared.map(e => e.name));
  const open: SubmittedChange[] = [];
  const adds: Array<{ env: EnvDef; record: SubmittedChange }> = [];
  const removals: string[] = [];
  for (const record of records) {
    const stillAdded = record.added.filter(e => !names.has(e.name));
    const stillRemoved = record.removed.filter(n => names.has(n));
    // A change with nothing to wait for (a reorder, a field edit) cannot be told apart from "merged", so it is kept
    // only until the next read; the open-pull-request list covers it while it is fresh.
    if (stillAdded.length === 0 && stillRemoved.length === 0) continue;
    open.push(record);
    for (const env of stillAdded) if (!adds.some(a => a.env.name === env.name)) adds.push({ env, record });
    for (const n of stillRemoved) if (!removals.includes(n)) removals.push(n);
  }
  return { records: open, adds, removals };
}
