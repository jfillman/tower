import { toProvisioned, unlistedProvisioned } from './provisionedEnvs';

const xr = (name: string, appName: string, env?: string, cluster?: string, ready = true) => ({
  metadata: { name },
  spec: { appName, env, cluster },
  status: { conditions: [{ type: 'Ready', status: ready ? 'True' : 'False' }] },
});

describe('toProvisioned', () => {
  it("keeps this app's environments with an env and a cluster, sorted, with readiness", () => {
    expect(
      toProvisioned(
        [xr('a-edge-prod', 'a', 'prod', 'edge'), xr('a-edge-qa', 'a', 'qa', 'edge', false), xr('b-edge-prod', 'b', 'prod', 'edge'), xr('a-x', 'a', undefined, 'edge')],
        'a',
      ),
    ).toEqual([
      { env: 'prod', cluster: 'edge', xrName: 'a-edge-prod', ready: true },
      { env: 'qa', cluster: 'edge', xrName: 'a-edge-qa', ready: false },
    ]);
  });
});

describe('unlistedProvisioned', () => {
  it('lists only the ones cicd.yaml does not name', () => {
    const p = toProvisioned([xr('a-e-prod', 'a', 'prod', 'e'), xr('a-e-staging', 'a', 'staging', 'e')], 'a');
    expect(unlistedProvisioned(p, ['dev', 'staging']).map(e => e.env)).toEqual(['prod']);
    expect(unlistedProvisioned(p, ['dev', 'staging', 'prod'])).toEqual([]);
  });
});
