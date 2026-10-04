import { buildCandidateValues, buildFormFromValues } from './GlidepathTab';

// The Glidepath tab replaces the whole `deploy` section on save. smoke-fn's real cicd.yaml lost
// deploy.target and deploy.lambda that way (commit "Glidepath: update smoke-fn/cicd.yaml"), which
// moved the function back to the Kubernetes target.
const original = {
  build: { agent: 'nodejs-22', platforms: ['arm64'] },
  deploy: {
    target: 'aws-lambda',
    lambda: { functionName: 'glidepath-smoke-fn', region: 'us-east-1' },
    lowerEnvironments: ['dev'],
    upperEnvironments: [],
    strategy: 'rollout',
    promotionOrder: ['dev'],
  },
};

describe('saving the Glidepath form', () => {
  it('keeps deploy.target and the per-target block when nothing about them was edited', () => {
    const form = buildFormFromValues(original);
    const out = buildCandidateValues(form, original).deploy as Record<string, unknown>;
    expect(out.target).toBe('aws-lambda');
    expect(out.lambda).toEqual({ functionName: 'glidepath-smoke-fn', region: 'us-east-1' });
  });

  it('still applies the fields the form owns', () => {
    const form = { ...buildFormFromValues(original), lowerEnvironments: 'dev, test', promotionOrder: 'dev, test' };
    const out = buildCandidateValues(form, original).deploy as Record<string, unknown>;
    expect(out.lowerEnvironments).toEqual(['dev', 'test']);
    expect(out.promotionOrder).toEqual(['dev', 'test']);
    expect(out.target).toBe('aws-lambda');
  });

  it('keeps ecs and azureContainerApps blocks too', () => {
    const o = { ...original, deploy: { ...original.deploy, target: 'aws-ecs', ecs: { cluster: 'c', service: 's' } } };
    const out = buildCandidateValues(buildFormFromValues(o), o).deploy as Record<string, unknown>;
    expect(out.ecs).toEqual({ cluster: 'c', service: 's' });
  });
});
