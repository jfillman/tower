import { flightClusterOptions, flightClusterProblem, type RegisteredCluster, type RegistryState } from './registeredClusters';

const dev: RegisteredCluster = { name: 'hub-dev', type: 'dev', zone: 'lower', roles: ['control-plane'], flight: false, onboarding: true };
const prod: RegisteredCluster = { name: 'edge-prod', type: 'upper', zone: 'upper', roles: ['workloads'], flight: true, onboarding: false };
const bare: RegisteredCluster = { name: 'edge-2', type: 'upper', roles: [], flight: true, onboarding: false };
const notReady: RegisteredCluster = { name: 'new-prod', type: 'upper', roles: [], flight: false, onboarding: false };
const ready: RegistryState = { status: 'ready', clusters: [dev, prod, bare, notReady] };

describe('flightClusterOptions', () => {
  it('offers only clusters that can host a Flight environment, with zone, roles and which envs use them', () => {
    expect(flightClusterOptions([dev, prod, bare, notReady], { 'edge-prod': ['staging', 'prod'] })).toEqual([
      { value: 'edge-prod', label: 'edge-prod (upper · workloads, used by staging, prod)' },
      { value: 'edge-2', label: 'edge-2' },
    ]);
    expect(flightClusterOptions([bare], { 'edge-2': ['qa'] })).toEqual([{ value: 'edge-2', label: 'edge-2 (used by qa)' }]);
  });
});

describe('flightClusterProblem', () => {
  it('accepts a usable cluster, and says nothing while the registry is unknown', () => {
    expect(flightClusterProblem(ready, 'edge-prod')).toBeUndefined();
    expect(flightClusterProblem({ status: 'failed' }, 'typo')).toBeUndefined();
    expect(flightClusterProblem({ status: 'loading' }, 'typo')).toBeUndefined();
    expect(flightClusterProblem(ready, '')).toBeUndefined();
  });

  it('names an unregistered cluster and lists the ones that work', () => {
    expect(flightClusterProblem(ready, 'edge-prd')).toBe('Cluster "edge-prd" is not in the cluster registry. Registered upper clusters: edge-prod, edge-2.');
  });

  it('says why a registered cluster cannot take one', () => {
    expect(flightClusterProblem(ready, 'hub-dev')).toMatch(/is registered but cannot host a Flight environment/);
    expect(flightClusterProblem(ready, 'new-prod')).toMatch(/is registered but cannot host/);
  });
});
