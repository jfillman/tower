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

// A file that declares deploy.environments (ADR-0019) must never get lowerEnvironments,
// upperEnvironments or promotionOrder written next to it: the schema refuses both together.
describe('saving the Glidepath form for an app that uses deploy.environments', () => {
  const withEnvironments = {
    build: { agent: 'nodejs-22' },
    deploy: {
      target: 'aws-lambda',
      lambda: { functionName: 'fn', region: 'us-east-1' },
      environments: [
        { name: 'dev', tier: 'ground' },
        { name: 'staging', tier: 'flight', cluster: 'kind-prod' },
      ],
      strategy: 'rollout',
    },
  };

  it('knows the file uses deploy.environments', () => {
    expect(buildFormFromValues(withEnvironments).usesEnvironments).toBe(true);
    expect(buildFormFromValues(original).usesEnvironments).toBe(false);
  });

  it('writes back exactly what was there: no old fields appear, and nothing is dirty', () => {
    const out = buildCandidateValues(buildFormFromValues(withEnvironments), withEnvironments).deploy as Record<
      string,
      unknown
    >;
    expect(out).toEqual(withEnvironments.deploy);
    expect('lowerEnvironments' in out).toBe(false);
    expect('upperEnvironments' in out).toBe(false);
    expect('promotionOrder' in out).toBe(false);
  });

  it('keeps writing the old fields for an app that has not moved to the new shape', () => {
    const out = buildCandidateValues(buildFormFromValues(original), original).deploy as Record<string, unknown>;
    expect(out.lowerEnvironments).toEqual(['dev']);
    expect(out.promotionOrder).toEqual(['dev']);
    expect('environments' in out).toBe(false);
  });
});
