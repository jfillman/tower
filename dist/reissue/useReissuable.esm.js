import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { fetchReissuable } from './reissue.esm.js';

function useReissuable(appName, owner, nonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({ releases: [], allowed: false });
  useEffect(() => {
    if (!appName) return void 0;
    let live = true;
    fetchReissuable(discoveryApi, fetchApi, appName, owner).then((r) => live && setState({ releases: r.releases, allowed: r.allowed })).catch((e) => live && setState({ releases: [], allowed: false, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
  }, [discoveryApi, fetchApi, appName, owner, nonce]);
  return state;
}

export { useReissuable };
//# sourceMappingURL=useReissuable.esm.js.map
