import { useMemo } from 'react';
import type { FleetApp } from '../useFleetEnvironments';
import { useProvenanceMap } from '../useReleaseData';
import { findApiSpec, type DeployedSpec } from './apiSpec';

// The spec each environment runs: the image the environment's Rollout runs (live Kubernetes state, useFleetEnvironments)
// -> that image's attestations through the backend's /provenance route (the same one, and the same verification, the
// Images tab and the Release Record use) -> its api-spec attestation. Provenance is GitHub/registry-backed and fetched on
// demand, so this runs only while Contracts is open, once per image (and on Refresh).

export interface EnvSpec {
  app: string;
  env: string;
  cluster: string;
  image?: string;
  loading: boolean;
  error?: string;
  digest?: string;
  spec?: DeployedSpec;
}

/** Lower environments first (ground before flight), then by name: the natural "from → to" order for a diff. */
export const envOrder = (a: { env: string; cluster: string }, b: { env: string; cluster: string }) => {
  const rank = (e: string) => {
    if (/^(dev|test|qa|ci)/.test(e)) return 0;
    if (/^(stag|uat|pre)/.test(e)) return 1;
    return /^prod/.test(e) ? 3 : 2;
  };
  return rank(a.env) - rank(b.env) || a.env.localeCompare(b.env) || a.cluster.localeCompare(b.cluster);
};

export function useDeployedSpecs(apps: FleetApp[], nonce = 0): { byApp: Map<string, EnvSpec[]>; loading: boolean } {
  const targets = useMemo(
    () =>
      apps.flatMap(a =>
        a.environments.filter(e => e.deployed !== false).map(e => ({ app: a.appName, env: e.env, cluster: e.cluster, image: e.image })),
      ),
    [apps],
  );
  const images = useMemo(() => [...new Set(targets.map(t => t.image).filter((i): i is string => Boolean(i)))].sort(), [targets]);
  const provenance = useProvenanceMap(images, nonce);
  return useMemo(() => {
    const byApp = new Map<string, EnvSpec[]>();
    for (const t of targets) {
      const p = t.image ? provenance[t.image] : undefined;
      const row: EnvSpec = {
        ...t,
        loading: Boolean(t.image) && (!p || p.loading),
        error: p?.error,
        digest: p?.data?.digest,
        spec: findApiSpec(p?.data),
      };
      byApp.set(t.app, [...(byApp.get(t.app) ?? []), row].sort(envOrder));
    }
    return { byApp, loading: targets.some(t => t.image && (!provenance[t.image] || provenance[t.image].loading)) };
  }, [targets, provenance]);
}
