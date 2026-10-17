import { renderHook } from '@testing-library/react';
import { parseRepoRef, toPlatformConfig, usePlatformConfig } from './platformConfig';

describe('toPlatformConfig', () => {
  it('names no cluster, owner or chart when app-config sets none', () => {
    expect(toPlatformConfig(undefined)).toEqual({ controlPlaneCluster: undefined, clusters: {}, airframeChart: undefined });
  });

  it('reads the control plane, per-cluster links and the Airframe chart', () => {
    const cfg = toPlatformConfig({
      controlPlaneCluster: 'example-dev',
      clusters: {
        'example-dev': { tenantsRepo: 'example-org/gitops-cluster-dev-tenants', infisicalUrl: 'https://infisical.example.internal' },
        'example-prod': { grafanaUrl: 'https://grafana.example.internal' },
      },
      airframe: { repoURL: 'https://github.com/example-org/airframe.git' },
    });
    expect(cfg.controlPlaneCluster).toBe('example-dev');
    expect(cfg.clusters['example-dev'].tenantsRepo).toEqual({ owner: 'example-org', repo: 'gitops-cluster-dev-tenants' });
    expect(cfg.clusters['example-prod'].grafanaUrl).toBe('https://grafana.example.internal');
    expect(cfg.airframeChart).toEqual({ repoURL: 'https://github.com/example-org/airframe.git', path: 'charts/airframe-application' });
  });
});

describe('parseRepoRef', () => {
  it.each([
    ['example-org/tenants', { owner: 'example-org', repo: 'tenants' }],
    ['github.com/example-org/tenants', { owner: 'example-org', repo: 'tenants' }],
    ['https://github.com/example-org/tenants.git', { owner: 'example-org', repo: 'tenants' }],
  ])('%s', (ref, want) => expect(parseRepoRef(ref)).toEqual(want));
  it('is undefined for anything else', () => {
    expect(parseRepoRef(undefined)).toBeUndefined();
    expect(parseRepoRef('tenants')).toBeUndefined();
  });
});

describe('usePlatformConfig', () => {
  it('is empty without a config API (no guessed cluster)', () => {
    const { result } = renderHook(() => usePlatformConfig());
    expect(result.current.controlPlaneCluster).toBeUndefined();
  });
});
