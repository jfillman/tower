import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy';

/**
 * The names of the cluster's ClusterAnalysisTemplates (Argo Rollouts), or undefined while loading or when Tower cannot read
 * them. Undefined is "unknown", never "none": a missing read grant must not make every cluster reference look wrong.
 */
export function useClusterAnalysisTemplates(cluster: string | undefined): string[] | undefined {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [names, setNames] = useState<string[] | undefined>(undefined);
  useEffect(() => {
    if (!cluster) {
      setNames(undefined);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await k8sProxyGet<{ items?: Array<{ metadata: { name: string } }> }>(
          discoveryApi,
          fetchApi,
          cluster,
          '/apis/argoproj.io/v1alpha1/clusteranalysistemplates',
        );
        if (!cancelled) setNames((res.items ?? []).map(i => i.metadata.name).sort());
      } catch {
        if (!cancelled) setNames(undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [discoveryApi, fetchApi, cluster]);
  return names;
}
