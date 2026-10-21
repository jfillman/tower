import { currentStep, deriveEnvLifecycle, type EnvLifecycleInputs } from './lifecycle';

const base: EnvLifecycleInputs = { tier: 'flight', env: 'prod', appName: 'app', owner: 'o', declared: false };
const pr = (state: 'open' | 'merged' | 'closed', number = 7) => ({ number, url: `https://github.com/o/t/pull/${number}`, state });
const states = (i: Partial<EnvLifecycleInputs>) => deriveEnvLifecycle({ ...base, ...i }).map(s => `${s.id}:${s.state}`);

describe('Flight environment lifecycle', () => {
  it('starts with everything waiting except the pull request that is open', () => {
    expect(states({ cicdPrUrl: 'https://github.com/o/app/pull/1', requestPr: pr('open') })).toEqual([
      'cicd:run',
      'request:run',
      'applied:pend',
      'files:pend',
      'secrets:pend',
      'values:pend',
      'workload:pend',
    ]);
  });

  it('walks forward as things merge and are created', () => {
    expect(
      states({
        declared: true,
        requestPr: pr('merged'),
        xr: { found: true, synced: true, workloadDeployed: false, workloadReason: 'NoImageYet' },
        files: [
          { name: 'a', ready: true },
          { name: 'b', ready: true },
        ],
        secrets: { found: true, ready: true },
        valuesFileExists: true,
      }),
    ).toEqual(['cicd:done', 'request:done', 'applied:done', 'files:done', 'secrets:done', 'values:done', 'workload:pend']);
  });

  it('says how many files are written while some are not', () => {
    const files = deriveEnvLifecycle({ ...base, xr: { found: true, synced: true }, files: [{ name: 'a', ready: true }, { name: 'b', ready: false }] }).find(s => s.id === 'files')!;
    expect(files.state).toBe('run');
    expect(files.detail).toBe('1 of 2 written.');
  });

  it('counts the request as merged once its XR exists, even when the pull request was not found', () => {
    // boarding-api prod, 2026-10-19: the tenants repo lookup failed, so the step sat empty under a green "Applied".
    const s = deriveEnvLifecycle({ ...base, declared: true, xr: { found: true, synced: true }, tenantsRepoUrl: 'https://github.com/o/t' }).find(x => x.id === 'request')!;
    expect(s.state).toBe('done');
    expect(s.detail).toBeUndefined();
    expect(s.links).toEqual([{ label: 'Tenants repo', url: 'https://github.com/o/t' }]);
  });

  it('marks a remembered open request link merged once the XR exists', () => {
    const s = deriveEnvLifecycle({ ...base, requestPr: pr('open'), xr: { found: true, synced: false } }).find(x => x.id === 'request')!;
    expect(s.state).toBe('done');
    expect(s.links).toEqual([{ label: 'PR #7', url: 'https://github.com/o/t/pull/7', state: 'merged' }]);
  });

  it('says how the request gets opened while there is none', () => {
    const s = deriveEnvLifecycle(base).find(x => x.id === 'request')!;
    expect(s.state).toBe('pend');
    expect(s.desc).toBe('A pull request on the tenants repo that requests the environment.');
    expect(s.detail).toMatch(/^Not found yet/);
  });

  it('shows a closed request pull request as failed', () => {
    const s = deriveEnvLifecycle({ ...base, requestPr: pr('closed') }).find(x => x.id === 'request')!;
    expect(s.state).toBe('fail');
    expect(s.detail).toMatch(/closed without merging/);
  });

  it('shows a failed sync with Crossplane\'s message', () => {
    const s = deriveEnvLifecycle({ ...base, xr: { found: true, failed: 'cannot create RepositoryFile' } }).find(x => x.id === 'applied')!;
    expect(s.state).toBe('fail');
    expect(s.detail).toBe('cannot create RepositoryFile');
  });

  it('links the Infisical project only once the store is ready, and the first deploy waits for an image', () => {
    const pending = deriveEnvLifecycle({ ...base, secrets: { found: true, ready: false }, infisicalUrl: 'https://i/p' }).find(x => x.id === 'secrets')!;
    expect(pending.links).toBeUndefined();
    const ready = deriveEnvLifecycle({ ...base, secrets: { found: true, ready: true }, infisicalUrl: 'https://i/p' }).find(x => x.id === 'secrets')!;
    expect(ready.links).toEqual([{ label: 'Infisical project', url: 'https://i/p' }]);
    const first = deriveEnvLifecycle({ ...base, xr: { found: true, synced: true, workloadDeployed: false, workloadReason: 'NoImageYet' } }).find(x => x.id === 'workload')!;
    expect(first.detail).toMatch(/nothing has been released/);
  });

  it('counts a live environment as deployed even if the XR says nothing', () => {
    expect(states({ deployed: true }).pop()).toBe('workload:done');
  });
});

describe('Ground environment lifecycle', () => {
  const g = { tier: 'ground' as const, env: 'qa' };
  it('waits for cicd.yaml, then the onboarding pull request, then the file, then a deploy', () => {
    expect(states({ ...g, cicdPrUrl: 'https://github.com/o/app/pull/1' })).toEqual(['cicd:run', 'onboarding:pend', 'values:pend', 'workload:pend']);
    expect(states({ ...g, declared: true, onboardingPr: pr('open', 2) })).toEqual(['cicd:done', 'onboarding:run', 'values:pend', 'workload:pend']);
    expect(states({ ...g, declared: true, onboardingPr: pr('merged', 2), valuesFileExists: true, deployed: true })).toEqual([
      'cicd:done',
      'onboarding:done',
      'values:done',
      'workload:done',
    ]);
  });

  it('does not show the onboarding pull request as in progress before cicd.yaml has merged', () => {
    expect(states({ ...g, onboardingPr: pr('open', 2) })).toContain('onboarding:pend');
  });
});

describe('currentStep', () => {
  it('is the first step not done, and undefined when all are', () => {
    expect(currentStep(deriveEnvLifecycle({ ...base, declared: true }))?.id).toBe('request');
    const all = deriveEnvLifecycle({
      ...base,
      declared: true,
      requestPr: pr('merged'),
      xr: { found: true, synced: true, workloadDeployed: true },
      files: [{ name: 'a', ready: true }],
      secrets: { found: true, ready: true },
      valuesFileExists: true,
    });
    expect(currentStep(all)).toBeUndefined();
  });
});

describe('Ground environment lifecycle: what the last step waits for', () => {
  const g = { tier: 'ground' as const, env: 'test', declared: true };
  it('links the open onboarding pull request that creates the values file, and waits on it', () => {
    const steps = deriveEnvLifecycle({ ...base, ...g, onboardingPr: pr('open', 26), pipelineStep: true });
    expect(steps.map(s => `${s.id}:${s.state}`)).toEqual(['cicd:done', 'onboarding:run', 'values:pend', 'workload:pend']);
    expect(steps[1].links).toEqual([{ label: 'PR #26', url: 'https://github.com/o/t/pull/26', state: 'open' }]);
    expect(steps[1].detail).toBe('Waiting for the pull request to be merged.');
  });
  it('says nothing will deploy when no pipeline has a deploy step for it', () => {
    const steps = deriveEnvLifecycle({ ...base, ...g, onboardingPr: pr('merged', 26), valuesFileExists: true, pipelineStep: false });
    expect(steps.map(s => `${s.id}:${s.state}`)).toEqual(['cicd:done', 'onboarding:done', 'values:done', 'workload:pend']);
    expect(steps[3].detail).toMatch(/No pipeline has a deploy step for test/);
    expect(currentStep(steps)?.id).toBe('workload');
  });
  it('says what the deploy waits for when a pipeline does deploy there', () => {
    const steps = deriveEnvLifecycle({ ...base, ...g, onboardingPr: pr('merged', 26), valuesFileExists: true, pipelineStep: true });
    expect(steps[3].detail).toBe("Deploys on the pipeline's next run (a push to the default branch).");
    expect(deriveEnvLifecycle({ ...base, ...g, onboardingPr: pr('open', 26), pipelineStep: true })[3].detail).toMatch(/Starts with the image of the environment before it/);
    expect(deriveEnvLifecycle({ ...base, ...g, onboardingPr: pr('merged', 26), valuesFileExists: true, pipelineStep: true, deployed: true }).every(s => s.state === 'done')).toBe(true);
  });
});

describe('an InfraService Ground environment', () => {
  const infra: Partial<EnvLifecycleInputs> = { tier: 'ground', env: 'dev', appName: 'skyport-broker', declared: true, appType: 'infra' };
  it('has no onboarding pull request or pipeline step to wait for', () => {
    expect(states({ ...infra, valuesFileExists: true, deployed: true, pipelineStep: false })).toEqual(['cicd:done', 'values:done', 'workload:done']);
  });
  it('waits on Argo CD, not a pipeline, once its file exists', () => {
    const live = deriveEnvLifecycle({ ...base, ...infra, valuesFileExists: true, pipelineStep: false }).find(s => s.id === 'workload')!;
    expect(live.state).toBe('pend');
    expect(live.detail).toBe('Waiting for Argo CD app skyport-broker-dev and the component it declares to come up.');
  });
});
