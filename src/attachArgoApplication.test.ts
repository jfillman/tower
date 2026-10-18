import { attachArgoApplication } from './useReleaseContext';
import type { EnvironmentSummary } from './types';

jest.mock('@backstage/plugin-catalog-react', () => ({ useEntity: jest.fn() }));

const placeholder = (env: string, cluster: string): EnvironmentSummary => ({
  key: `declared/${cluster}/${env}`,
  env,
  cluster,
  namespace: '',
  deployed: false,
  drift: false,
  pods: [],
  services: [],
  resources: [],
});

describe('attachArgoApplication (an environment with no live workload keeps its Argo CD controls)', () => {
  it('gives a placeholder its Application and the cluster of the Argo CD instance that holds it', () => {
    const e = attachArgoApplication(placeholder('dev', 'example-prod'), 'sky-marshall', {
      'sky-marshall-dev': { instance: 'example-dev', syncStatus: 'Synced', healthStatus: 'Healthy' },
    });
    expect(e.argoAppName).toBe('sky-marshall-dev');
    expect(e.cluster).toBe('example-dev');
    expect(e.argoSyncStatus).toBe('Synced');
    expect(e.deployed).toBe(false);
  });

  it('leaves the placeholder alone when Argo CD has no such Application', () => {
    const p = placeholder('prod', 'example-prod');
    expect(attachArgoApplication(p, 'sky-marshall', {})).toBe(p);
    expect(attachArgoApplication(p, undefined, { 'sky-marshall-prod': { syncStatus: 'Synced' } })).toBe(p);
  });

  it('keeps the inferred cluster when the instance is unknown', () => {
    const e = attachArgoApplication(placeholder('staging', 'example-prod'), 'sky-marshall', { 'sky-marshall-staging': { syncStatus: 'OutOfSync' } });
    expect(e.cluster).toBe('example-prod');
    expect(e.argoAppName).toBe('sky-marshall-staging');
  });
});
