import { useState, useEffect } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';

function useNamespaceResource(cluster, namespace) {
  const kubernetesApi = useApi(kubernetesApiRef);
  const [resource, setResource] = useState(void 0);
  useEffect(() => {
    let cancelled = false;
    setResource(void 0);
    (async () => {
      try {
        const res = await kubernetesApi.proxy({ clusterName: cluster, path: `/api/v1/namespaces/${namespace}` });
        if (!res.ok || cancelled) return;
        const raw = await res.json();
        if (cancelled) return;
        setResource({
          kind: "Namespace",
          apiVersion: raw.apiVersion,
          name: raw.metadata?.name ?? namespace,
          namespace,
          labels: raw.metadata?.labels,
          annotations: raw.metadata?.annotations,
          raw
        });
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cluster, namespace, kubernetesApi]);
  return resource;
}

export { useNamespaceResource };
//# sourceMappingURL=useNamespaceResource.esm.js.map
