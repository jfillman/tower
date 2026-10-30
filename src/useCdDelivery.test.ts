import { buildCdEnvDelivery } from './useCdDelivery';
import type { PullRequestSummary } from './pullRequests/usePullRequests';

const pr = (ci: PullRequestSummary['ci']): PullRequestSummary => ({
  repo: 'gitops',
  number: 9,
  title: 'Release: app to staging @ 1.0.1-abcdef0',
  url: 'https://github.com/o/gitops-app/pull/9',
  draft: false,
  labels: [],
  createdAt: '2026-10-12T10:00:00Z',
  updatedAt: '2026-10-12T10:20:00Z',
  mergedAt: '2026-10-12T10:20:00Z',
  state: 'merged',
  ci,
});

const argo = { syncStatus: 'Synced', healthStatus: 'Healthy', operationPhase: 'Succeeded', operationStartedAt: '2026-10-12T10:21:00Z', operationFinishedAt: '2026-10-12T10:21:30Z', healthSince: '2026-10-12T10:23:00Z' };

// A finished delivery is the panel's "previous" one; it only stays "current" while something is still in flight.
const step = (prs: PullRequestSummary[], key: string) => {
  const d = buildCdEnvDelivery('staging', prs, argo);
  return (d.current ?? d.previous)?.steps.find(s => s.key === key);
};

describe('guardrails step after the merge', () => {
  it('is green when every check passed', () => {
    expect(step([pr({ state: 'success', totalChecks: 8, passedChecks: 8 })], 'guardrails')).toMatchObject({ status: 'good' });
  });

  it('is red, not green, when the merge went ahead with a failed check (a bypass)', () => {
    const prs = [pr({ state: 'failure', totalChecks: 8, passedChecks: 6 })];
    expect(step(prs, 'guardrails')).toMatchObject({ status: 'bad' });
    // The delivery itself still moved on: the merge happened and the rollout ran, and it counts as finished.
    expect(step(prs, 'merged')).toMatchObject({ status: 'good' });
    expect(step(prs, 'healthy')).toMatchObject({ status: 'good' });
    expect(buildCdEnvDelivery('staging', prs, argo).current).toBeUndefined();
  });

  it('stays green when the merged PR carries no check state at all', () => {
    expect(step([pr(undefined)], 'guardrails')).toMatchObject({ status: 'good' });
  });
});

describe('a rollback release PR', () => {
  const ok = { state: 'success' as const, totalChecks: 8, passedChecks: 8 };
  const merged = (number: number, title: string, mergedAt: string): PullRequestSummary => ({
    ...pr(ok),
    number,
    title,
    updatedAt: mergedAt,
    mergedAt,
  });
  // 2026-10-30, gate-api prod: 2.0.7 then 2.0.8 released, then rolled back to 2.0.6.
  const prs = [
    merged(1, 'Release: app to staging @ 2.0.7-92988b1', '2026-10-30T04:00:00Z'),
    merged(2, 'Release: app to staging @ 2.0.8-49ccca1', '2026-10-30T05:00:00Z'),
    merged(3, 'Rollback: app staging to 2.0.6-f54c365', '2026-10-30T16:41:55Z'),
  ];

  it('is the delivery once merged, with the release it replaced before it', () => {
    // Argo still syncing the rollback: it is in flight.
    const d = buildCdEnvDelivery('staging', prs, { ...argo, syncStatus: 'OutOfSync', healthStatus: 'Progressing', operationPhase: 'Running' });
    expect(d.current?.pr?.number).toBe(3);
    expect(d.previous?.pr?.number).toBe(2);
  });

  it('is the delivery while open', () => {
    const open = { ...merged(3, 'Rollback: app staging to 2.0.6-f54c365', '2026-10-30T16:32:13Z'), state: 'open' as const, mergedAt: undefined };
    const d = buildCdEnvDelivery('staging', [prs[0], prs[1], open], argo);
    expect(d.current?.pr?.number).toBe(3);
    expect(d.previous?.pr?.number).toBe(2);
  });
});
