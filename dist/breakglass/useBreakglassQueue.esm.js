import { useCallback } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { usePolled } from '../fleet/usePolled.esm.js';

const QUEUE_POLL_MS = 3e4;
const queueSize = (q) => q ? q.toApprove.length + q.toStart.length + q.toReview.length : 0;
function queueRowLink(row) {
  if (!row.entityRef) return void 0;
  return `?${new URLSearchParams({ entity: row.entityRef, tab: "topology", env: row.env, breakglass: row.id })}`;
}
function useBreakglassQueue() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const fetcher = useCallback(async () => {
    const base = await discoveryApi.getBaseUrl("glidepath");
    const res = await fetchApi.fetch(`${base}/breakglass/queue`);
    const body = await res.json().catch(() => void 0);
    if (!res.ok) throw new Error(body?.error ?? `queue failed with ${res.status}`);
    return body;
  }, [discoveryApi, fetchApi]);
  return usePolled("breakglass-queue", fetcher, QUEUE_POLL_MS);
}

export { QUEUE_POLL_MS, queueRowLink, queueSize, useBreakglassQueue };
//# sourceMappingURL=useBreakglassQueue.esm.js.map
