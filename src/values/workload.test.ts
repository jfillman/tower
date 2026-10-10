import { workloadOn, workloadStatus, type WorkloadView } from './workload';

describe('workloadOn', () => {
  it('is off for rollout: null and rollout.enabled: false, whatever is inherited', () => {
    expect(workloadOn(null)).toBe(false);
    expect(workloadOn({ enabled: false, replicas: 2 })).toBe(false);
    expect(workloadOn(null, 'none')).toBe(false);
  });

  it('is on for an explicit enabled: true, even over an inherited off', () => {
    expect(workloadOn({ enabled: true }, 'none')).toBe(true);
  });

  it('inherits when the file says nothing (absent, or a map without enabled)', () => {
    expect(workloadOn(undefined)).toBe(true);
    expect(workloadOn({ replicas: 2 })).toBe(true);
    expect(workloadOn(undefined, 'none')).toBe(false);
    expect(workloadOn({ replicas: 2 }, 'none')).toBe(false);
  });
});

describe('workloadStatus', () => {
  const view = (over: Partial<WorkloadView>): WorkloadView => ({ shape: 'service', shapeFrom: 'default', inherited: 'service', legacyNull: false, release: null, ...over });
  const img = { repository: 'ghcr.io/o/app', tag: 'abc123' };

  it('not deployed yet: a service with nothing released', () => {
    expect(workloadStatus(view({})).kind).toBe('not-deployed');
  });

  it('deployed: a service with a released image', () => {
    expect(workloadStatus(view({ release: img }))).toEqual({ kind: 'deployed', text: 'Released: abc123' });
  });

  it('no workload: names the setting and where it came from', () => {
    const s = workloadStatus(view({ shape: 'none', shapeFrom: 'shared' }));
    expect(s.kind).toBe('no-workload');
    expect(s.text).toContain('rollout.enabled: false in the shared values');
  });

  it('misconfigured: a release file asking for an image in a no-workload environment', () => {
    const s = workloadStatus(view({ shape: 'none', shapeFrom: 'env', legacyNull: true, release: img }));
    expect(s.kind).toBe('misconfigured');
    expect(s.text).toContain('rollout: null');
    expect(s.text).toContain('abc123');
  });
});
