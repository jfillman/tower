import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';

function usePullRequests(ownerAppName, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({ loading: Boolean(ownerAppName) });
  const key = ownerAppName ? `${ownerAppName.owner}/${ownerAppName.appName}` : "";
  useEffect(() => {
    if (!ownerAppName) {
      setState({ loading: false });
      return void 0;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl("pull-requests");
        const params = new URLSearchParams({
          owner: ownerAppName.owner,
          appName: ownerAppName.appName
        });
        const res = await fetchApi.fetch(`${baseUrl}/pull-requests?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => void 0);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, discoveryApi, fetchApi, refreshNonce]);
  return state;
}

export { usePullRequests };
//# sourceMappingURL=usePullRequests.esm.js.map
