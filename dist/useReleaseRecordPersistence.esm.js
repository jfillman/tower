import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';

function useReleaseRecordDoc(target, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: Boolean(target)
  });
  const key = target ? `${target.owner}/${target.appName}/${target.imageTag}` : "";
  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return void 0;
    }
    let cancelled = false;
    setState({ loading: true });
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl("glidepath");
        const params = new URLSearchParams(target);
        const res = await fetchApi.fetch(`${baseUrl}/release-record?${params.toString()}`);
        if (res.status === 404) {
          if (!cancelled) setState({ loading: false, notFound: true });
          return;
        }
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
function useSubmitHumanContext() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: false
  });
  const submit = async (request) => {
    setState({ loading: true });
    try {
      const baseUrl = await discoveryApi.getBaseUrl("glidepath");
      const res = await fetchApi.fetch(`${baseUrl}/release-record/human-context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => void 0);
        throw new Error(body?.error ?? `request failed with ${res.status}`);
      }
      const result = await res.json();
      setState({ loading: false, result });
    } catch (e) {
      setState({ loading: false, error: String(e) });
    }
  };
  const reset = () => setState({ loading: false });
  return { ...state, submit, reset };
}

export { useReleaseRecordDoc, useSubmitHumanContext };
//# sourceMappingURL=useReleaseRecordPersistence.esm.js.map
