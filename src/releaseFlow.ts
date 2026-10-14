import { useCallback, useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import type { PullRequestSummary } from './pullRequests/usePullRequests';
import { classifyPr } from './useReleaseRecords';

// Release Record R2: the next release's saved draft, the app's release mode, and the sign-off on a
// release PR. The backend (backstage releaseFlow.ts) owns the rules; these are its shapes and the
// fetch hooks. Same conventions as useReleaseRecordPersistence.ts: fetch once, refresh by nonce, a
// write returns what it did (a commit or a PR) and nothing polls for its merge.

export type ReleaseMode = 'hand-flown' | 'assisted' | 'autoland';
export const RELEASE_MODES: ReleaseMode[] = ['hand-flown', 'assisted', 'autoland'];

export const RELEASE_MODE_LABEL: Record<ReleaseMode, string> = {
  'hand-flown': 'Hand-flown',
  assisted: 'Assisted',
  autoland: 'Autoland',
};

export const RELEASE_MODE_HELP: Record<ReleaseMode, string> = {
  'hand-flown': 'A production release needs an approving review from someone other than the person who merges it.',
  assisted: 'A person merges each Flight release PR. Tower records who merged and who reviewed; no sign-off is required.',
  autoland:
    'Releases land in production with no human, once a candidate passes every gate and soaks without SLO burn. Not available yet: it needs real test results and canary metrics.',
};

export interface ReleaseModeInfo {
  mode: ReleaseMode;
  source: 'app' | 'default' | 'built-in';
  file: { owner: string; repo: string; path: string };
  signoffEnv?: string;
  settable: ReleaseMode[];
  canSetMode: boolean;
  canEditDraft: boolean;
  /** R4: where Jira keys in PRs link; absent turns Jira links off. */
  jiraBaseUrl?: string;
}

export const NOTE_CATEGORIES = ['added', 'changed', 'fixed', 'security', 'deprecated', 'removed'] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];
export const NOTE_LABEL: Record<NoteCategory, string> = {
  added: 'Added',
  changed: 'Changed',
  fixed: 'Fixed',
  security: 'Security',
  deprecated: 'Deprecated',
  removed: 'Removed',
};

export interface ReleaseDraft {
  owner?: string;
  /** One paragraph, in plain words: what this release does. (It was the human context's "developer summary".) */
  summary?: string;
  notes?: Partial<Record<NoteCategory, string[]>>;
  knownIssues?: string[];
  risk?: { level?: 'low' | 'medium' | 'high'; notes?: string; rollback?: string };
  /** R4: the date the team is aiming for (YYYY-MM-DD), and the GitHub milestone holding the planned scope. */
  targetDate?: string;
  milestone?: string;
  /** R3: publish a GitHub Release (tag v<version>) once this release is healthy in production. */
  publishGithubRelease?: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export type SignoffStatus = 'awaiting' | 'approved' | 'signed' | 'self-approved' | 'shipped-without';

export interface SignoffEvaluation {
  env: string;
  prNumber: number;
  prUrl: string;
  state: 'open' | 'merged';
  author?: string;
  mergedBy?: string;
  mergedAt?: string;
  approvals: Array<{
    by: string;
    at: string;
    beforeMerge: boolean;
    counts: boolean;
    /** Not in the app's owning team, and not an admin: only they may sign off (backend releaseApprovers.ts). */
    notApprover?: boolean;
    /** Who may sign off couldn't be read, so the approval doesn't count. */
    approverUnknown?: boolean;
  }>;
  status: SignoffStatus;
}

export const SIGNOFF_LABEL: Record<SignoffStatus, string> = {
  awaiting: 'awaiting sign-off',
  approved: 'signed off',
  signed: 'signed off',
  'self-approved': 'self-approved',
  'shipped-without': 'shipped without sign-off',
};

/** Sign-offs that count: before the merge, from someone other than whoever merged or opened the PR. */
export function countedSignoffs(signoff: SignoffEvaluation | undefined): number {
  return signoff?.approvals.filter(a => a.counts).length ?? 0;
}

/** Notes pre-filled from the scope PRs' titles, sorted the way the record's change chips are. */
export function suggestNotes(scope: PullRequestSummary[]): Partial<Record<NoteCategory, string[]>> {
  const notes: Partial<Record<NoteCategory, string[]>> = {};
  const add = (c: NoteCategory, line: string) => {
    notes[c] = [...(notes[c] ?? []), line];
  };
  scope.forEach(pr => {
    // Drop a Conventional Commits prefix: "feat(api): x" -> "x".
    const title = pr.title.replace(/^\w+(?:\([^)]*\))?!?:\s*/, '');
    const line = `${title.charAt(0).toUpperCase()}${title.slice(1)} (#${pr.number})`;
    const bucket = classifyPr(pr);
    if (bucket === 'features') add('added', line);
    else if (bucket === 'fixes') add('fixed', line);
    else add('changed', line);
  });
  return notes;
}

type Target = { owner: string; appName: string } | undefined;

function useGet<T>(path: string, params: Record<string, string> | undefined, refreshNonce: number) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: T; notFound?: boolean }>({
    loading: Boolean(params),
  });
  const key = params ? JSON.stringify(params) : '';
  useEffect(() => {
    if (!params) {
      setState({ loading: false });
      return undefined;
    }
    let cancelled = false;
    setState(prev => ({ ...prev, loading: true }));
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('glidepath');
        const res = await fetchApi.fetch(`${baseUrl}${path}?${new URLSearchParams(params).toString()}`);
        if (res.status === 404) {
          if (!cancelled) setState({ loading: false, notFound: true });
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => undefined);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = (await res.json()) as T;
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, path, discoveryApi, fetchApi, refreshNonce]);
  return state;
}

function usePost<Req, Res>(path: string) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; result?: Res }>({ loading: false });
  const submit = useCallback(
    async (body: Req) => {
      setState({ loading: true });
      try {
        const baseUrl = await discoveryApi.getBaseUrl('glidepath');
        const res = await fetchApi.fetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => undefined);
        if (!res.ok) throw new Error(data?.error ?? `request failed with ${res.status}`);
        setState({ loading: false, result: data as Res });
        return data as Res;
      } catch (e) {
        setState({ loading: false, error: String(e) });
        return undefined;
      }
    },
    [discoveryApi, fetchApi, path],
  );
  const reset = useCallback(() => setState({ loading: false }), []);
  return { ...state, submit, reset };
}

export function useReleaseMode(target: Target, refreshNonce = 0) {
  return useGet<ReleaseModeInfo>('/release-mode', target, refreshNonce);
}

export function useSubmitReleaseMode() {
  return usePost<{ owner: string; appName: string; mode: ReleaseMode }, { prUrl: string; alreadyOpen: boolean }>(
    '/release-mode',
  );
}

export function useReleaseDraft(target: Target, refreshNonce = 0) {
  return useGet<ReleaseDraft>('/release-draft', target, refreshNonce);
}

export function useSaveReleaseDraft() {
  return usePost<{ owner: string; appName: string; draft: ReleaseDraft }, { commitUrl: string; draft: ReleaseDraft }>(
    '/release-draft',
  );
}

export function useReleaseSignoff(target: { owner: string; appName: string; imageTag: string } | undefined) {
  return useGet<SignoffEvaluation>('/release-signoff', target, 0);
}

// --- R3: outcomes -------------------------------------------------------------------------

export type OutcomeResult = 'clean' | 'rolled-back' | 'replaced-before-healthy' | 'stopped-before-production';

/** What happened after a release shipped (backstage releaseOutcome.ts), written back into its record once final. */
export interface RecordOutcome {
  result?: OutcomeResult;
  state: string;
  env?: string;
  healthyAt?: string;
  closedAt?: string;
  closedBy?: 'superseded' | 'rolled-back' | 'bake-complete' | 'moved-on';
  supersededBy?: string;
  rolledBackBy?: string;
  rollbackReason?: string;
  bakeDays: number;
  sloMeasured: false;
}

export const OUTCOME_LABEL: Record<OutcomeResult, string> = {
  clean: 'clean',
  'rolled-back': 'rolled back',
  'replaced-before-healthy': 'replaced before healthy',
  'stopped-before-production': 'stopped before production',
};

// --- R4: planned scope and the fleet calendar ----------------------------------------------

export interface PlannedIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  url: string;
  assignee?: string;
}

export interface PlannedScope {
  milestone?: { number: number; title: string; url: string; dueOn?: string };
  issues: PlannedIssue[];
}

export function useReleasePlanned(target: Target, refreshNonce = 0) {
  return useGet<PlannedScope>('/release-planned', target, refreshNonce);
}

export interface CalendarEntry {
  appName: string;
  owner: string;
  mode: ReleaseMode;
  signoffEnv?: string;
  next: { name: string; targetDate?: string; releaseOwner?: string; milestone?: string; noteCount: number };
  inFlight: Array<{ env: string; imageTag: string; prUrl: string }>;
  last?: { name: string; imageTag: string; at: string; outcome?: OutcomeResult };
  error?: string;
}

/** The fleet's releases (Ops Wall). Refetched every five minutes, the backend's own cache window. */
export function useReleaseCalendar() {
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNonce(n => n + 1), 5 * 60_000);
    return () => clearInterval(id);
  }, []);
  return useGet<CalendarEntry[]>('/release-calendar', EMPTY_PARAMS, nonce);
}
const EMPTY_PARAMS: Record<string, string> = {};
