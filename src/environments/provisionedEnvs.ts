import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy';
import { usePlatformConfig } from '../platformConfig';

// Flight environments that exist in Crossplane but not in cicd.yaml. Creating one takes two steps: the
// ApplicationEnvironment request (the XR, on the control-plane cluster) and the deploy.environments entry. Tower's Add
// environment does both, but the Backstage template only does the first, and an environment cicd.yaml does not name
// gets no release and no row here (gate-api prod, 2026-10-19). These are listed so the second step is one click: the
// staged add reuses the existing request (applicationEnvironment.ts reuseExisting) and opens only the cicd.yaml change.

export interface ProvisionedEnv {
  env: string;
  cluster: string;
  xrName: string;
  ready: boolean;
}

interface RawEnvXr {
  metadata?: { name?: string };
  spec?: { appName?: string; env?: string; cluster?: string };
  status?: { conditions?: Array<{ type: string; status: string }> };
}

/** This app's ApplicationEnvironment XRs as environments, skipping any without an env or cluster. */
export function toProvisioned(items: RawEnvXr[], appName: string): ProvisionedEnv[] {
  const out: ProvisionedEnv[] = [];
  for (const xr of items) {
    const { env, cluster } = xr.spec ?? {};
    if (xr.spec?.appName !== appName || !env || !cluster || !xr.metadata?.name) continue;
    out.push({ env, cluster, xrName: xr.metadata.name, ready: Boolean(xr.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True')) });
  }
  return out.sort((a, b) => a.env.localeCompare(b.env));
}

/** The provisioned environments cicd.yaml (with what is staged) does not name. */
export function unlistedProvisioned(provisioned: ProvisionedEnv[], declared: string[]): ProvisionedEnv[] {
  const names = new Set(declared);
  return provisioned.filter(p => !names.has(p.env));
}

/** Reads the app's ApplicationEnvironment XRs on the control-plane cluster; empty when off, unconfigured or unreadable. */
export function useProvisionedEnvs(appName: string | undefined, enabled: boolean, refreshNonce = 0): ProvisionedEnv[] {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const cluster = usePlatformConfig().controlPlaneCluster;
  const [envs, setEnvs] = useState<ProvisionedEnv[]>([]);
  useEffect(() => {
    if (!enabled || !appName || !cluster) {
      setEnvs([]);
      return undefined;
    }
    let live = true;
    (async () => {
      try {
        const list = await k8sProxyGet<{ items?: RawEnvXr[] }>(
          discoveryApi,
          fetchApi,
          cluster,
          `/apis/catalog.hangar.io/v1alpha1/namespaces/app-${appName}-cicd/applicationenvironments`,
        );
        if (live) setEnvs(toProvisioned(list.items ?? [], appName));
      } catch {
        // A hint, not a gate: nothing is shown when the cluster cannot be read.
        if (live) setEnvs([]);
      }
    })();
    return () => {
      live = false;
    };
  }, [appName, enabled, cluster, discoveryApi, fetchApi, refreshNonce]);
  return envs;
}
