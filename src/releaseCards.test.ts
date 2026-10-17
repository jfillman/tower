import { bakeProgress, lastOutcome, liveRelease, nextReleasePath, noteCount, releaseStats } from './releaseCards';
import type { ReleaseRecord } from './useReleaseRecords';
import type { EnvironmentSummary } from './types';
import type { PullRequestSummary } from './pullRequests/usePullRequests';
import type { RecordOutcome } from './releaseFlow';

const DAY = 86_400_000;

function rec(id: string, live: string[], extra: Partial<ReleaseRecord> = {}): ReleaseRecord {
  return {
    id,
    imageTag: id,
    current: live.length > 0,
    deployments: live.map(env => ({ env, cluster: 'example-prod', deployedAt: '2026-10-14T00:00:00Z', isLive: true })),
    ...extra,
  } as unknown as ReleaseRecord;
}

function pr(number: number, title: string, ci?: 'success' | 'failure'): PullRequestSummary {
  return {
    number,
    title,
    state: 'open',
    url: `https://github.com/o/gitops-app/pull/${number}`,
    ...(ci ? { ci: { state: ci, totalChecks: 5, passedChecks: ci === 'success' ? 5 : 4 } } : {}),
  } as unknown as PullRequestSummary;
}

const env = (name: string, tag: string) => ({ env: name, image: `ghcr.io/o/app:${tag}` }) as unknown as EnvironmentSummary;

describe('liveRelease', () => {
  // Newest first, as useReleaseRecords returns them.
  const records = [rec('1.1.6-b', ['staging']), rec('1.1.5-c', ['pre-prod', 'prod']), rec('1.1.4-d', [])];

  it('is the record live in the sign-off environment, not the newest one live anywhere', () => {
    expect(liveRelease(records, 'prod', ['staging', 'pre-prod', 'prod'])?.id).toBe('1.1.5-c');
  });

  it('uses the last Flight environment when no sign-off environment is set', () => {
    expect(liveRelease(records, undefined, ['staging', 'pre-prod', 'prod'])?.id).toBe('1.1.5-c');
  });

  it('falls back to the newest current record when nothing is live in production', () => {
    expect(liveRelease([rec('1.1.6-b', ['staging'])], 'prod', ['staging', 'prod'])?.id).toBe('1.1.6-b');
  });
});

describe('lastOutcome', () => {
  const clean = { result: 'clean', state: 'superseded', bakeDays: 7, sloMeasured: false } as RecordOutcome;
  it('is the newest record with a final outcome, other than the live one', () => {
    const records = [rec('live', ['prod'], { outcome: clean }), rec('baking', [], { outcome: { state: 'healthy', bakeDays: 7, sloMeasured: false } }), rec('done', [], { outcome: clean })];
    expect(lastOutcome(records, 'live')?.id).toBe('done');
  });
  it('is undefined when nothing has an outcome yet', () => {
    expect(lastOutcome([rec('a', [])])).toBeUndefined();
  });
});

describe('bakeProgress', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  it('counts the day of the bake, from the first healthy moment', () => {
    expect(bakeProgress({ state: 'healthy', healthyAt: new Date(now - 2.5 * DAY).toISOString(), bakeDays: 7, sloMeasured: false }, now)).toEqual({ day: 3, of: 7 });
  });
  it('never passes the end of the window', () => {
    expect(bakeProgress({ state: 'healthy', healthyAt: new Date(now - 30 * DAY).toISOString(), bakeDays: 7, sloMeasured: false }, now)).toEqual({ day: 7, of: 7 });
  });
  it('is undefined once there is an outcome, or before it is healthy', () => {
    expect(bakeProgress({ result: 'clean', state: 'superseded', healthyAt: new Date(now).toISOString(), bakeDays: 7, sloMeasured: false }, now)).toBeUndefined();
    expect(bakeProgress({ state: 'progressing', bakeDays: 7, sloMeasured: false }, now)).toBeUndefined();
  });
});

describe('nextReleasePath', () => {
  const flight = ['staging', 'pre-prod', 'prod'];
  const lower = ['dev', 'test'];

  it('names the highest Ground environment, then each Flight environment', () => {
    const steps = nextReleasePath(
      '1.1.6-b',
      ['dev', 'test'],
      lower,
      flight,
      [env('staging', '1.1.6-b'), env('prod', '1.1.5-c')],
      [pr(51, 'Release: app to pre-prod @ 1.1.6-b', 'success')],
    );
    expect(steps).toEqual([
      { kind: 'ground', env: 'test' },
      { kind: 'flight', env: 'staging', state: 'live' },
      expect.objectContaining({ kind: 'flight', env: 'pre-prod', state: 'pr' }),
      { kind: 'flight', env: 'prod', state: 'waiting' },
    ]);
  });

  it('marks an open release PR with failing checks as blocked, and ignores PRs for other images', () => {
    const steps = nextReleasePath('1.1.6-b', ['dev'], lower, flight, [], [
      pr(51, 'Release: app to staging @ 1.1.6-b', 'failure'),
      pr(52, 'Release: app to pre-prod @ 1.1.5-c', 'success'),
    ]);
    expect(steps[1]).toEqual(expect.objectContaining({ env: 'staging', state: 'blocked' }));
    expect(steps[2]).toEqual({ kind: 'flight', env: 'pre-prod', state: 'waiting' });
  });

  it('has nowhere to be without a candidate', () => {
    expect(nextReleasePath(undefined, [], lower, ['prod'], [], [])).toEqual([{ kind: 'ground', env: undefined }, { kind: 'flight', env: 'prod', state: 'waiting' }]);
  });
});

describe('noteCount and releaseStats', () => {
  it('counts every note line across categories', () => {
    expect(noteCount({ notes: { added: ['a', 'b'], fixed: ['c'] } })).toBe(3);
    expect(noteCount(undefined)).toBe(0);
  });

  it('counts deploys this week, open source PRs, and open release PRs only', () => {
    const now = Date.parse('2026-10-14T12:00:00Z');
    const history = {
      dev: [{ date: new Date(now - DAY).toISOString() }, { date: new Date(now - 9 * DAY).toISOString() }],
      prod: [{ date: new Date(now - 2 * DAY).toISOString() }],
    } as any;
    const gitops = [pr(1, 'Release: app to prod @ 1.1.6-b'), pr(2, 'Release Record: app @ 1.1.5-c'), { ...pr(3, 'Release: app to staging @ x'), state: 'merged' } as PullRequestSummary];
    const source = [pr(10, 'feat: a'), { ...pr(11, 'fix: b'), state: 'merged' } as PullRequestSummary];
    expect(releaseStats(history, gitops, source, now)).toEqual({ releasesThisWeek: 2, openSourcePrs: 1, pendingPromotions: 1 });
  });
});
