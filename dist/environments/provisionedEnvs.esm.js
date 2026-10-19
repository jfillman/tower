import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy.esm.js';
import { usePlatformConfig } from '../platformConfig.esm.js';

function toProvisioned(items, appName) {
  const out = [];
  for (const xr of items) {
    const { env, cluster } = xr.spec ?? {};
    if (xr.spec?.appName !== appName || !env || !cluster || !xr.metadata?.name) continue;
    out.push({ env, cluster, xrName: xr.metadata.name, ready: Boolean(xr.status?.conditions?.some((c) => c.type === "Ready" && c.status === "True")) });
  }
  return out.sort((a, b) => a.env.localeCompare(b.env));
}
function unlistedProvisioned(provisioned, declared) {
  const names = new Set(declared);
  return provisioned.filter((p) => !names.has(p.env));
}
function useProvisionedEnvs(appName, enabled, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const cluster = usePlatformConfig().controlPlaneCluster;
  const [envs, setEnvs] = useState([]);
  useEffect(() => {
    if (!enabled || !appName || !cluster) {
      setEnvs([]);
      return void 0;
    }
    let live = true;
    (async () => {
      try {
        const list = await k8sProxyGet(
          discoveryApi,
          fetchApi,
          cluster,
          `/apis/catalog.hangar.io/v1alpha1/namespaces/app-${appName}-cicd/applicationenvironments`
        );
        if (live) setEnvs(toProvisioned(list.items ?? [], appName));
      } catch {
        if (live) setEnvs([]);
      }
    })();
    return () => {
      live = false;
    };
  }, [appName, enabled, cluster, discoveryApi, fetchApi, refreshNonce]);
  return envs;
}

export { toProvisioned, unlistedProvisioned, useProvisionedEnvs };
//# sourceMappingURL=provisionedEnvs.esm.js.map
