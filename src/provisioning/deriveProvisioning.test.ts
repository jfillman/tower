import { deriveProvisioning, type ProvisioningInputs, type XrCondition } from './deriveProvisioning';

// Conditions copied from the live gate-api NodeJSApplication XR on kiac-dev.
const live: XrCondition[] = [
  {
    type: 'DevClusterReady',
    status: 'True',
    reason: 'DevClusterReady',
    lastTransitionTime: '2026-09-30T15:01:33Z',
  },
  {
    type: 'CicdOnboarded',
    status: 'True',
    reason: 'CicdOnboarded',
    lastTransitionTime: '2026-09-30T15:01:59Z',
  },
  {
    type: 'Synced',
    status: 'True',
    reason: 'ReconcileSuccess',
    lastTransitionTime: '2026-10-01T01:49:57Z',
  },
  {
    type: 'Ready',
    status: 'True',
    reason: 'Available',
    lastTransitionTime: '2026-10-01T01:49:57Z',
  },
];
const created = Date.parse('2026-09-30T14:11:58Z');
const xr = (conditions: XrCondition[]): ProvisioningInputs['xr'] => ({
  kind: 'NodeJSApplication',
  name: 'gate-api',
  namespace: 'app-gate-api-cicd',
  cluster: 'kind-dev',
  createdAt: created,
  conditions,
});
const now = Date.parse('2026-10-01T02:00:00Z');
const states = (p: ReturnType<typeof deriveProvisioning>) => p.steps.map(s => s.state).join(',');

describe('deriveProvisioning', () => {
  it('a brand new XR with no conditions is only accepted', () => {
    const p = deriveProvisioning({ xr: xr([]) }, created + 5000);
    expect(states(p)).toBe('done,run,pend,run,pend,pend');
    expect(p.complete).toBe(false);
    expect(p.percent).toBeLessThan(10);
  });

  it('marks cluster and CI/CD onboarding done from their conditions, with durations', () => {
    const p = deriveProvisioning({ xr: xr(live.slice(0, 2).concat({ type: 'Ready', status: 'False' })) }, now);
    expect(states(p)).toBe('done,done,done,run,pend,pend');
    expect(p.steps[2].seconds).toBe(26);
  });

  it('runs the build step with task progress and waits for it when no run exists', () => {
    const base = { xr: xr(live) };
    expect(deriveProvisioning(base, now).steps[4]).toMatchObject({
      state: 'run',
      detail: 'Waiting for the first pipeline run to start',
    });
    const p = deriveProvisioning(
      {
        ...base,
        build: {
          name: 'b1',
          phase: 'running',
          startedAt: now - 60000,
          tasksDone: 3,
          tasksTotal: 6,
        },
      },
      now,
    );
    expect(p.steps[4]).toMatchObject({
      state: 'run',
      fraction: 0.5,
      seconds: 60,
    });
  });

  it('treats a rollout as proof of the build when the pipeline run was pruned', () => {
    const p = deriveProvisioning({ xr: xr(live), rollout: { phase: 'Healthy', desired: 2, available: 2 } }, now);
    expect(p.steps[4].state).toBe('done');
    expect(p.complete).toBe(true);
  });

  it('is complete only when the rollout is healthy', () => {
    const base = {
      xr: xr(live),
      build: {
        name: 'b1',
        phase: 'succeeded' as const,
        startedAt: now - 200000,
        completedAt: now - 60000,
        tasksDone: 6,
        tasksTotal: 6,
      },
    };
    const partial = deriveProvisioning({ ...base, rollout: { phase: 'Progressing', desired: 2, available: 1 } }, now);
    expect(partial.complete).toBe(false);
    expect(partial.steps[5].fraction).toBe(0.5);
    const done = deriveProvisioning({ ...base, rollout: { phase: 'Healthy', desired: 2, available: 2 } }, now);
    expect(done.complete).toBe(true);
    expect(done.percent).toBe(100);
    expect(done.etaSec).toBe(0);
  });

  it('surfaces a failed XR sync and a failed build', () => {
    const syncBad = deriveProvisioning(
      {
        xr: xr([{ type: 'Synced', status: 'False', message: 'cannot create repo' }]),
      },
      now,
    );
    expect(syncBad.failed).toBe(true);
    expect(syncBad.steps[3]).toMatchObject({
      state: 'fail',
      detail: 'cannot create repo',
    });
    const buildBad = deriveProvisioning(
      {
        xr: xr(live),
        build: { name: 'b1', phase: 'failed', tasksDone: 2, tasksTotal: 6 },
      },
      now,
    );
    expect(buildBad.steps[4].state).toBe('fail');
  });

  it('uses per-resource readiness when the caller can read managed resources', () => {
    const p = deriveProvisioning(
      {
        xr: xr([]),
        managed: [
          { name: 'a', ready: true, readyAt: created + 1000 },
          { name: 'b', ready: false },
        ],
      },
      created + 9000,
    );
    expect(p.steps[3]).toMatchObject({ state: 'run', fraction: 0.5 });
  });
});
