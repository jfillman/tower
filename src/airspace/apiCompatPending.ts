import { useCallback, useMemo } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import type { ReleaseRecord } from '../fleet/releaseRecords';
import { usePolled, type Polled } from '../fleet/usePolled';
import type { PullRequestSummary } from '../pullRequests/usePullRequests';
import { apiCompatOf, type ApiCompatReport } from './apiCompat';

// Open release PRs and their api-compat verdicts, fleet-wide: the release records waiting for a merge (state
// "proposed", read from the cluster) name their PR; the PR's checks come from the same backend route the Release Record
// uses, once per app with a waiting release. Feeds the Ops Wall's Needs Attention and the Airspace Drift view.
// GitHub-backed, so it polls slowly and only for apps that have a release waiting.

const POLL_MS = 5 * 60_000;

export interface ApiCompatPending {
  app: string;
  env: string;
  cluster: string;
  prUrl: string;
  prNumber: number;
  /** The api-compat Check Run's conclusion (what GitHub enforces), when it has finished. */
  conclusion?: string;
  report?: ApiCompatReport;
}

interface PrRef {
  owner: string;
  repo: string;
  number: number;
}

/** `https://github.com/<owner>/<repo>/pull/<n>`. */
export function prRefOf(url: string | undefined): PrRef | undefined {
  const m = url ? /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(url) : null;
  return m ? { owner: m[1], repo: m[2], number: Number(m[3]) } : undefined;
}

/** The releases that wait on a PR, one per PR. */
export function waitingReleases(records: ReleaseRecord[]): Array<ReleaseRecord & { pr: PrRef }> {
  const seen = new Set<string>();
  const out: Array<ReleaseRecord & { pr: PrRef }> = [];
  for (const r of records) {
    const pr = r.state === 'proposed' ? prRefOf(r.prUrl) : undefined;
    if (!pr || seen.has(r.prUrl!)) continue;
    seen.add(r.prUrl!);
    out.push({ ...r, pr });
  }
  return out;
}

/** Joins the waiting releases with their app's PR list; a PR with no api-compat check is left out. */
export function pendingApiCompat(
  waiting: Array<ReleaseRecord & { pr: PrRef }>,
  prsByApp: Map<string, PullRequestSummary[]>,
): ApiCompatPending[] {
  const out: ApiCompatPending[] = [];
  for (const r of waiting) {
    const pr = prsByApp.get(r.appName)?.find(p => p.repo === 'gitops' && p.number === r.pr.number && p.state === 'open');
    const state = apiCompatOf(pr?.ci?.checks);
    if (!pr || !state) continue;
    out.push({
      app: r.appName,
      env: r.env,
      cluster: r.cluster,
      prUrl: r.prUrl!,
      prNumber: r.pr.number,
      conclusion: state.check.status === 'completed' ? state.check.conclusion : undefined,
      report: state.report,
    });
  }
  return out;
}

export function useApiCompatPending(records: ReleaseRecord[] | undefined): Polled<ApiCompatPending[]> {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const waiting = useMemo(() => waitingReleases(records ?? []), [records]);
  const key = waiting.map(w => w.prUrl).sort().join('|');
  const fetcher = useCallback(async () => {
    if (waiting.length === 0) return [];
    const baseUrl = await discoveryApi.getBaseUrl('pull-requests');
    const apps = new Map<string, PrRef>();
    for (const w of waiting) apps.set(w.appName, w.pr);
    const prsByApp = new Map<string, PullRequestSummary[]>();
    await Promise.all(
      [...apps].map(async ([appName, pr]) => {
        const params = new URLSearchParams({ owner: pr.owner, appName });
        if (pr.repo.startsWith('gitops-infra-')) params.set('appType', 'infra');
        const res = await fetchApi.fetch(`${baseUrl}/pull-requests?${params.toString()}`);
        if (res.ok) prsByApp.set(appName, (await res.json()) as PullRequestSummary[]);
      }),
    );
    return pendingApiCompat(waiting, prsByApp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, discoveryApi, fetchApi]);
  return usePolled(`api-compat:${key}`, fetcher, POLL_MS);
}
