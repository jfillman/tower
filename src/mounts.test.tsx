import type { Entity } from '@backstage/catalog-model';
import { immediateVisibility, resolveMountVisibility, TOWER_MOUNT_INPUTS, TOWER_TAB_MOUNT_ID, towerTabMountDataRef, type TowerMountContext, type TowerMounts } from './mounts';

const entity: Entity = { apiVersion: 'backstage.io/v1alpha1', kind: 'Component', metadata: { name: 'gate-api' } };
const ctx = (): TowerMountContext => ({ entity, discoveryApi: { getBaseUrl: async () => 'http://be' }, fetchApi: { fetch: async () => new Response('{}') } });

it('the contract a plugin re-declares by id stays what it says in the docs', () => {
  expect(TOWER_TAB_MOUNT_ID).toBe('tower.tab-mount');
  expect(towerTabMountDataRef.id).toBe('tower.tab-mount');
  expect(TOWER_MOUNT_INPUTS).toEqual({ agent: 'agentTab', clearance: 'clearanceTab' });
});

it('a mount with no relevance check shows at once; one with a check waits for it', async () => {
  const mounts: TowerMounts = {
    agent: { element: <i /> },
    clearance: { element: <i />, relevant: async c => c.entity.metadata.name === 'gate-api' },
  };
  expect(immediateVisibility(mounts)).toEqual({ agent: true, clearance: false });
  expect(await resolveMountVisibility(mounts, ctx())).toEqual({ agent: true, clearance: true });
  expect(await resolveMountVisibility(mounts, { ...ctx(), entity: { ...entity, metadata: { name: 'other' } } })).toEqual({ agent: true, clearance: false });
});

it('a relevance check that fails hides the tab instead of breaking the page', async () => {
  const mounts: TowerMounts = { clearance: { element: <i />, relevant: async () => { throw new Error('clearance-api down'); } } };
  expect(await resolveMountVisibility(mounts, ctx())).toEqual({ clearance: false });
});

it('nothing mounted means nothing visible', async () => {
  expect(immediateVisibility({})).toEqual({});
  expect(await resolveMountVisibility({ agent: undefined }, ctx())).toEqual({ agent: false });
});
