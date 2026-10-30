import { fromApiEvent, fromApiRecord } from './useFleetReleases';

describe('fleet release records from glidepath-api', () => {
  it('maps a record the way the ConfigMap was mapped, labels as the fallback', () => {
    const r = fromApiRecord({
      name: 'release-tracking-1',
      namespace: 'app-bags-cicd',
      labels: { 'hangar.io/app': 'bags', 'hangar.io/env': 'prod', 'hangar.io/cluster': 'hangar-prod' },
      data: { state: 'merged', prUrl: 'https://github.com/o/gitops-bags/pull/3', mergedAt: '2026-10-30T01:00:00Z' },
    });
    expect(r).toMatchObject({ name: 'release-tracking-1', namespace: 'app-bags-cicd', appName: 'bags', env: 'prod', cluster: 'hangar-prod', state: 'merged' });
    expect(fromApiRecord({ name: 'release-tracking-2', namespace: 'app-gate-api-cicd' })).toMatchObject({ appName: 'gate-api', state: 'proposed' });
  });

  it('keeps only the two release Event reasons', () => {
    expect(fromApiEvent({ reason: 'ReleaseDrift', namespace: 'app-bags-cicd', recordName: 'release-tracking-1', message: 'drift', at: '2026-10-30T01:00:00Z' })).toEqual({
      reason: 'ReleaseDrift',
      namespace: 'app-bags-cicd',
      recordName: 'release-tracking-1',
      message: 'drift',
      at: '2026-10-30T01:00:00Z',
    });
    expect(fromApiEvent({ reason: 'BackOff' })).toBeUndefined();
  });
});
