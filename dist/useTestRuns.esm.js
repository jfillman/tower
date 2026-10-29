import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';

function useTestRuns(appName, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({ loading: Boolean(appName), runs: [] });
  useEffect(() => {
    if (!appName) {
      setState({ loading: false, runs: [] });
      return void 0;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: void 0 }));
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl("glidepath");
        const res = await fetchApi.fetch(`${baseUrl}/tests?app=${encodeURIComponent(appName)}&limit=100`);
        if (!res.ok) {
          const body2 = await res.json().catch(() => void 0);
          throw new Error(body2?.error ?? `${res.status} ${res.statusText}`);
        }
        const body = await res.json();
        if (!cancelled) setState({ loading: false, runs: body.runs ?? [] });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e instanceof Error ? e.message : String(e), runs: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appName, refreshNonce, discoveryApi, fetchApi]);
  return state;
}
async function downloadTestReport(fetchApi, baseUrl, appName, run) {
  const res = await fetchApi.fetch(
    `${baseUrl}/tests/report?id=${encodeURIComponent(run.id)}${appName ? `&app=${encodeURIComponent(appName)}` : ""}`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => void 0);
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${run.workflow}-${run.id}-junit.xml`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export { downloadTestReport, useTestRuns };
//# sourceMappingURL=useTestRuns.esm.js.map
