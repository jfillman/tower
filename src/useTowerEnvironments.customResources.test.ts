import type { ClusterObjects } from '@backstage/plugin-kubernetes-common';
import { customResourcesByClusterAndKind } from './useTowerEnvironments';

const cluster = (name: string, ...lists: Array<Array<{ kind: string; name: string }>>): ClusterObjects =>
  ({
    cluster: { name },
    errors: [],
    podMetrics: [],
    resources: [
      { type: 'pods', resources: [{ kind: 'Pod', name: 'not-custom' }] },
      ...lists.map(list => ({ type: 'customresources', resources: list.map(o => ({ kind: o.kind, metadata: { name: o.name } })) })),
    ],
  }) as unknown as ClusterObjects;

describe('customResourcesByClusterAndKind', () => {
  it('splits one multi-matcher response back into per-kind lists per cluster', () => {
    const out = customResourcesByClusterAndKind([
      cluster('dev', [{ kind: 'Rollout', name: 'r1' }], [], [{ kind: 'Role', name: 'a' }, { kind: 'Role', name: 'b' }]),
      cluster('prod', [{ kind: 'Rollout', name: 'r2' }]),
    ]);
    const names = (c: string, k: string) => (out.get(c)?.get(k) ?? []).map(o => (o as any).metadata.name);
    expect(names('dev', 'Rollout')).toEqual(['r1']);
    expect(names('dev', 'Role')).toEqual(['a', 'b']);
    expect(names('prod', 'Rollout')).toEqual(['r2']);
    expect(names('prod', 'Role')).toEqual([]);
    expect(out.get('dev')?.has('Pod')).toBe(false);
  });

  it('keeps a cluster whose matchers all came back empty, so its maps get an entry', () => {
    const out = customResourcesByClusterAndKind([cluster('kind-prod', [], [])]);
    expect(out.has('kind-prod')).toBe(true);
    expect(out.get('kind-prod')?.size).toBe(0);
  });
});
