import { useCallback } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { usePolled } from '../fleet/usePolled.esm.js';
import { POLL_MS } from './useAgentRequests.esm.js';

const REQUEST_ID = /^h-[0-9a-f]{12}$/;
const SCOPE = /^agent-request:(h-[0-9a-f]{12})$/;
function requestIdOf(n) {
  const fromScope = n.payload.scope?.match(SCOPE)?.[1];
  if (fromScope) return fromScope;
  const link = n.payload.link;
  if (!link) return void 0;
  try {
    const id = new URL(link, "http://tower.local").searchParams.get("id") ?? "";
    return REQUEST_ID.test(id) ? id : void 0;
  } catch {
    return void 0;
  }
}
function useAgentRequestStatuses(ids) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const key = [...new Set(ids)].sort().join(",");
  const fetcher = useCallback(async () => {
    if (!key) return {};
    const base = await discoveryApi.getBaseUrl("agent-requests");
    const res = await fetchApi.fetch(`${base}/requests/status?ids=${encodeURIComponent(key)}`);
    const body = await res.json().catch(() => void 0);
    if (!res.ok) throw new Error(body?.error ?? `agent request status failed with ${res.status}`);
    return body?.items ?? {};
  }, [discoveryApi, fetchApi, key]);
  return usePolled(`agent-request-status:${key}`, fetcher, POLL_MS);
}

export { requestIdOf, useAgentRequestStatuses };
//# sourceMappingURL=useAgentRequestStatuses.esm.js.map
