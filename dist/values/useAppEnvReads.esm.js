import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';

function useAppEnvReads(owner, appName) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState();
  useEffect(() => {
    setState(void 0);
    if (!owner || !appName) return void 0;
    let cancelled = false;
    (async () => {
      try {
        const base = await discoveryApi.getBaseUrl("glidepath");
        const res = await fetchApi.fetch(`${base}/app/env-reads?${new URLSearchParams({ owner, appName })}`);
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled && body.repo) setState(body);
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, appName, discoveryApi, fetchApi]);
  return state;
}

export { useAppEnvReads };
//# sourceMappingURL=useAppEnvReads.esm.js.map
