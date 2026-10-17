import { useMemo } from 'react';
import { configApiRef, useApiHolder } from '@backstage/core-plugin-api';

// Where Tower learns the fleet's names: app-config's `tower:` block (config.d.ts). Tower names no cluster, GitHub
// owner or lab host itself. Cluster names are input, chosen when Apron builds each cluster; a cluster's name is also its
// kubectl context and its name in kubernetes.clusterLocatorMethods (one name per cluster).
//
//   tower:
//     controlPlaneCluster: <dev cluster>   # runs Tekton, Glidepath's release records and the Airframe app XRs
//     clusters:                            # per cluster, only what Tower links to; all optional
//       <cluster>:
//         tenantsRepo: <owner>/<repo>      # where XR requests are opened (the registry record's tenantsRepo)
//         grafanaUrl: https://...
//         infisicalUrl: https://...
//     airframe:
//       repoURL: https://github.com/<owner>/airframe.git   # the fleet's default environment chart
//       path: charts/airframe-application
//
// Unset values hide the link or the lookup they feed; nothing falls back to a guessed name.

export interface ClusterLinks {
  /** The cluster's tenants repo, `owner/repo` or a github.com URL. */
  tenantsRepo?: { owner: string; repo: string };
  grafanaUrl?: string;
  infisicalUrl?: string;
}

export interface PlatformConfig {
  /** The control-plane (dev) cluster, or undefined when app-config does not name it. */
  controlPlaneCluster?: string;
  clusters: Record<string, ClusterLinks>;
  /** The fleet's default environment chart (Airframe's airframe-application), when configured. */
  airframeChart?: { repoURL: string; path: string };
}

/** What Tower reads from app-config, as plain data: the shape config.d.ts declares. */
export interface RawTowerConfig {
  controlPlaneCluster?: string;
  clusters?: Record<string, { tenantsRepo?: string; grafanaUrl?: string; infisicalUrl?: string }>;
  airframe?: { repoURL?: string; path?: string };
}

/** `owner/repo`, `github.com/owner/repo` or `https://github.com/owner/repo(.git)`. */
export function parseRepoRef(ref: string | undefined): { owner: string; repo: string } | undefined {
  if (!ref) return undefined;
  const m = /^(?:https?:\/\/)?(?:github\.com\/)?([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(ref.trim());
  return m ? { owner: m[1], repo: m[2] } : undefined;
}

export function toPlatformConfig(raw: RawTowerConfig | undefined): PlatformConfig {
  const clusters: Record<string, ClusterLinks> = {};
  for (const [name, c] of Object.entries(raw?.clusters ?? {})) {
    clusters[name] = {
      tenantsRepo: parseRepoRef(c?.tenantsRepo),
      grafanaUrl: c?.grafanaUrl || undefined,
      infisicalUrl: c?.infisicalUrl || undefined,
    };
  }
  const repoURL = raw?.airframe?.repoURL;
  return {
    controlPlaneCluster: raw?.controlPlaneCluster || undefined,
    clusters,
    airframeChart: repoURL ? { repoURL, path: raw?.airframe?.path || 'charts/airframe-application' } : undefined,
  };
}

/** The message a view shows instead of guessing a cluster when app-config does not name the control plane. */
export const NO_CONTROL_PLANE =
  'tower.controlPlaneCluster is not set in app-config: Tower does not know which cluster runs Tekton and the release records.';

function readRaw(config: { getOptionalConfig(key: string): any } | undefined): RawTowerConfig | undefined {
  const tower = config?.getOptionalConfig('tower');
  if (!tower) return undefined;
  const clustersCfg = tower.getOptionalConfig('clusters');
  const clusters: RawTowerConfig['clusters'] = {};
  for (const name of clustersCfg?.keys() ?? []) {
    const c = clustersCfg.getConfig(name);
    clusters[name] = {
      tenantsRepo: c.getOptionalString('tenantsRepo'),
      grafanaUrl: c.getOptionalString('grafanaUrl'),
      infisicalUrl: c.getOptionalString('infisicalUrl'),
    };
  }
  return {
    controlPlaneCluster: tower.getOptionalString('controlPlaneCluster'),
    clusters,
    airframe: {
      repoURL: tower.getOptionalString('airframe.repoURL'),
      path: tower.getOptionalString('airframe.path'),
    },
  };
}

/**
 * The fleet's names from app-config. Reads the config API when the app provides one (always, inside Backstage);
 * without one (a bare unit-test render) every value is unset.
 */
export function usePlatformConfig(): PlatformConfig {
  const config = useApiHolder().get(configApiRef);
  return useMemo(() => toPlatformConfig(readRaw(config)), [config]);
}
