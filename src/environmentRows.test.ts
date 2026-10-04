import { buildEnvironmentRows } from './environmentRows';
import type { EnvironmentSummary } from './types';

const env = (over: Partial<EnvironmentSummary> & { env: string }): EnvironmentSummary => ({
  key: over.env,
  cluster: 'kind-dev',
  namespace: `app-x-${over.env}`,
  drift: false,
  pods: [],
  services: [],
  resources: [],
  ...over,
});

const order = { lower: ['dev', 'test'], upper: ['staging', 'prod'] };

describe('buildEnvironmentRows', () => {
  it('keeps the given (promotion) order and classes each environment by the app\'s own cicd.yaml', () => {
    const rows = buildEnvironmentRows(
      [env({ env: 'dev' }), env({ env: 'test' }), env({ env: 'staging', cluster: 'kind-prod' }), env({ env: 'prod', cluster: 'kind-prod' })],
      order,
    );
    expect(rows.map(r => `${r.name}:${r.tier}`)).toEqual(['dev:ground', 'test:ground', 'staging:flight', 'prod:flight']);
    expect(rows[2].where).toBe('kind-prod');
    expect(rows[2].target).toBe('Kubernetes');
  });

  it('shows an environment that is declared but has nothing deployed as not deployed, not as healthy', () => {
    const [row] = buildEnvironmentRows([env({ env: 'qa', deployed: false })], order);
    expect(row.deployed).toBe(false);
    expect(row.image).toBeUndefined();
    expect(row.health).toBe('unknown');
  });

  it('reports the live image tag and when it was deployed', () => {
    const [row] = buildEnvironmentRows(
      [env({ env: 'dev', image: 'ghcr.io/o/x:0.1.0-39c3455', deployedAt: '2026-10-05T10:00:00Z', deployed: true })],
      order,
    );
    expect(row.deployed).toBe(true);
    expect(row.image).toBe('0.1.0-39c3455');
    expect(row.deployedAt).toBe('2026-10-05T10:00:00Z');
  });

  it('describes a cloud environment by its target and resource, with health from its last deploy', () => {
    const [row] = buildEnvironmentRows(
      [
        env({
          env: 'dev',
          cluster: 'AWS Lambda',
          image: 'ghcr.io/o/fn:0.0.0-abc',
          deployed: true,
          cloud: {
            target: 'aws-lambda',
            targetLabel: 'AWS Lambda',
            resource: { kind: 'Lambda function', name: 'glidepath-smoke-fn', region: 'us-east-1' },
            latest: 'failed',
          },
        }),
      ],
      order,
    );
    expect(row.target).toBe('AWS Lambda');
    expect(row.where).toBe('glidepath-smoke-fn · us-east-1');
    expect(row.health).toBe('degraded');
  });

  it('leaves preview environments out: they are not part of the promotion order', () => {
    expect(buildEnvironmentRows([env({ env: 'pr-42' }), env({ env: 'dev' })], order).map(r => r.name)).toEqual(['dev']);
  });

  it('treats everything as ground while the pipeline order has not loaded', () => {
    expect(buildEnvironmentRows([env({ env: 'prod' })], undefined)[0].tier).toBe('ground');
  });
});

import { envListsOf } from './environmentRows';

describe('envListsOf', () => {
  it('reads the new shape: ground names, and the list order as the promotion order', () => {
    expect(
      envListsOf({
        environments: [
          { name: 'dev', tier: 'ground' },
          { name: 'staging', tier: 'flight', cluster: 'kind-prod' },
        ],
      }),
    ).toEqual({ lower: ['dev'], order: ['dev', 'staging'] });
  });
  it('reads the old shape', () => {
    expect(envListsOf({ lowerEnvironments: ['dev', 'test'], promotionOrder: ['dev', 'test', 'prod'] })).toEqual({
      lower: ['dev', 'test'],
      order: ['dev', 'test', 'prod'],
    });
  });
  it('defaults like the schema when nothing is declared', () => {
    expect(envListsOf({})).toEqual({ lower: ['dev'], order: [] });
  });
});
