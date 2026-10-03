import {
  deriveProvisioning,
  infisicalProjectUrl,
  type ProvisioningInputs,
  type ProvisioningLinks,
  type XrCondition,
} from './deriveProvisioning';

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
// Steps, in order: request, cluster, cicd, repos, onboarding, secrets, build, running.
const [REQUEST, CLUSTER, CICD, REPOS, ONBOARDING, SECRETS, BUILD, RUNNING] = [0, 1, 2, 3, 4, 5, 6, 7];
const secretsReady = { found: true, ready: true, readyAt: Date.parse('2026-09-30T15:03:00Z') };
// Both onboarding PRs merged, as on sky-marshall (jfillman/sky-marshall#1, gitops-sky-marshall#1).
const mergedLinks: ProvisioningLinks = {
  onboarding: {
    source: {
      number: 1,
      url: 'https://github.com/o/gate-api/pull/1',
      state: 'merged',
      mergedAt: Date.parse('2026-09-30T15:10:00Z'),
    },
    gitops: {
      number: 1,
      url: 'https://github.com/o/gitops-gate-api/pull/1',
      state: 'merged',
      mergedAt: Date.parse('2026-09-30T15:10:20Z'),
    },
  },
};
const states = (p: ReturnType<typeof deriveProvisioning>) => p.steps.map(s => s.state).join(',');

describe('deriveProvisioning', () => {
  it('a brand new XR with no conditions is only accepted', () => {
    const p = deriveProvisioning({ xr: xr([]) }, created + 5000);
    expect(states(p)).toBe('done,run,pend,run,pend,pend,pend,pend');
    expect(p.complete).toBe(false);
    expect(p.percent).toBeLessThan(10);
  });

  it('marks cluster and CI/CD onboarding done from their conditions, with durations', () => {
    const p = deriveProvisioning({ xr: xr(live.slice(0, 2).concat({ type: 'Ready', status: 'False' })) }, now);
    expect(states(p)).toBe('done,done,done,run,pend,run,pend,pend');
    expect(p.steps[CLUSTER].state).toBe('done');
    expect(p.steps[CICD].seconds).toBe(26);
  });

  it('runs the build step with task progress and waits for it when no run exists', () => {
    const base = { xr: xr(live), links: mergedLinks, secrets: secretsReady };
    expect(deriveProvisioning(base, now).steps[BUILD]).toMatchObject({
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
    expect(p.steps[BUILD]).toMatchObject({
      state: 'run',
      fraction: 0.5,
      seconds: 60,
    });
  });

  it('treats a rollout as proof of the build when the pipeline run was pruned', () => {
    const p = deriveProvisioning({ xr: xr(live), rollout: { phase: 'Healthy', desired: 2, available: 2 } }, now);
    expect(p.steps[BUILD].state).toBe('done');
    expect(p.steps[ONBOARDING].state).toBe('done');
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
    expect(partial.steps[RUNNING].fraction).toBe(0.5);
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
    expect(syncBad.steps[REPOS]).toMatchObject({
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
    expect(buildBad.steps[BUILD].state).toBe('fail');
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
    expect(p.steps[REPOS]).toMatchObject({ state: 'run', fraction: 0.5 });
  });

  describe('onboarding PRs', () => {
    const open = (n: number, repo: string) => ({
      number: n,
      url: `https://github.com/o/${repo}/pull/${n}`,
      state: 'open' as const,
    });
    const front = { xr: xr(live) };

    it('waits for the two PRs to be opened, then for both to be merged', () => {
      expect(deriveProvisioning({ ...front, links: { onboarding: {} } }, now).steps[ONBOARDING]).toMatchObject({
        state: 'run',
        detail: 'Waiting for onboarding to open its two PRs',
      });
      const oneMerged = deriveProvisioning(
        {
          ...front,
          links: { onboarding: { source: mergedLinks.onboarding?.source, gitops: open(1, 'gitops-gate-api') } },
        },
        now,
      ).steps[ONBOARDING];
      expect(oneMerged).toMatchObject({ state: 'run', fraction: 0.5 });
      expect(oneMerged.detail).toContain('1 of 2 merged');
      expect(oneMerged.links?.map(l => l.label)).toEqual(['Source PR #1', 'GitOps PR #1']);
    });

    it('holds the build until both PRs are merged', () => {
      const p = deriveProvisioning(
        { ...front, links: { onboarding: { source: open(1, 'gate-api'), gitops: open(1, 'gitops-gate-api') } } },
        now,
      );
      expect(p.steps[ONBOARDING].state).toBe('run');
      expect(p.steps[BUILD].state).toBe('pend');
      const merged = deriveProvisioning({ ...front, links: mergedLinks }, now);
      expect(merged.steps[ONBOARDING].state).toBe('done');
      expect(merged.steps[BUILD]).toMatchObject({
        state: 'run',
        detail: 'Waiting for the first pipeline run to start',
      });
    });

    it('stays pending until the cluster and repositories are ready', () => {
      const p = deriveProvisioning({ xr: xr(live.slice(0, 2).concat({ type: 'Ready', status: 'False' })) }, now);
      expect(p.steps[ONBOARDING].state).toBe('pend');
    });

    it('still prompts to merge when the PR lookup has not answered', () => {
      expect(deriveProvisioning(front, now).steps[ONBOARDING]).toMatchObject({
        state: 'run',
        detail: 'Merge the two onboarding PRs to start the first build',
      });
    });
  });

  describe('Infisical secrets', () => {
    it('runs until the SecretStore is ready, then links the project', () => {
      const waiting = deriveProvisioning({ xr: xr(live), secrets: { found: false, ready: false } }, now);
      expect(waiting.steps[SECRETS]).toMatchObject({
        state: 'run',
        detail: 'Waiting for the SecretStore to be created',
      });
      const creating = deriveProvisioning({ xr: xr(live), secrets: { found: true, ready: false } }, now);
      expect(creating.steps[SECRETS].detail).toBe('Creating the Infisical project and identity');
      const done = deriveProvisioning(
        { xr: xr(live), secrets: secretsReady, links: { infisicalProjectId: 'c6a39d3a' } },
        now,
      );
      expect(done.steps[SECRETS].state).toBe('done');
      expect(done.steps[SECRETS].seconds).toBe(61);
      expect(done.steps[SECRETS].links).toEqual([
        {
          label: 'Infisical project',
          url: 'http://infisical.dev.kiac.local/projects/secret-management/c6a39d3a/overview',
        },
      ]);
    });

    it('fails on a failed SecretStore sync and does not wait for one that never existed', () => {
      expect(
        deriveProvisioning(
          { xr: xr(live), secrets: { found: true, ready: false, failed: 'cannot create project' } },
          now,
        ).steps[SECRETS],
      ).toMatchObject({ state: 'fail', detail: 'cannot create project' });
      const old = deriveProvisioning(
        {
          xr: xr(live),
          secrets: { found: false, ready: false },
          rollout: { phase: 'Healthy', desired: 2, available: 2 },
        },
        now,
      );
      expect(old.steps[SECRETS].state).toBe('done');
      expect(old.complete).toBe(true);
    });

    it('has no link for a cluster whose Infisical host is not known', () => {
      expect(infisicalProjectUrl('kind-prod', 'x')).toBeUndefined();
    });
  });

  it('says why a built app has no rollout once the deploy grace has passed', () => {
    const build = {
      name: 'b1',
      phase: 'succeeded' as const,
      startedAt: now - 400000,
      completedAt: now - 10 * 60 * 1000,
      tasksDone: 6,
      tasksTotal: 6,
    };
    const p = deriveProvisioning({ xr: xr(live), build }, now);
    expect(p.steps[RUNNING].state).toBe('run');
    expect(p.steps[RUNNING].detail).toContain('platform/envs/dev.yaml');
    const fresh = deriveProvisioning({ xr: xr(live), build: { ...build, completedAt: now - 30000 } }, now);
    expect(fresh.steps[RUNNING].detail).toBeUndefined();
  });

  it('links the request PR and the repositories', () => {
    const p = deriveProvisioning(
      {
        xr: xr(live),
        links: {
          requestPr: { number: 16, url: 'https://github.com/o/tenants/pull/16', state: 'merged' },
          sourceRepoUrl: 'https://github.com/o/gate-api',
          gitopsRepoUrl: 'https://github.com/o/gitops-gate-api',
        },
      },
      now,
    );
    expect(p.steps[REQUEST].links).toEqual([
      { label: 'Request PR #16', url: 'https://github.com/o/tenants/pull/16', state: 'merged' },
    ]);
    expect(p.steps[REPOS].links?.map(l => l.label)).toEqual(['Source repo', 'GitOps repo']);
  });

  it('stops counting a built service that never got a rollout once it is hours old', () => {
    const build = {
      name: 'b1',
      phase: 'succeeded' as const,
      startedAt: now - 9000000,
      completedAt: now - 8900000,
      tasksDone: 6,
      tasksTotal: 6,
    };
    const old = { ...xr(live), createdAt: now - 5 * 3600 * 1000 };
    expect(deriveProvisioning({ xr: old, build }, now).stalled).toBe(true);
    // still new enough to be waiting on its first deploy
    expect(deriveProvisioning({ xr: { ...old, createdAt: now - 3600 * 1000 }, build }, now).stalled).toBe(false);
    // has a rollout, so it is deploying here
    expect(
      deriveProvisioning({ xr: old, build, rollout: { phase: 'Progressing', desired: 2, available: 0 } }, now).stalled,
    ).toBe(false);
    // a failed build is not stalled, it needs attention
    expect(deriveProvisioning({ xr: old, build: { ...build, phase: 'failed' } }, now).stalled).toBe(false);
  });
});
