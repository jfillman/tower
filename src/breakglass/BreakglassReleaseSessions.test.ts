import { releaseWindow, sessionsInWindow } from './BreakglassReleaseSessions';
import type { ReleaseRecord } from '../useReleaseRecords';
import type { BreakglassSession } from '../tabs/topology/breakglassShared';

const rec = (id: string, deployments: Array<{ env: string; deployedAt: string }>) =>
  ({ id, deployments: deployments.map(d => ({ ...d, cluster: 'kind-prod', isLive: false })) }) as unknown as ReleaseRecord;

describe('break-glass sessions during a release (G12)', () => {
  const a = rec('app@1', [{ env: 'prod', deployedAt: '2026-10-10T10:00:00.000Z' }, { env: 'staging', deployedAt: '2026-10-10T09:00:00.000Z' }]);
  const b = rec('app@2', [{ env: 'prod', deployedAt: '2026-10-11T10:00:00.000Z' }]);
  const c = rec('app@3', [{ env: 'prod', deployedAt: '2026-10-12T10:00:00.000Z' }]);

  it('a release`s window in an environment runs from its deploy to the next release`s deploy there', () => {
    expect(releaseWindow(a, [b, c], 'prod')).toEqual({ from: '2026-10-10T10:00:00.000Z', to: '2026-10-11T10:00:00.000Z' });
    expect(releaseWindow(c, [a, b], 'prod')).toEqual({ from: '2026-10-12T10:00:00.000Z' });
    expect(releaseWindow(a, [b, c], 'staging')).toEqual({ from: '2026-10-10T09:00:00.000Z' });
    expect(releaseWindow(b, [a, c], 'staging')).toBeUndefined();
  });

  it('keeps the sessions started inside the window', () => {
    const s = (id: string, startedAt?: string) => ({ id, startedAt }) as BreakglassSession;
    const w = { from: '2026-10-10T10:00:00.000Z', to: '2026-10-11T10:00:00.000Z' };
    expect(sessionsInWindow([s('before', '2026-10-10T09:59:59.000Z'), s('in', '2026-10-10T12:00:00.000Z'), s('at-end', '2026-10-11T10:00:00.000Z'), s('never')], w).map(x => x.id)).toEqual(['in']);
    expect(sessionsInWindow([s('late', '2026-10-13T00:00:00.000Z')], { from: '2026-10-12T10:00:00.000Z' }).map(x => x.id)).toEqual(['late']);
  });
});
