import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';

function usePreviews(appName, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({ loading: Boolean(appName), previews: [] });
  useEffect(() => {
    if (!appName) {
      setState({ loading: false, previews: [] });
      return void 0;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: void 0 }));
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl("glidepath");
        const res = await fetchApi.fetch(`${baseUrl}/previews?app=${encodeURIComponent(appName)}`);
        if (!res.ok) {
          const body2 = await res.json().catch(() => void 0);
          throw new Error(body2?.error ?? `${res.status} ${res.statusText}`);
        }
        const body = await res.json();
        if (!cancelled) setState({ loading: false, previews: body.previews ?? [] });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e instanceof Error ? e.message : String(e), previews: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appName, refreshNonce, discoveryApi, fetchApi]);
  return state;
}

export { usePreviews };
//# sourceMappingURL=usePreviews.esm.js.map
