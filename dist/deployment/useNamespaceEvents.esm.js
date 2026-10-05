import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy.esm.js';

const POLL_MS = 1e4;
function useNamespaceEvents(cluster, namespace, enabled = true) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [events, setEvents] = useState(void 0);
  useEffect(() => {
    if (!enabled || !cluster || !namespace) {
      setEvents(void 0);
      return void 0;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await k8sProxyGet(discoveryApi, fetchApi, cluster, `/api/v1/namespaces/${namespace}/events?limit=300`);
        if (!cancelled) setEvents(res.items ?? []);
      } catch {
        if (!cancelled) setEvents(void 0);
      }
    };
    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [discoveryApi, fetchApi, cluster, namespace, enabled]);
  return events;
}

export { useNamespaceEvents };
//# sourceMappingURL=useNamespaceEvents.esm.js.map
