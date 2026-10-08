import { buildCandidateValues, buildFormFromValues } from './GlidepathTab';

// The Glidepath tab writes the whole `deploy` section on save. smoke-fn's real cicd.yaml lost
// deploy.target and deploy.lambda that way (commit "Glidepath: update smoke-fn/cicd.yaml"), which
// moved the function back to the Kubernetes target. The environment list (deploy.environments) is the
// Environments tab's: this form writes only the strategy and keeps everything else.
const original = {
  build: { agent: 'nodejs-22', platforms: ['arm64'] },
  deploy: {
    target: 'aws-lambda',
    lambda: { functionName: 'glidepath-smoke-fn', region: 'us-east-1' },
    environments: [
      { name: 'dev', tier: 'ground' },
      { name: 'staging', tier: 'flight', cluster: 'kind-prod' },
    ],
    chart: { targetRevision: 'v1' },
    strategy: 'rollout',
  },
};

describe('saving the Glidepath form', () => {
  it('writes back exactly what was there', () => {
    const out = buildCandidateValues(buildFormFromValues(original), original).deploy as Record<string, unknown>;
    expect(out).toEqual(original.deploy);
  });

  it('keeps ecs and azureContainerApps blocks too', () => {
    const o = { ...original, deploy: { ...original.deploy, target: 'aws-ecs', ecs: { cluster: 'c', service: 's' } } };
    const out = buildCandidateValues(buildFormFromValues(o), o).deploy as Record<string, unknown>;
    expect(out.ecs).toEqual({ cluster: 'c', service: 's' });
  });

  it('never writes the removed environment fields (refused by the schema since 2026-10-07)', () => {
    const bare = { build: { agent: 'nodejs-22' }, deploy: { strategy: 'rollout' } };
    const out = buildCandidateValues(buildFormFromValues(bare), bare).deploy as Record<string, unknown>;
    for (const k of ['lowerEnvironments', 'upperEnvironments', 'promotionOrder']) expect(k in out).toBe(false);
  });
});
