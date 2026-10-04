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
// Steps, in order: merge, request, cluster, cicd, repos, catalog, onboarding, secrets, build, running.
const [MERGE, REQUEST, CLUSTER, CICD, REPOS, CATALOG, ONBOARDING, SECRETS, BUILD, RUNNING] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
// 20 minutes after the onboarding PRs merged (mergedLinks): a build is expected, and may still be starting.
const soonAfterMerge = Date.parse('2026-09-30T15:30:00Z');
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
    expect(states(p)).toBe('done,done,run,pend,run,pend,pend,pend,pend,pend');
    expect(p.complete).toBe(false);
    expect(p.percent).toBeLessThan(10);
  });

  it('marks cluster and CI/CD onboarding done from their conditions, with durations', () => {
    const p = deriveProvisioning({ xr: xr(live.slice(0, 2).concat({ type: 'Ready', status: 'False' })) }, now);
    expect(states(p)).toBe('done,done,done,done,run,pend,pend,run,pend,pend');
    expect(p.steps[CLUSTER].state).toBe('done');
    expect(p.steps[CICD].seconds).toBe(26);
  });

  it('runs the build step with task progress and waits for it when no run exists', () => {
    const base = { xr: xr(live), links: mergedLinks, secrets: secretsReady };
    expect(deriveProvisioning(base, soonAfterMerge).steps[BUILD]).toMatchObject({
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
      const merged = deriveProvisioning({ ...front, links: mergedLinks }, soonAfterMerge);
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
    expect(p.steps[MERGE].links).toEqual([
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

describe('catalog step', () => {
  const base = (over: Partial<ProvisioningInputs>) =>
    deriveProvisioning({ xr: xr([live[0]]), ...over }, created + 30_000).steps[CATALOG];
  it('waits for the ingestor once the XR exists and the catalog has no Component yet', () => {
    const s = base({ catalog: { found: false } });
    expect(s.id).toBe('catalog');
    expect(s.state).toBe('run');
    expect(s.detail).toMatch(/ingestor/);
    expect(s.seconds).toBe(30);
  });
  it('is done once the Component is in the catalog', () => {
    expect(base({ catalog: { found: true } }).state).toBe('done');
  });
  it('stays pending while the lookup has not answered', () => {
    expect(base({}).state).toBe('pend');
  });
  it('does not hold the provision open on an unanswered lookup once a build has run', () => {
    const build = {
      name: 'ci-0-build-x',
      phase: 'succeeded' as const,
      tasksDone: 3,
      tasksTotal: 3,
      completedAt: created + 20_000,
    };
    expect(base({ build }).state).toBe('done');
  });
  it('is in the ETA, so a service missing from the catalog is not reported as nearly done', () => {
    const p = deriveProvisioning({ xr: xr(live), secrets: secretsReady, catalog: { found: false } }, now);
    expect(p.complete).toBe(false);
  });
});

describe('a request with no XR yet', () => {
  const prCreated = Date.parse('2026-10-03T22:59:00Z');
  const pendingXr = { ...xr([]), name: 'smoke-ecs', pending: true, createdAt: prCreated };
  const open = {
    requestPr: { number: 20, url: 'https://github.com/o/t/pull/20', state: 'open' as const },
  };
  const at = prCreated + 90_000;
  it('shows only the request step running, with everything after it waiting', () => {
    const p = deriveProvisioning({ xr: pendingXr, links: open }, at);
    expect(states(p)).toBe('run,pend,pend,pend,pend,pend,pend,pend,pend,pend');
    expect(p.complete).toBe(false);
    expect(p.failed).toBe(false);
  });
  it('tells the person to merge the request PR, with a link and the time since it was opened', () => {
    const s = deriveProvisioning({ xr: pendingXr, links: open }, at).steps[MERGE];
    expect(s.detail).toMatch(/Merge the request PR/);
    expect(s.seconds).toBe(90);
    expect(s.links?.[0]).toMatchObject({ label: 'Request PR #20', state: 'open' });
  });
  it('says it is waiting for ArgoCD once the request merged', () => {
    const merged = { requestPr: { ...open.requestPr, state: 'merged' as const } };
    expect(deriveProvisioning({ xr: pendingXr, links: merged }, at).steps[REQUEST].detail).toMatch(/ArgoCD/);
  });
  it('does not show a cluster or repositories step as running before the XR exists', () => {
    const p = deriveProvisioning({ xr: pendingXr, links: open }, at);
    expect(p.steps[CLUSTER].state).toBe('pend');
    expect(p.steps[REPOS].state).toBe('pend');
    expect(p.steps[CLUSTER].seconds).toBeUndefined();
  });
  it('goes back to the normal sequence once the XR exists', () => {
    const p = deriveProvisioning({ xr: xr([live[0]]), links: open }, now);
    expect(p.steps[MERGE].state).toBe('done');
    expect(p.steps[REQUEST].state).toBe('done');
    expect(p.steps[CLUSTER].state).toBe('done');
  });
  it('splits the wait into the person merging and ArgoCD applying, with real durations once the XR exists', () => {
    const prOpened = Date.parse('2026-09-30T14:00:00Z');
    const prMerged = Date.parse('2026-09-30T14:03:00Z');
    const x = { ...xr([live[0]]), createdAt: Date.parse('2026-09-30T14:07:30Z') };
    const p = deriveProvisioning(
      { xr: x, links: { requestPr: { number: 9, url: 'u', state: 'merged', createdAt: prOpened, mergedAt: prMerged } } },
      now,
    );
    expect(p.steps[MERGE].seconds).toBe(180);
    expect(p.steps[REQUEST].seconds).toBe(270);
  });
  it('shows no duration rather than zero when the PR times were never seen', () => {
    const p = deriveProvisioning({ xr: xr([live[0]]) }, now);
    expect(p.steps[MERGE].seconds).toBeUndefined();
    expect(p.steps[REQUEST].seconds).toBeUndefined();
  });
  it('waits on ArgoCD, not a person, once the request merged', () => {
    const merged = { requestPr: { ...open.requestPr, state: 'merged' as const, mergedAt: prCreated + 60_000 } };
    const p = deriveProvisioning({ xr: pendingXr, links: merged }, at);
    expect(p.steps[MERGE].state).toBe('done');
    expect(p.steps[REQUEST].state).toBe('run');
    expect(p.steps[REQUEST].seconds).toBe(30);
  });
});

describe('function XRs (Lambda, Azure Functions): no GitOps repo, no Rollout', () => {
  const fnXr = (kind = 'LambdaFunction') => ({ ...xr(live), kind, name: 'resize-fn' });
  const sourceMerged = {
    onboarding: {
      source: {
        number: 1,
        url: 'https://github.com/o/resize-fn/pull/1',
        state: 'merged' as const,
        mergedAt: Date.parse('2026-09-30T15:10:00Z'),
      },
    },
  };
  const sourceOpen = { onboarding: { source: { number: 1, url: 'u', state: 'open' as const } } };
  const build = (phase: 'succeeded' | 'failed' | 'running') => ({
    name: 'ci-0-build-x',
    phase,
    tasksDone: 3,
    tasksTotal: 3,
    startedAt: Date.parse('2026-09-30T15:11:00Z'),
    completedAt: Date.parse('2026-09-30T15:14:00Z'),
  });
  const deployed = {
    state: 'succeeded' as const,
    label: 'AWS Lambda',
    resource: 'Lambda function resize-fn',
    completedAt: Date.parse('2026-09-30T15:16:00Z'),
    consoleUrl: 'https://us-east-1.console.aws.amazon.com/lambda/home?region=us-east-1#/functions/resize-fn',
  };

  it('waits for ONE onboarding PR, not two, and says so', () => {
    const p = deriveProvisioning({ xr: fnXr(), links: sourceOpen }, now);
    const s = p.steps[ONBOARDING];
    expect(s.title).toBe('Application onboarding PR');
    expect(s.state).toBe('run');
    expect(s.detail).toBe('Merge the onboarding PR to start the first build');
    expect(s.links?.map(l => l.label)).toEqual(['Source PR #1']);
  });

  it('is done as soon as that one PR merges (an app would still wait for a second)', () => {
    expect(deriveProvisioning({ xr: fnXr(), links: sourceMerged }, now).steps[ONBOARDING].state).toBe('done');
    const app = deriveProvisioning({ xr: xr(live), links: sourceMerged }, now);
    expect(app.steps[ONBOARDING].state).toBe('run');
  });

  it('describes the repos step without a GitOps repo', () => {
    expect(deriveProvisioning({ xr: fnXr() }, now).steps[REPOS].desc).toBe(
      'Source repo created, starter files committed',
    );
  });

  it('the last step is the cloud deploy, never a Rollout', () => {
    const p = deriveProvisioning({ xr: fnXr(), links: sourceMerged, build: build('succeeded') }, now);
    const last = p.steps[RUNNING];
    expect(last.title).toBe('Deployed to the cloud target');
    expect(last.state).toBe('run');
    expect(last.detail).toBe('Waiting for the deploy stage to start');
    expect(last.detail).not.toMatch(/rollout|platform\/envs/i);
  });

  it('names the target once the deploy has resolved it, and links the console when done', () => {
    const p = deriveProvisioning(
      {
        xr: fnXr(),
        links: sourceMerged,
        build: build('succeeded'),
        secrets: secretsReady,
        catalog: { found: true },
        cloudDeploy: deployed,
      },
      now,
    );
    const last = p.steps[RUNNING];
    expect(last.title).toBe('Deployed to AWS Lambda');
    expect(last.state).toBe('done');
    expect(last.links).toEqual([{ label: 'Open in console', url: deployed.consoleUrl }]);
    expect(p.complete).toBe(true);
  });

  it('a deploy in progress is the running step', () => {
    const p = deriveProvisioning(
      {
        xr: fnXr(),
        links: sourceMerged,
        build: build('succeeded'),
        cloudDeploy: { ...deployed, state: 'running', completedAt: undefined },
      },
      now,
    );
    expect(p.steps[RUNNING].state).toBe('run');
  });

  it('a failed deploy fails the provision and says why', () => {
    const p = deriveProvisioning(
      {
        xr: fnXr(),
        links: sourceMerged,
        build: build('succeeded'),
        cloudDeploy: { ...deployed, state: 'failed', failure: 'deploy-aws-lambda: step-prepare exited with code 1' },
      },
      now,
    );
    expect(p.steps[RUNNING].state).toBe('fail');
    expect(p.steps[RUNNING].detail).toBe('deploy-aws-lambda: step-prepare exited with code 1');
    expect(p.failed).toBe(true);
  });

  it('works the same for an Azure function', () => {
    const p = deriveProvisioning({ xr: fnXr('AzureFunction'), links: sourceMerged }, now);
    expect(p.steps[ONBOARDING].title).toBe('Application onboarding PR');
  });

  it('a succeeded cloud deploy keeps it from counting as stalled', () => {
    const later = created + 6 * 3600 * 1000;
    const base = { xr: fnXr(), links: sourceMerged, build: build('succeeded') };
    expect(deriveProvisioning(base, later).stalled).toBe(true);
    expect(deriveProvisioning({ ...base, cloudDeploy: deployed }, later).stalled).toBe(false);
  });
});

describe('an app (not a function) that deploys to a cloud target', () => {
  it('ends on the cloud deploy instead of waiting forever for a Rollout that will never exist', () => {
    const cloudDeploy = {
      state: 'succeeded' as const,
      label: 'AWS ECS',
      completedAt: Date.parse('2026-09-30T15:16:00Z'),
    };
    const p = deriveProvisioning(
      { xr: xr(live), cloudDeploy, build: { name: 'b', phase: 'succeeded', tasksDone: 1, tasksTotal: 1 } },
      now,
    );
    expect(p.steps[RUNNING].title).toBe('Deployed to AWS ECS');
    expect(p.steps[RUNNING].state).toBe('done');
  });
  it('an ordinary Kubernetes app is unchanged', () => {
    const p = deriveProvisioning({ xr: xr(live) }, now);
    expect(p.steps[RUNNING].title).toBe('Running healthy in dev');
    expect(p.steps[ONBOARDING].title).toBe('Application onboarding PRs');
  });
});

describe('CI/CD step waits for its ArgoCD app', () => {
  const base = xr(live.slice(0, 2).concat({ type: 'Ready', status: 'False' }));
  const run = (cicdApp?: { name: string; sync?: string; health?: string }) =>
    deriveProvisioning({ xr: base, cicdApp }, now);

  it('is done on the condition alone when ArgoCD cannot be read', () => {
    expect(run().steps[CICD].state).toBe('done');
  });
  it('keeps running while the app is not yet Synced and Healthy', () => {
    const p = run({ name: 'gate-api-cicd', sync: 'OutOfSync', health: 'Progressing' });
    expect(p.steps[CICD].state).toBe('run');
    expect(p.steps[CICD].detail).toContain('gate-api-cicd is OutOfSync / Progressing');
  });
  it('runs when the app does not exist yet', () => {
    expect(run({ name: 'gate-api-cicd' }).steps[CICD].state).toBe('run');
  });
  it('says a Degraded app needs a look', () => {
    const p = run({ name: 'gate-api-cicd', sync: 'Synced', health: 'Degraded' });
    expect(p.steps[CICD].state).toBe('run');
    expect(p.steps[CICD].detail).toContain('sync hook failed');
  });
  it('is done once Synced and Healthy', () => {
    expect(run({ name: 'gate-api-cicd', sync: 'Synced', health: 'Healthy' }).steps[CICD].state).toBe('done');
  });
});

describe('step times and measured typical durations', () => {
  it('gives the steps absolute start and end times where the cluster has them', () => {
    const p = deriveProvisioning({ xr: xr(live.slice(0, 2).concat({ type: 'Ready', status: 'False' })) }, now);
    expect(p.steps[CLUSTER]).toMatchObject({ startedAt: created, endedAt: Date.parse('2026-09-30T15:01:33Z') });
    expect(p.steps[CICD].endedAt).toBe(Date.parse('2026-09-30T15:01:59Z'));
  });
  it('uses the time Tower watched a step finish only if it saw the step running first', () => {
    const base = { xr: xr(live), catalog: { found: true } };
    const watched = deriveProvisioning(
      { ...base, observed: { catalog: { sawRunning: true, startedAt: now - 90_000, endedAt: now - 30_000 } } },
      now,
    );
    // The step runs from the XR's creation to the moment Tower saw it finish.
    expect(watched.steps[CATALOG].seconds).toBe(Math.round((now - 30_000 - created) / 1000));
    const notWatched = deriveProvisioning({ ...base, observed: { catalog: { endedAt: now - 30_000 } } }, now);
    expect(notWatched.steps[CATALOG].seconds).toBeUndefined();
  });
  it('replaces the built-in typical duration with a measured one, and the ETA follows', () => {
    const base = { xr: xr([]) };
    const est = deriveProvisioning(base, now);
    const measured = deriveProvisioning(base, now, { build: 1000 });
    expect(est.steps[BUILD].typicalSec).toBe(150);
    expect(measured.steps[BUILD].typicalSec).toBe(1000);
    expect(measured.etaSec).toBeGreaterThan(est.etaSec);
    expect(measured.steps[CLUSTER].typicalSec).toBe(est.steps[CLUSTER].typicalSec); // untouched steps keep theirs
  });
});

describe('a service whose build left no trace in the cluster', () => {
  // smoke-fn: the XR is Ready and both PRs merged long ago, but its PipelineRuns were cleaned up and a
  // function has no Rollout, so nothing shows that a build ever ran.
  const base = { xr: xr(live), links: mergedLinks, secrets: secretsReady, catalog: { found: true } };

  it('is waiting, and in flight, shortly after the onboarding PRs merged', () => {
    const p = deriveProvisioning(base, soonAfterMerge);
    expect(p.steps[BUILD]).toMatchObject({ state: 'run', detail: 'Waiting for the first pipeline run to start' });
    expect(p.stalled).toBe(false);
  });

  it('is stalled, not forever in flight, once hours have passed with no build in sight', () => {
    const p = deriveProvisioning(base, now); // ten hours after the merge
    expect(p.stalled).toBe(true);
    expect(p.complete).toBe(false);
    expect(p.steps[BUILD].state).toBe('run'); // Tower still does not claim it finished
    expect(p.steps[BUILD].detail).toMatch(/No pipeline run for this service is left in the cluster/);
    expect(p.steps[BUILD].detail).toMatch(/may have finished/);
  });

  it('turns stalled two hours after the merge, not before', () => {
    const merge = Date.parse('2026-09-30T15:10:20Z');
    expect(deriveProvisioning(base, merge + 119 * 60_000).stalled).toBe(false);
    expect(deriveProvisioning(base, merge + 121 * 60_000).stalled).toBe(true);
  });

  it('is not stalled when a cloud deploy shows it ran', () => {
    const cloud = { label: 'AWS Lambda', state: 'running' as const };
    expect(deriveProvisioning({ ...base, cloudDeploy: cloud }, now).stalled).toBe(false);
  });

  it('is not stalled when a rollout proves the build happened', () => {
    const p = deriveProvisioning({ ...base, rollout: { phase: 'Progressing', desired: 2, available: 1 } }, now);
    expect(p.stalled).toBe(false);
    expect(p.steps[BUILD].state).toBe('done');
  });

  it('is not stalled while the onboarding PRs are still open: that is waiting on a person, not a lost build', () => {
    const p = deriveProvisioning({ ...base, links: { onboarding: { source: { number: 1, url: 'u', state: 'open' }, gitops: { number: 1, url: 'u', state: 'open' } } } }, now);
    expect(p.stalled).toBe(false);
    expect(p.steps[ONBOARDING].state).toBe('run');
  });
});

