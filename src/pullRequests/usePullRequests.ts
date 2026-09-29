import { useEffect, useState } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';

// One real GitHub Check Run against the PR's head commit - see the
// backend's own identical type (packages/backend/src/pullRequests.ts) for
// why `name` is exactly this platform's own release-guardrail gate names
// (sast, image-scan, provenance, ...). Used by the CI/CD tab's CD panel to
// list each real gate by name/status (2026-09-12), not just the aggregate
// pass count.
export interface PrCheckRun {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: string;
  detailsUrl?: string;
  // The gate's own real report - prefers the PR comment glidepath-catalog's
  // comment-pr-check-result.yaml posts (failure detail + recommendation)
  // over the native Check Run's thinner output.summary/title - see the
  // backend's identical field for why.
  message?: string;
  // The PR comment `message` came from, when it came from one - see the
  // backend's identical field.
  commentUrl?: string;
}

export interface PullRequestSummary {
  repo: 'source' | 'gitops';
  number: number;
  title: string;
  url: string;
  author?: string;
  draft: boolean;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  // Backend now also returns a bounded window of recently-merged PRs
  // alongside every open one - see packages/backend/src/pullRequests.ts.
  state: 'open' | 'merged';
  mergedAt?: string;
  // The PR's own description body - see the backend's identical field.
  body?: string;
  // The real merge commit sha, once merged - see the backend's identical
  // field.
  mergeCommitSha?: string;
  // Only ever set for open gitops (release) PRs, plus the single newest
  // merged gitops PR per app - the backend deliberately doesn't fetch this
  // for every PR (GitHub rate-limit reasons, see the backend's own
  // comment), so its absence elsewhere is expected, not a loading gap.
  ci?: {
    state: 'success' | 'failure' | 'pending' | 'unknown';
    totalChecks: number;
    passedChecks: number;
    checks?: PrCheckRun[];
    // The latest completed_at across every check run - see the backend's
    // identical field for why this is the real "guardrails checked"
    // completion instant.
    completedAt?: string;
  };
  review?: { state: 'approved' | 'changes_requested' | 'pending' };
}

// One call per tab view, not polled - same posture as Glidepath's own
// useDeployHistory/useImageVersions (see GlidepathPage.tsx's own comments on
// why: this platform has already hit its hourly GitHub rate limit more than
// once this session, and open-PR counts don't change moment-to-moment the
// way live Kubernetes state does). `refreshNonce` - bump it from a caller's
// own `useState` - is a manual, user-triggered re-fetch, deliberately not an
// automatic poll: some Tower tabs had no way at all to see fresh PR data
// short of a full page reload (2026-09-09 feedback, "some tabs aren't
// refreshing"), but blind polling here is exactly what caused the prior
// rate-limit incident.
export function usePullRequests(
  ownerAppName: { owner: string; appName: string } | undefined,
  refreshNonce = 0,
) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{
    loading: boolean;
    error?: string;
    data?: PullRequestSummary[];
  }>({ loading: Boolean(ownerAppName) });
  const key = ownerAppName ? `${ownerAppName.owner}/${ownerAppName.appName}` : '';

  useEffect(() => {
    if (!ownerAppName) {
      setState({ loading: false });
      return undefined;
    }
    let cancelled = false;
    // Keeps the previously-loaded PR list visible during a background
    // refetch instead of wiping it to `{ loading: true }` first (2026-09-12
    // bug: every refresh - a manual click, or the CI/CD tab's own 20s
    // auto-poll while a delivery is active - briefly emptied `data` for the
    // whole round-trip, which made gitopsPrs momentarily empty too. A
    // delivery's `current.pr` (and with it, the gate pill, which only shows
    // for an open PR) would disappear for that window on every single poll
    // tick, not just occasionally.
    setState(prev => ({ ...prev, loading: true }));
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('pull-requests');
        const params = new URLSearchParams({
          owner: ownerAppName.owner,
          appName: ownerAppName.appName,
        });
        const res = await fetchApi.fetch(`${baseUrl}/pull-requests?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => undefined);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = (await res.json()) as PullRequestSummary[];
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, discoveryApi, fetchApi, refreshNonce]);

  return state;
}
