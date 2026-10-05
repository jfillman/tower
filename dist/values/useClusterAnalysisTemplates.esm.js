import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy.esm.js';

function useClusterAnalysisTemplates(cluster) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [names, setNames] = useState(void 0);
  useEffect(() => {
    if (!cluster) {
      setNames(void 0);
      return void 0;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await k8sProxyGet(
          discoveryApi,
          fetchApi,
          cluster,
          "/apis/argoproj.io/v1alpha1/clusteranalysistemplates"
        );
        if (!cancelled) setNames((res.items ?? []).map((i) => i.metadata.name).sort());
      } catch {
        if (!cancelled) setNames(void 0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [discoveryApi, fetchApi, cluster]);
  return names;
}

export { useClusterAnalysisTemplates };
//# sourceMappingURL=useClusterAnalysisTemplates.esm.js.map
