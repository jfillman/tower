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
