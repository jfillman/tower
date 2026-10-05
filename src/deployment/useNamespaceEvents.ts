import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy';
import type { RawEvent } from './problems';

const POLL_MS = 10000;

/**
 * The namespace's events, refreshed while the component is mounted: a deployment that is failing changes by the minute, and a
 * list fetched once on load would show the problem as it was when the tab opened. Undefined until the first answer, and
 * undefined again when the namespace cannot be read (no grant, or it does not exist yet): "unknown", never "no problems".
 */
export function useNamespaceEvents(cluster: string | undefined, namespace: string | undefined, enabled = true): RawEvent[] | undefined {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [events, setEvents] = useState<RawEvent[] | undefined>(undefined);
  useEffect(() => {
    if (!enabled || !cluster || !namespace) {
      setEvents(undefined);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await k8sProxyGet<{ items?: RawEvent[] }>(discoveryApi, fetchApi, cluster, `/api/v1/namespaces/${namespace}/events?limit=300`);
        if (!cancelled) setEvents(res.items ?? []);
      } catch {
        if (!cancelled) setEvents(undefined);
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
