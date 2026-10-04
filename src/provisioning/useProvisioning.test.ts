import {
  parseTenantsRepo,
  pickFirstBuild,
  toCreated,
  toManaged,
  toArgoSnapshot,
  toCloudDeploySnapshot,
  toOnboardingPrs,
  toPendingInputs,
  toRepoLinks,
  toSecrets,
} from './useProvisioning';
import fixture from '../__fixtures__/cloudDeployRuns.json';

const mr = (name: string, status: 'True' | 'False' | null, at = '2026-09-30T14:12:35Z') => ({
  metadata: { name },
  status: status ? { conditions: [{ type: 'Ready', status, lastTransitionTime: at }] } : undefined,
});

describe('toManaged', () => {
  it('counts a ref that has no object yet as not ready', () => {
    const out = toManaged(
      [
        { kind: 'Repository', name: 'a-src' },
        { kind: 'RepositoryFile', name: 'a-readme' },
        { kind: 'TektonCICD', name: 'a-tektoncicd' },
      ],
      [mr('a-src', 'True')],
    );
    expect(out).toEqual([
      { name: 'a-src', ready: true, readyAt: Date.parse('2026-09-30T14:12:35Z') },
      { name: 'a-readme', ready: false, readyAt: undefined },
    ]);
  });

  it('falls back to what was listed when the XR has no resourceRefs', () => {
    expect(toManaged(undefined, [mr('a-src', 'False')])).toEqual([
      { name: 'a-src', ready: false, readyAt: Date.parse('2026-09-30T14:12:35Z') },
    ]);
  });

  it('is undefined when nothing could be read, so the caller infers from the XR', () => {
    expect(toManaged([{ kind: 'Repository', name: 'a-src' }], [])).toBeUndefined();
    expect(toManaged(undefined, [])).toBeUndefined();
  });
});

// The annotation exactly as written on the live sky-marshall XR.
const SOURCE_INFO =
  '{"pushToGit":true,"gitBranch":"main","gitRepo":"github.com?owner=jfillman\\u0026repo=gitops-cluster-dev-tenants","gitLayout":"custom","basePath":""}';

describe('parseTenantsRepo', () => {
  it('reads the owner and repo off the XR source-info annotation', () => {
    expect(parseTenantsRepo(SOURCE_INFO)).toEqual({ owner: 'jfillman', repo: 'gitops-cluster-dev-tenants' });
  });
  it('is undefined for a missing or malformed annotation', () => {
    expect(parseTenantsRepo(undefined)).toBeUndefined();
    expect(parseTenantsRepo('not json')).toBeUndefined();
    expect(parseTenantsRepo('{"gitRepo":"github.com"}')).toBeUndefined();
  });
});

describe('toRepoLinks', () => {
  const repo = (name: string, fullName: string) => ({
    metadata: { name },
    status: { atProvider: { fullName, htmlUrl: `https://github.com/${fullName}` } },
  });
  it('tells the source and GitOps repos apart by the composed resource name', () => {
    expect(
      toRepoLinks('sky-marshall', [
        repo('sky-marshall-src', 'jfillman/sky-marshall'),
        repo('sky-marshall-gitops', 'jfillman/gitops-sky-marshall'),
      ]),
    ).toEqual({
      owner: 'jfillman',
      sourceRepoUrl: 'https://github.com/jfillman/sky-marshall',
      gitopsRepoUrl: 'https://github.com/jfillman/gitops-sky-marshall',
    });
  });
  it('is empty when the repositories could not be read', () => {
    expect(toRepoLinks('x', [])).toEqual({ owner: undefined, sourceRepoUrl: undefined, gitopsRepoUrl: undefined });
  });
});

describe('toSecrets', () => {
  const store = (conditions: { type: string; status: string; message?: string; lastTransitionTime?: string }[]) =>
    ({ metadata: { name: 's', namespace: 'n', creationTimestamp: '' }, status: { conditions } }) as never;
  it('is ready from the Ready condition, with its time', () => {
    expect(
      toSecrets(store([{ type: 'Ready', status: 'True', lastTransitionTime: '2026-10-01T17:50:38Z' }]), true),
    ).toEqual({
      found: true,
      ready: true,
      readyAt: Date.parse('2026-10-01T17:50:38Z'),
      failed: undefined,
    });
  });
  it('reports a failed sync', () => {
    expect(toSecrets(store([{ type: 'Synced', status: 'False', message: 'boom' }]), true)?.failed).toBe('boom');
  });
  it('distinguishes "no SecretStore" from "could not read the list"', () => {
    expect(toSecrets(undefined, true)).toEqual({ found: false, ready: false });
    expect(toSecrets(undefined, false)).toBeUndefined();
  });
});

describe('toOnboardingPrs', () => {
  const pr = (
    repo: 'source' | 'gitops',
    number: number,
    title: string,
    state: 'open' | 'merged',
    mergedAt?: string,
  ) => ({
    repo,
    number,
    title,
    url: `https://github.com/o/${repo}/pull/${number}`,
    state,
    mergedAt,
  });
  // The real sky-marshall history: onboarding PR #1 merged, a later resync PR #3 merged, plus a human PR.
  const prs = [
    pr('source', 4, 'Remove hand-copied dev.release.yaml', 'open'),
    pr('source', 3, 'Onboarding: re-sync .tekton boilerplate', 'merged', '2026-10-01T21:58:55Z'),
    pr('source', 1, 'Onboarding: re-sync .tekton boilerplate', 'merged', '2026-10-01T17:56:47Z'),
    pr('gitops', 1, 'Onboarding: re-sync governance-check boilerplate', 'merged', '2026-10-01T17:57:04Z'),
  ];
  it('picks the first merged onboarding PR per repo and ignores other PRs', () => {
    const out = toOnboardingPrs(prs);
    expect(out.source).toMatchObject({ number: 1, state: 'merged', mergedAt: Date.parse('2026-10-01T17:56:47Z') });
    expect(out.gitops).toMatchObject({ number: 1, state: 'merged' });
  });
  it('falls back to an open onboarding PR, and to nothing', () => {
    expect(toOnboardingPrs([pr('source', 2, 'Onboarding: re-sync .tekton boilerplate', 'open')]).source?.state).toBe(
      'open',
    );
    expect(toOnboardingPrs([pr('source', 4, 'Something else', 'open')])).toEqual({
      source: undefined,
      gitops: undefined,
    });
  });
});

describe('toCreated', () => {
  it('lists every ref with readiness where readable, and appends the SecretStore', () => {
    const out = toCreated(
      [
        { kind: 'TektonCICD', name: 'a-tektoncicd' },
        { kind: 'Repository', name: 'a-src' },
        { kind: 'RepositoryFile', name: 'a-readme' },
        { kind: 'Mystery', name: 'a-other' },
      ],
      [mr('a-tektoncicd', 'True'), mr('a-src', 'True'), mr('a-readme', 'False')],
      { name: 'a-kind-dev', ready: true },
    );
    expect(out).toEqual([
      { kind: 'TektonCICD', name: 'a-tektoncicd', ready: true },
      { kind: 'Repository', name: 'a-src', ready: true },
      { kind: 'RepositoryFile', name: 'a-readme', ready: false },
      { kind: 'Mystery', name: 'a-other', ready: undefined },
      { kind: 'SecretStore', name: 'a-kind-dev', ready: true },
    ]);
  });
  it('is empty with no refs and no store', () => {
    expect(toCreated(undefined, [])).toEqual([]);
  });
});

describe('pickFirstBuild', () => {
  const run = (name: string, pipeline: string, at: string) => ({
    metadata: { name, creationTimestamp: at, labels: { 'tekton.dev/pipeline': pipeline } },
  });
  // The three runs smoke-ecs had, with their real pipeline labels and times.
  const smokeEcs = [
    run('onboarding-resync-bootstrap-tkqp8', 'onboarding-resync', '2026-10-03T23:03:47Z'),
    run('values-49l5g', 'values-check', '2026-10-03T23:04:27Z'),
    run('ci-0-build-7wp2b', 'build', '2026-10-03T23:05:35Z'),
  ];
  it('skips Glidepath onboarding and values-check runs, which finish before any build', () => {
    expect(pickFirstBuild(smokeEcs)?.metadata.name).toBe('ci-0-build-7wp2b');
  });
  it('is undefined while only those runs exist, so the build step stays pending', () => {
    expect(pickFirstBuild(smokeEcs.slice(0, 2))).toBeUndefined();
  });
  it('picks the earliest build when several exist', () => {
    const more = [...smokeEcs, run('ci-0-build-later', 'build', '2026-10-03T23:30:00Z')];
    expect(pickFirstBuild(more)?.metadata.name).toBe('ci-0-build-7wp2b');
  });
  it('tolerates a missing list and runs with no labels', () => {
    expect(pickFirstBuild(undefined)).toBeUndefined();
    expect(pickFirstBuild([{ metadata: { name: 'x', creationTimestamp: '2026-10-03T23:00:00Z' } }])).toBeUndefined();
  });
});

describe('toPendingInputs', () => {
  const now = Date.parse('2026-10-03T23:30:00Z');
  const req = (over: Record<string, unknown> = {}) => ({
    kind: 'GoApplication',
    name: 'smoke-ecs',
    number: 20,
    url: 'https://github.com/jfillman/gitops-cluster-dev-tenants/pull/20',
    state: 'open' as const,
    createdAt: '2026-10-03T22:59:00Z',
    ...over,
  });
  it('turns an open request into a pending provisioning input timed from the PR', () => {
    const [i] = toPendingInputs([req()], new Set(), 'kind-dev', now);
    expect(i.xr).toMatchObject({ name: 'smoke-ecs', kind: 'GoApplication', pending: true, conditions: [] });
    expect(i.xr.createdAt).toBe(Date.parse('2026-10-03T22:59:00Z'));
    expect(i.links?.requestPr).toMatchObject({ number: 20, state: 'open' });
  });
  it('carries the merge time of a merged request', () => {
    const [i] = toPendingInputs(
      [req({ state: 'merged', mergedAt: '2026-10-03T23:20:00Z' })],
      new Set(),
      'kind-dev',
      now,
    );
    expect(i.links?.requestPr?.mergedAt).toBe(Date.parse('2026-10-03T23:20:00Z'));
  });
  it('drops a request once its XR exists, so the XR item takes over', () => {
    expect(toPendingInputs([req()], new Set(['smoke-ecs']), 'kind-dev', now)).toEqual([]);
  });
  it('drops kinds Tower does not provision and abandoned old PRs', () => {
    expect(toPendingInputs([req({ kind: 'ApplicationEnvironment' })], new Set(), 'kind-dev', now)).toEqual([]);
    expect(toPendingInputs([req({ createdAt: '2026-09-01T00:00:00Z' })], new Set(), 'kind-dev', now)).toEqual([]);
  });
});

describe('toCloudDeploySnapshot over the real ECS deploy captured from kiac-dev', () => {
  const real = (fixture as any)['ci-1-deploy-swift-bear-772974f5'];
  const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
  const snap = (edit?: (pr: any, trs: any[]) => void) => {
    const pr = clone(real.pipelineRun);
    const trs = clone(real.taskRuns);
    edit?.(pr, trs);
    return toCloudDeploySnapshot([pr], trs);
  };
  const task = (trs: any[], n: string) => trs.find(t => t.metadata.labels['tekton.dev/pipelineTask'] === n);

  it('a succeeded deploy: target, resource and a console link', () => {
    expect(snap()).toEqual({
      state: 'succeeded',
      label: 'AWS ECS',
      resource: 'ECS service glidepath-smoke',
      completedAt: expect.any(Number),
      failure: undefined,
      consoleUrl: expect.stringContaining('console.aws.amazon.com/ecs'),
    });
  });
  it('a failed deploy carries the task and what Tekton said', () => {
    const s = snap((pr, trs) => {
      pr.status.conditions = [{ type: 'Succeeded', status: 'False', reason: 'Failed' }];
      task(trs, 'deploy-aws-ecs').status.conditions = [
        { type: 'Succeeded', status: 'False', reason: 'Failed', message: 'step-update-service exited with code 252' },
      ];
    })!;
    expect(s.state).toBe('failed');
    expect(s.failure).toBe('deploy-aws-ecs: step-update-service exited with code 252');
  });
  it('a deploy still running is running, with no completion time', () => {
    const s = snap(pr => {
      pr.status.conditions = [{ type: 'Succeeded', status: 'Unknown', reason: 'Running' }];
      delete pr.status.completionTime;
    })!;
    expect(s.state).toBe('running');
    expect(s.completedAt).toBeUndefined();
  });
  it('is undefined for a Kubernetes deploy, and for no runs at all', () => {
    expect(
      snap((_pr, trs) => {
        task(trs, 'resolve-deploy-target').status.results.find((r: any) => r.name === 'target').value = 'k8s-rollout';
      }),
    ).toBeUndefined();
    expect(toCloudDeploySnapshot([], [])).toBeUndefined();
    expect(toCloudDeploySnapshot(undefined, undefined)).toBeUndefined();
  });
});

describe('toPendingInputs for function kinds', () => {
  it('lists a requested Lambda or Azure function before its XR exists', () => {
    const mk = (kind: string) => ({
      kind,
      name: 'resize-fn',
      number: 21,
      url: 'u',
      state: 'open' as const,
      createdAt: '2026-10-03T22:59:00Z',
    });
    const now = Date.parse('2026-10-03T23:30:00Z');
    expect(toPendingInputs([mk('LambdaFunction')], new Set(), 'kind-dev', now)).toHaveLength(1);
    expect(toPendingInputs([mk('AzureFunction')], new Set(), 'kind-dev', now)[0].xr.kind).toBe('AzureFunction');
  });
});

describe('toArgoSnapshot', () => {
  it('reads sync and health from a real Application status', () => {
    expect(toArgoSnapshot('a-cicd', { status: { sync: { status: 'Synced' }, health: { status: 'Healthy' } } })).toEqual({
      name: 'a-cicd',
      sync: 'Synced',
      health: 'Healthy',
    });
  });
  it('an Application that does not exist yet has no sync or health', () => {
    expect(toArgoSnapshot('a-cicd', undefined)).toEqual({ name: 'a-cicd', sync: undefined, health: undefined });
  });
});
