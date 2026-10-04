import { useCallback, useState } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { useAppConfig, useSubmitConfigChange, usePlatformFile, useSubmitPlatformFileChange } from '../useConfigData.esm.js';

function useFlightValuesSource(target) {
  const [nonce, setNonce] = useState(0);
  const cfg = useAppConfig(target, nonce);
  const sub = useSubmitConfigChange();
  return {
    loading: cfg.loading,
    error: cfg.error,
    data: cfg.data,
    refresh: () => setNonce((n) => n + 1),
    submit: (patch, summary) => sub.submit({ ...target, patch, summary }),
    submitting: sub.loading,
    result: sub.result,
    submitError: sub.error,
    resetSubmit: sub.reset
  };
}
function useGroundValuesSource(target) {
  const [nonce, setNonce] = useState(0);
  const selector = { kind: "env", env: target.env };
  const file = usePlatformFile({ owner: target.owner, appName: target.appName, selector }, nonce);
  const sub = useSubmitPlatformFileChange();
  return {
    loading: file.loading,
    error: file.error,
    data: file.data,
    refresh: () => setNonce((n) => n + 1),
    submit: (patch, summary) => sub.submit({ owner: target.owner, appName: target.appName, selector, patch, summary }),
    submitting: sub.loading,
    result: sub.result,
    submitError: sub.error,
    resetSubmit: sub.reset
  };
}
function useEnvValuesLoader() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  return useCallback(
    async (target) => {
      const base = await discoveryApi.getBaseUrl("glidepath");
      const params = new URLSearchParams({ owner: target.owner, appName: target.appName, env: target.env });
      let url = `${base}/config/platform-env?${params}`;
      if (target.tier === "flight") {
        params.set("cluster", target.cluster ?? "");
        url = `${base}/config?${params}`;
      }
      const res = await fetchApi.fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => void 0);
        throw new Error(body?.error ?? `request failed with ${res.status}`);
      }
      return (await res.json()).values ?? {};
    },
    [discoveryApi, fetchApi]
  );
}

export { useEnvValuesLoader, useFlightValuesSource, useGroundValuesSource };
//# sourceMappingURL=sources.esm.js.map
