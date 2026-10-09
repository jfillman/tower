import { useCallback, useState } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { useFlightBase, useSubmitFlightBase, usePlatformFile, useSubmitPlatformFileChange, useAppConfig, useSubmitConfigChange } from '../useConfigData.esm.js';

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
    submitRaw: (raw, summary) => sub.submit({ ...target, patch: {}, raw, summary }),
    submitting: sub.loading,
    result: sub.result,
    submitError: sub.error,
    resetSubmit: sub.reset
  };
}
function useGroundValuesSource(target) {
  return usePlatformValuesSource({ owner: target.owner, appName: target.appName, selector: { kind: "env", env: target.env } });
}
function usePlatformValuesSource(target) {
  const [nonce, setNonce] = useState(0);
  const { selector } = target;
  const file = usePlatformFile({ owner: target.owner, appName: target.appName, selector }, nonce);
  const sub = useSubmitPlatformFileChange();
  return {
    loading: file.loading,
    error: file.error,
    data: file.data,
    refresh: () => setNonce((n) => n + 1),
    submit: (patch, summary) => sub.submit({ owner: target.owner, appName: target.appName, selector, patch, summary }),
    submitRaw: (raw, summary) => sub.submit({ owner: target.owner, appName: target.appName, selector, patch: {}, raw, summary }),
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
function useFlightBaseValuesSource(target) {
  const [nonce, setNonce] = useState(0);
  const file = useFlightBase(target, nonce);
  const sub = useSubmitFlightBase();
  return {
    loading: file.loading,
    error: file.error,
    data: file.data,
    refresh: () => setNonce((n) => n + 1),
    submit: (patch, summary) => sub.submit({ ...target, patch, summary }),
    submitRaw: (raw, summary) => sub.submit({ ...target, patch: {}, raw, summary }),
    submitting: sub.loading,
    result: sub.result,
    submitError: sub.error,
    resetSubmit: sub.reset
  };
}

export { useEnvValuesLoader, useFlightBaseValuesSource, useFlightValuesSource, useGroundValuesSource, usePlatformValuesSource };
//# sourceMappingURL=sources.esm.js.map
