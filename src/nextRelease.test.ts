import { buildNextRelease, closingIssueRefs, promotionReadiness, suggestVersion } from './nextRelease';
import type { PullRequestSummary } from './pullRequests/usePullRequests';
import type { ReleaseRow } from './useReleaseContext';
import { buildReleaseRecords } from './useReleaseRecords';
import type { EnvironmentSummary } from './types';

const REPO = 'ghcr.io/o/bags';
const env = (over: Partial<EnvironmentSummary> & { env: string }): EnvironmentSummary =>
  ({
    key: `example-dev/${over.env}`,
    cluster: 'example-dev',
    namespace: `bags-${over.env}`,
    deployed: true,
    rolloutPhase: 'Healthy',
    drift: false,
    pods: [],
    services: [],
    resources: [],
    owner: 'o',
    appName: 'bags',
    ...over,
  }) as EnvironmentSummary;

const pr = (over: Partial<PullRequestSummary> & { number: number }): PullRequestSummary => ({
  repo: 'source',
  title: `PR ${over.number}`,
  url: `https://github.com/o/bags/pull/${over.number}`,
  draft: false,
  labels: [],
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  state: 'merged',
  ...over,
});

const row = (tag: string, cells: ReleaseRow['cells'], introducedAt: string, nickname?: string): ReleaseRow => ({
  imageTag: tag,
  image: `${REPO}:${tag}`,
  cells,
  introducedAt,
  current: true,
  nickname,
});

// BIRCH (1.8.2-6f1c0aa) is on staging (Flight). Two images built from main since:
// quiet-heron (version not bumped) and amber-finch (live on dev).
const environments = [
  env({ env: 'dev', image: `${REPO}:1.9.0-a41f9c2` }),
  env({ env: 'staging', cluster: 'example-prod', image: `${REPO}:1.8.2-6f1c0aa` }),
];
const pipelineOrder = { lower: ['dev'], upper: ['staging'] };
const releases: ReleaseRow[] = [
  row('1.9.0-a41f9c2', { dev: { status: 'deployed', date: '2026-10-12T10:05:00Z', sha: 'a41f9c2' } }, '2026-10-12T10:05:00Z', 'amber-finch'),
  row('1.8.2-4c1e9a0', { dev: { status: 'deployed', date: '2026-10-11T09:05:00Z', sha: '4c1e9a0' } }, '2026-10-11T09:05:00Z', 'quiet-heron'),
  row(
    '1.8.2-6f1c0aa',
    {
      dev: { status: 'deployed', date: '2026-10-10T08:05:00Z', sha: '6f1c0aa' },
      staging: { status: 'deployed', date: '2026-10-10T12:00:00Z', sha: '6f1c0aa' },
    },
    '2026-10-10T08:05:00Z',
    'north-tern',
  ),
];
const sourcePrs = [
  pr({ number: 10, title: 'feat: bag search', mergedAt: '2026-10-10T08:00:00Z', mergeCommitSha: '6f1c0aa1111' }),
  // Merged after BIRCH's image was built but before BIRCH reached staging: not in BIRCH.
  pr({ number: 11, title: 'fix: weight rounding', body: 'Fixes #198', mergedAt: '2026-10-10T09:00:00Z' }),
  pr({ number: 12, title: 'feat: bag-tag reprint', mergedAt: '2026-10-11T09:00:00Z', mergeCommitSha: '4c1e9a02222' }),
  pr({ number: 13, title: 'fix: transfer cutoff timezone', body: 'closes o/other#5', mergedAt: '2026-10-12T10:00:00Z', mergeCommitSha: 'a41f9c23333' }),
  pr({ number: 221, title: 'feat: lost-bag claims', body: 'Resolves #203', state: 'open' }),
  pr({ number: 7, title: 'Release bags to cloud', mergedAt: '2026-10-12T11:00:00Z', releasePin: 'prod' }),
];

const records = buildReleaseRecords('bags', environments, releases, [], sourcePrs, [], {}, pipelineOrder);
const NOW = new Date('2026-10-13T12:05:00Z').getTime();
const next = buildNextRelease({
  records,
  releases,
  sourcePrs,
  pipelineRuns: [],
  provenanceByImage: {},
  pipelineEnvironments: environments,
  pipelineOrder,
  now: NOW,
});

describe('buildNextRelease', () => {
  it('follows the newest release to reach Flight', () => {
    expect(next.previous?.imageTag).toBe('1.8.2-6f1c0aa');
  });

  it('scopes PRs merged after the previous release commit landed, not after it reached Flight', () => {
    expect(next.scope.map(p => p.number)).toEqual([11, 12, 13]);
    expect(records[0].pullRequests.map(p => p.number)).toEqual([10]);
  });

  it('keeps open PRs as incoming, and release pin PRs out of both', () => {
    expect(next.incoming.map(p => p.number)).toEqual([221]);
  });

  it('links the issues the scope and incoming PRs close', () => {
    expect(next.issues).toEqual([
      { label: '#198', url: 'https://github.com/o/bags/issues/198', prNumber: 11, merged: true },
      { label: 'o/other#5', url: 'https://github.com/o/other/issues/5', prNumber: 13, merged: true },
      { label: '#203', url: 'https://github.com/o/bags/issues/203', prNumber: 221, merged: false },
    ]);
  });

  it('lists every image built since as a candidate, newest first, with the PRs each contains', () => {
    expect(next.candidates.map(c => [c.nickname, c.prCount, c.liveOn])).toEqual([
      ['amber-finch', 3, ['dev']],
      ['quiet-heron', 2, []],
    ]);
    expect(next.leading?.nickname).toBe('amber-finch');
  });

  it('suggests the next version from the merged PRs', () => {
    expect(next.previousVersion).toBe('1.8.2');
    expect(next.suggestedVersion).toBe('1.9.0');
  });

  it('checks readiness against the leading candidate', () => {
    const byId = Object.fromEntries(next.readiness.map(i => [i.id, i]));
    expect(byId.changes.state).toBe('ok');
    expect(byId.candidate).toMatchObject({ state: 'ok', detail: 'Running on dev' });
    expect(byId.soak).toMatchObject({ state: 'ok', detail: 'On Ground for 26h' });
    expect(byId.build.state).toBe('unknown');
    expect(byId.version).toMatchObject({ state: 'ok', detail: '1.8.2 → 1.9.0' });
    expect(byId.rollback.state).toBe('ok');
  });

  it('judges the check ride once provenance is loaded (Glidepath test framework)', () => {
    const SLSA = 'https://slsa.dev/provenance/v0.2';
    const task = (name: string, results: Record<string, string>) => ({ name, results: Object.entries(results).map(([n, v]) => ({ name: n, value: v })) });
    const att = (tasks: unknown[], finishedOn: string, verified = true) => ({
      predicateType: SLSA,
      verified,
      verificationCode: verified ? ('verified' as const) : ('no-log-entry' as const),
      predicate: { metadata: { buildFinishedOn: finishedOn }, buildConfig: { tasks } },
    });
    const ride = (over: Record<string, string> = {}) => ({
      outcome: 'passed', role: 'check-ride', 'tests-total': '8', 'tests-passed': '8', 'tests-failed': '0', 'tests-skipped': '0',
      'workflow-source': 'argocd:check-rides', 'execution-id': 'e1', ...over,
    });
    const build = att([task('build-image', {})], '2026-10-12T10:00:00Z');
    const judge = (atts: unknown[]) => {
      const n = buildNextRelease({
        records, releases, sourcePrs, pipelineRuns: [], pipelineEnvironments: environments, pipelineOrder, now: NOW,
        provenanceByImage: { [`${REPO}:1.9.0-a41f9c2`]: { loading: false, data: { digest: 'sha256:a', attestations: atts } } } as never,
      });
      return n.readiness.find(i => i.id === 'check-ride');
    };
    // No provenance loaded: the item is not judged at all.
    expect(next.readiness.find(i => i.id === 'check-ride')).toBeUndefined();
    expect(judge([build])).toMatchObject({ state: 'todo', detail: 'No test run attested on this image yet' });
    expect(judge([build, att([task('run-testworkflow', ride({ role: 'test', 'workflow-source': 'repo:x@y' }))], '2026-10-12T11:00:00Z')])).toMatchObject({ state: 'todo', detail: expect.stringContaining('no check ride') });
    expect(judge([build, att([task('run-testworkflow', ride({ outcome: 'failed' }))], '2026-10-12T11:00:00Z')])).toMatchObject({ state: 'todo', detail: 'The latest check ride failed' });
    expect(judge([build, att([task('run-testworkflow', ride({ 'workflow-source': 'repo:x@y' }))], '2026-10-12T11:00:00Z')])).toMatchObject({ state: 'todo', detail: expect.stringContaining('shared check-rides repository') });
    expect(judge([build, att([task('run-testworkflow', ride())], '2026-10-12T11:00:00Z', false)])).toMatchObject({ state: 'todo', detail: expect.stringContaining('did not verify') });
    // The newest verified pass wins over an older failure, and an older pass is not hidden by a newer failure.
    expect(judge([build, att([task('run-testworkflow', ride({ outcome: 'failed' }))], '2026-10-12T11:00:00Z'), att([task('run-testworkflow', ride())], '2026-10-12T12:00:00Z')])).toMatchObject({ state: 'ok', detail: '8 of 8 tests passed, attested on the image' });
    expect(judge([build, att([task('run-testworkflow', ride())], '2026-10-12T11:00:00Z'), att([task('run-testworkflow', ride({ outcome: 'failed', 'execution-id': 'e2' }))], '2026-10-12T12:00:00Z')])).toMatchObject({ state: 'ok' });
  });

  it('opens an empty draft as soon as the previous release reaches Flight', () => {
    const quiet = buildNextRelease({
      records,
      releases: releases.slice(2),
      sourcePrs: sourcePrs.filter(p => p.number === 10),
      pipelineRuns: [],
      provenanceByImage: {},
      pipelineEnvironments: environments,
      pipelineOrder,
      now: NOW,
    });
    expect(quiet.scope).toEqual([]);
    expect(quiet.candidates).toEqual([]);
    expect(quiet.readiness.map(i => [i.id, i.state])).toEqual([
      ['changes', 'todo'],
      ['candidate', 'todo'],
    ]);
  });

  it('says when the merged-PR window may hide older scope', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      pr({ number: 100 + i, mergedAt: `2026-10-11T${String(i).padStart(2, '0')}:30:00Z` }),
    );
    const wide = buildNextRelease({
      records,
      releases,
      sourcePrs: many,
      pipelineRuns: [],
      provenanceByImage: {},
      pipelineEnvironments: environments,
      pipelineOrder,
      now: NOW,
    });
    expect(wide.scopeMayBeIncomplete).toBe(true);
  });
});

describe('closingIssueRefs', () => {
  it('reads GitHub closing keywords, not plain mentions', () => {
    const refs = closingIssueRefs(
      pr({ number: 1, title: 'fix: x (fixes #4)', body: 'See #9. Closes: #10, resolved o/r#11\nfixed #4' }),
    );
    expect(refs.map(r => r.url)).toEqual([
      'https://github.com/o/bags/issues/4',
      'https://github.com/o/bags/issues/10',
      'https://github.com/o/r/issues/11',
    ]);
  });
});

describe('suggestVersion', () => {
  const c = (features: number, fixes = 0) => ({ features, fixes, chores: 0 });
  it.each([
    ['1.8.2', c(1), false, '1.9.0'],
    ['1.8.2', c(0, 2), false, '1.8.3'],
    ['1.8.2', c(0), true, '2.0.0'],
    ['0.4.1', c(0), true, '0.5.0'],
    ['v2.0.0', c(0, 1), false, '2.0.1'],
  ] as const)('%s with %o, breaking %s -> %s', (prev, cats, breaking, want) => {
    expect(suggestVersion(prev, cats, breaking)).toBe(want);
  });
  it('has nothing to suggest without a semver to start from', () => {
    expect(suggestVersion('main', c(1), false)).toBeUndefined();
  });
});

describe('readiness from the saved draft and release mode (R2)', () => {
  const withFlow = (flow: Parameters<typeof buildNextRelease>[0]['flow']) =>
    buildNextRelease({
      records,
      releases,
      sourcePrs,
      pipelineRuns: [],
      provenanceByImage: {},
      pipelineEnvironments: environments,
      pipelineOrder,
      flow,
      now: NOW,
    }).readiness.filter(i => ['notes', 'owner', 'signoff'].includes(i.id));

  it('asks for notes and an owner, and for a sign-off only when Hand-flown', () => {
    expect(withFlow({ mode: 'assisted' }).map(i => [i.id, i.state])).toEqual([
      ['notes', 'todo'],
      ['owner', 'todo'],
    ]);
    const handFlown = withFlow({ mode: 'hand-flown', signoffEnv: 'prod', draft: { owner: 'example-org', notes: { added: ['a', 'b'] } } });
    expect(handFlown.map(i => [i.id, i.state, i.detail])).toEqual([
      ['notes', 'ok', '2 entries in the draft'],
      ['owner', 'ok', 'example-org'],
      ['signoff', 'todo', 'Hand-flown: the prod release PR needs an approving review from someone other than whoever merges it'],
    ]);
  });

  it('adds nothing before the draft and mode have loaded', () => {
    expect(withFlow(undefined)).toEqual([]);
  });
});

describe('R4: Jira links, planned scope and the target date', () => {
  it('links Jira keys from the title, body and branch when a Jira site is configured', () => {
    const refs = closingIssueRefs(
      pr({ number: 3, title: 'BAG-12: reprint', body: 'Also touches OPS-7', headRef: 'feature/BAG-99-x' }),
      'https://acme.atlassian.net',
    );
    expect(refs.map(r => r.label)).toEqual(['BAG-12', 'OPS-7', 'BAG-99']);
    expect(refs[0].url).toBe('https://acme.atlassian.net/browse/BAG-12');
    expect(closingIssueRefs(pr({ number: 3, title: 'BAG-12: reprint' }))).toEqual([]);
  });

  it('checks the target date and the planned issues', () => {
    const items = buildNextRelease({
      records,
      releases,
      sourcePrs,
      pipelineRuns: [],
      provenanceByImage: {},
      pipelineEnvironments: environments,
      pipelineOrder,
      flow: {
        draft: { targetDate: '2026-10-11' },
        planned: {
          milestone: { number: 3, title: 'Oct bag-tag', url: 'm3' },
          issues: [
            { number: 1, title: 'a', state: 'closed', url: 'i1' },
            { number: 2, title: 'b', state: 'open', url: 'i2' },
          ],
        },
      },
      now: NOW,
    }).readiness.filter(i => ['target', 'planned'].includes(i.id));
    expect(items.map(i => [i.id, i.state, i.detail])).toEqual([
      ['target', 'todo', '2026-10-11 (3 days late)'],
      ['planned', 'todo', '1 of 2 on Oct bag-tag'],
    ]);
  });
});

describe('promotion readiness (glidepath ADR-0029)', () => {
  const release = (checks: NonNullable<PullRequestSummary['ci']>['checks'], state: PullRequestSummary['state'] = 'open') =>
    pr({
      number: 57,
      repo: 'gitops',
      state,
      title: 'Release: gate-api to prod @ 2.0.7-92988b1',
      ci: { state: 'pending', totalChecks: 1, passedChecks: 0, checks },
    } as Partial<PullRequestSummary> & { number: number });
  const check = (status: 'queued' | 'in_progress' | 'completed', conclusion?: string, message?: string) => [
    { name: 'Pipelines as Code CI / image-promotion-', status, conclusion, message },
  ];

  it('is ready once the release PR has a green image-promotion check', () => {
    expect(promotionReadiness('2.0.7-92988b1', [release(check('completed', 'success'))])).toEqual([
      { id: 'promotion', label: 'Promoted to Flight', state: 'ok', detail: 'Promoted for release PR #57' },
    ]);
  });

  it('says why a failed promotion is not ready, and that a running one is in progress', () => {
    expect(promotionReadiness('2.0.7-92988b1', [release(check('completed', 'failure', 'PROM-03: qa is red\nmore'))])[0].detail).toBe(
      'Not promoted: PROM-03: qa is red (release PR #57)',
    );
    expect(promotionReadiness('2.0.7-92988b1', [release(check('in_progress'))])[0]).toMatchObject({ state: 'todo', detail: 'Promoting (release PR #57)' });
  });

  it('has no row without an open release PR for the candidate, or without the check', () => {
    expect(promotionReadiness('2.0.7-92988b1', [release(check('completed', 'success'), 'merged')])).toEqual([]);
    expect(promotionReadiness('2.0.8-aaaaaaa', [release(check('completed', 'success'))])).toEqual([]);
    expect(promotionReadiness('2.0.7-92988b1', [release([{ name: 'Pipelines as Code CI / qa-', status: 'completed', conclusion: 'success' }])])).toEqual([]);
  });
});
