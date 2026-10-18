import { useMemo } from 'react';
import { useApiHolder, configApiRef } from '@backstage/core-plugin-api';

function parseRepoRef(ref) {
  if (!ref) return void 0;
  const m = /^(?:https?:\/\/)?(?:github\.com\/)?([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(ref.trim());
  return m ? { owner: m[1], repo: m[2] } : void 0;
}
function toPlatformConfig(raw) {
  const clusters = {};
  for (const [name, c] of Object.entries(raw?.clusters ?? {})) {
    clusters[name] = {
      tenantsRepo: parseRepoRef(c?.tenantsRepo),
      grafanaUrl: c?.grafanaUrl || void 0,
      infisicalUrl: c?.infisicalUrl || void 0
    };
  }
  const repoURL = raw?.airframe?.repoURL;
  return {
    controlPlaneCluster: raw?.controlPlaneCluster || void 0,
    clusters,
    airframeChart: repoURL ? { repoURL, path: raw?.airframe?.path || "charts/airframe-application" } : void 0
  };
}
const NO_CONTROL_PLANE = "tower.controlPlaneCluster is not set in app-config: Tower does not know which cluster runs Tekton and the release records.";
function readRaw(config) {
  const tower = config?.getOptionalConfig("tower");
  if (!tower) return void 0;
  const clustersCfg = tower.getOptionalConfig("clusters");
  const clusters = {};
  for (const name of clustersCfg?.keys() ?? []) {
    const c = clustersCfg.getConfig(name);
    clusters[name] = {
      tenantsRepo: c.getOptionalString("tenantsRepo"),
      grafanaUrl: c.getOptionalString("grafanaUrl"),
      infisicalUrl: c.getOptionalString("infisicalUrl")
    };
  }
  return {
    controlPlaneCluster: tower.getOptionalString("controlPlaneCluster"),
    clusters,
    airframe: {
      repoURL: tower.getOptionalString("airframe.repoURL"),
      path: tower.getOptionalString("airframe.path")
    }
  };
}
function usePlatformConfig() {
  const config = useApiHolder().get(configApiRef);
  return useMemo(() => toPlatformConfig(readRaw(config)), [config]);
}

export { NO_CONTROL_PLANE, parseRepoRef, toPlatformConfig, usePlatformConfig };
//# sourceMappingURL=platformConfig.esm.js.map
