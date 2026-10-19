import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';

// The fleet's cluster registry, as Backstage's cluster-registry backend plugin returns it (backstage
// packages/backend/src/clusterRegistry.ts): one record per registered cluster, with the eligibility the Airframe
// compositions gate on already worked out (flight: type upper + crossplaneReady; onboarding: type dev + cicdReady).
// The Add environment dialog offers these instead of a free-text cluster name.

export interface RegisteredCluster {
  name: string;
  type: string;
  zone?: string;
  roles: string[];
  flight: boolean;
  onboarding: boolean;
}

export type RegistryState = { status: 'loading' } | { status: 'ready'; clusters: RegisteredCluster[] } | { status: 'failed' };

/** Read once per mount; `enabled` false skips the request (the dialog is closed, or not a Kubernetes Flight env). */
export function useRegisteredClusters(enabled = true): RegistryState {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<RegistryState>({ status: 'loading' });
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    (async () => {
      try {
        const res = await fetchApi.fetch(`${await discoveryApi.getBaseUrl('cluster-registry')}/clusters`);
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { clusters?: RegisteredCluster[] };
        if (live) setState({ status: 'ready', clusters: body.clusters ?? [] });
      } catch {
        if (live) setState({ status: 'failed' });
      }
    })();
    return () => {
      live = false;
    };
  }, [enabled, discoveryApi, fetchApi]);
  return state;
}

export interface FlightClusterOption {
  value: string;
  label: string;
}

/** The clusters a Flight environment can run on, each with zone and roles, and which of this app's environments use it. */
export function flightClusterOptions(clusters: RegisteredCluster[], usedBy: Record<string, string[]> = {}): FlightClusterOption[] {
  return clusters
    .filter(c => c.flight)
    .map(c => {
      const detail = [c.zone, c.roles.join(', ')].filter(Boolean).join(' · ');
      const used = usedBy[c.name]?.length ? `used by ${usedBy[c.name].join(', ')}` : '';
      const extra = [detail, used].filter(Boolean).join(', ');
      return { value: c.name, label: extra ? `${c.name} (${extra})` : c.name };
    });
}

/** Why the chosen cluster cannot take a Flight environment, when the registry says so; undefined when it can or is unknown. */
export function flightClusterProblem(state: RegistryState, cluster: string): string | undefined {
  if (state.status !== 'ready' || !cluster) return undefined;
  const usable = state.clusters.filter(c => c.flight).map(c => c.name);
  if (usable.includes(cluster)) return undefined;
  const known = state.clusters.find(c => c.name === cluster);
  const why = known ? 'is registered but cannot host a Flight environment (it needs type upper and crossplaneReady)' : 'is not in the cluster registry';
  return `Cluster "${cluster}" ${why}.${usable.length ? ` Registered upper clusters: ${usable.join(', ')}.` : ''}`;
}
