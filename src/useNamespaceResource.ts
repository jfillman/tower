import { useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import type { K8sResourceRef } from './types';

// The one resource useTowerEnvironments.ts's bulk custom-resource fetch
// genuinely can't reach (2026-09-17 bug report, "we need to see everything
// ... including the namespace resource"): Namespace is cluster-scoped, but
// that fetcher unconditionally nests every matcher under
// `/namespaces/<ns>/<plural>` (confirmed against KubernetesFetcher's
// buildResourcePath), which would build the invalid
// `/api/v1/namespaces/<ns>/namespaces`. A single raw GET at the real path
// (`/api/v1/namespaces/<ns>`) - same generic proxy mechanism
// NamespaceEvents.tsx already uses - is the only way to fetch it. Scoped to
// whichever one environment is currently being viewed (EnvironmentTopology
// calls this for its own env only), not bulk-fetched for every environment
// the way the rest of env.resources is, since there's no cheap way to batch
// a cluster-scoped single-object GET the way a label-selected LIST is.
export function useNamespaceResource(cluster: string, namespace: string): K8sResourceRef | undefined {
  const kubernetesApi = useApi(kubernetesApiRef);
  const [resource, setResource] = useState<K8sResourceRef | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setResource(undefined);
    (async () => {
      try {
        const res = await kubernetesApi.proxy({ clusterName: cluster, path: `/api/v1/namespaces/${namespace}` });
        if (!res.ok || cancelled) return;
        const raw = await res.json();
        if (cancelled) return;
        setResource({
          kind: 'Namespace',
          apiVersion: raw.apiVersion,
          name: raw.metadata?.name ?? namespace,
          namespace,
          labels: raw.metadata?.labels,
          annotations: raw.metadata?.annotations,
          raw,
        });
      } catch {
        // Best-effort, same as every other custom-resource fetch here - a
        // missing RBAC grant or unreachable cluster just means "not shown",
        // not an error banner for the whole resource gallery.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cluster, namespace, kubernetesApi]);

  return resource;
}
