import { useEffect, useState } from 'react';
import { appRepos, useAppType } from '../appRepos';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy';
import {
  infisicalProjectUrl,
  type ManagedSnapshot,
  type PrSnapshot,
  type SecretsSnapshot,
  type XrCondition,
} from '../provisioning/deriveProvisioning';
import { latestOnboardingPr, parseTenantsRepo, toManaged, toSecrets } from '../provisioning/useProvisioning';
import { usePlatformConfig } from '../platformConfig';
import { deriveEnvLifecycle, type EnvLifecycleInputs, type EnvLifecycleStep } from './lifecycle';
import { ENVS_ROOT } from '../types';

// Reads what is observable about one environment's creation and turns it into steps (see lifecycle.ts). Polled while
// it is on screen: the cluster every few seconds, GitHub (through the backend, which answers repeats with conditional
// requests) at a slower pace, since this platform has hit its GitHub rate limit before.

const POLL_MS = 8000;
const GITHUB_POLL_MS = 45000;

interface ListResponse<T> {
  items?: T[];
}
interface RawXr {
  metadata: { name: string; annotations?: Record<string, string> };
  spec?: { appType?: string; crossplane?: { resourceRefs?: { kind: string; name: string }[] } };
  status?: { conditions?: XrCondition[] };
}
interface RawManaged {
  metadata: { name: string; annotations?: Record<string, string> };
  status?: { conditions?: XrCondition[] };
}

export interface EnvLifecycleTarget {
  owner: string;
  appName: string;
  env: string;
  tier: 'ground' | 'flight';
  /** Flight: the cluster the environment runs on. */
  cluster?: string;
  /** cicd.yaml already names the environment. */
  declared: boolean;
  /** The cicd.yaml pull request being waited for, when it is not merged yet. */
  cicdPrUrl?: string;
  /** The environment shows up in the live environment list. */
  deployed?: boolean;
  /** The environment's values file exists. */
  valuesFileExists?: boolean;
  /** Ground: the values file's path in the source repo (under glidepath/). */
  valuesFilePath?: string;
  /** Request pull request URLs already known from this session's submit (Flight). */
  knownRequestUrl?: string;
  /** Ground: a pipeline has a step that deploys to the environment (false = nothing in CI ever will). */
  pipelineStep?: boolean;
}

export function useEnvLifecycle(target: EnvLifecycleTarget, enabled: boolean): { steps: EnvLifecycleStep[]; loading: boolean } {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  // The dev (control-plane) cluster holds the ApplicationEnvironment XRs; its tenants repo and Infisical UI come from
  // app-config (platformConfig.ts). Unset: those lookups and links are skipped.
  const platform = usePlatformConfig();
  const XR_CLUSTER = platform.controlPlaneCluster;
  const devLinks = XR_CLUSTER ? platform.clusters[XR_CLUSTER] : undefined;
  const tenantsRepo = devLinks?.tenantsRepo;
  const [extra, setExtra] = useState<Partial<EnvLifecycleInputs>>({});
  const [loading, setLoading] = useState(enabled);
  const { owner, appName, env, tier, cluster } = target;
  const appType = useAppType(appName);
  const repos = appName ? appRepos(appName, appType) : undefined;

  useEffect(() => {
    if (!enabled) return undefined;
    if (!XR_CLUSTER) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    const github: {
      at: number;
      busy: boolean;
      requestPr?: PrSnapshot;
      onboardingPr?: PrSnapshot;
      tenants?: { owner: string; repo: string };
    } = { at: 0, busy: false };
    const xrName = `${appName}-${cluster}-${env}`;
    const ns = appRepos(appName, appType).cicdNamespace;

    const optional = async <T,>(path: string, on: string = XR_CLUSTER): Promise<T | undefined> => {
      try {
        return await k8sProxyGet<T>(discoveryApi, fetchApi, on, path);
      } catch {
        return undefined;
      }
    };
    const getJson = async <T,>(url: string): Promise<T | undefined> => {
      try {
        const res = await fetchApi.fetch(url);
        return res.ok ? ((await res.json()) as T) : undefined;
      } catch {
        return undefined;
      }
    };

    const refreshGithub = async () => {
      if (github.busy || Date.now() - github.at < GITHUB_POLL_MS) return;
      github.busy = true;
      try {
        const prBase = await discoveryApi.getBaseUrl('pull-requests');
        // The XR names the tenants repo it was applied from (source-info), which beats app-config.
        const tenants = github.tenants ?? tenantsRepo;
        if (tier === 'flight' && tenants) {
          const r = await getJson<{ pr: PrSnapshot | null }>(
            `${prBase}/request-pr?${new URLSearchParams({ owner: tenants.owner, repo: tenants.repo, kind: 'ApplicationEnvironment', name: xrName })}`,
          );
          if (r?.pr) github.requestPr = r.pr;
        }
        if (tier === 'ground') {
          const prs = await getJson<Parameters<typeof latestOnboardingPr>[0]>(
            `${prBase}/pull-requests?${new URLSearchParams({ owner, appName, ...(appType === 'infra' ? { appType } : {}) })}`,
          );
          if (prs) github.onboardingPr = latestOnboardingPr(prs);
        }
      } catch {
        // The links are an extra: a failed lookup leaves the step without them.
      } finally {
        github.at = Date.now();
        github.busy = false;
      }
    };

    const load = async () => {
      const next: Partial<EnvLifecycleInputs> = {};
      if (tier === 'flight') {
        const nsBase = `/apis/catalog.hangar.io/v1alpha1/namespaces/${ns}`;
        const selector = `labelSelector=${encodeURIComponent(`crossplane.io/composite=${xrName}`)}`;
        const [xr, files] = await Promise.all([
          optional<RawXr>(`${nsBase}/applicationenvironments/${encodeURIComponent(xrName)}`),
          optional<ListResponse<RawManaged>>(`/apis/repo.github.m.upbound.io/v1alpha1/namespaces/${ns}/repositoryfiles?${selector}`),
        ]);
        if (xr) {
          github.tenants = parseTenantsRepo(xr.metadata.annotations?.['terasky.backstage.io/source-info']) ?? github.tenants;
          const cond = (t: string) => xr.status?.conditions?.find(c => c.type === t);
          const synced = cond('Synced');
          const workload = cond('WorkloadDeployed');
          next.xr = {
            found: true,
            synced: synced?.status === 'True',
            failed: synced?.status === 'False' ? (synced.message ?? synced.reason ?? 'sync failed') : undefined,
            workloadDeployed: workload?.status === 'True',
            workloadReason: workload?.reason,
          };
          next.files = toManaged(xr.spec?.crossplane?.resourceRefs, files?.items ?? []) as ManagedSnapshot[] | undefined;
        } else {
          next.xr = { found: false };
        }
        // The SecretStore requests the XR commits (secretstore-<env>.yaml, secretstore-shared.yaml) are applied by the
        // environment's own cluster's xr-requests ApplicationSet into <appType>-<app>-xrs, not on the control plane.
        // The per-env store (<app>-<cluster>-<env>) is this environment's; the shared one (<app>-<cluster>) owns the
        // Infisical project.
        if (cluster) {
          const xrsNs = `${xr?.spec?.appType || 'app'}-${appName}-xrs`;
          const stores = await optional<ListResponse<RawManaged & { status?: { conditions?: XrCondition[] } }>>(
            `/apis/catalog.hangar.io/v1alpha1/namespaces/${xrsNs}/secretstores`,
            cluster,
          );
          const store = stores?.items?.find(s => s.metadata.name === xrName);
          next.secrets = toSecrets(store as never, stores !== undefined) as SecretsSnapshot | undefined;
          if (store) {
            const projects = await optional<ListResponse<RawManaged>>(
              `/apis/project.infisical.m.hangar.io/v1alpha1/namespaces/${xrsNs}/projects`,
              cluster,
            );
            const id = projects?.items?.find(p => p.metadata.name === `${appName}-${cluster}`)?.metadata.annotations?.['crossplane.io/external-name'];
            if (id) next.infisicalUrl = infisicalProjectUrl(platform.clusters[cluster]?.infisicalUrl ?? devLinks?.infisicalUrl, id);
          }
        }
      }
      void refreshGithub();
      if (cancelled) return;
      setExtra({
        ...next,
        requestPr: github.requestPr,
        onboardingPr: github.onboardingPr,
        ...(github.tenants ? { tenantsRepoUrl: `https://github.com/${github.tenants.owner}/${github.tenants.repo}` } : {}),
      });
      setLoading(false);
    };

    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [discoveryApi, fetchApi, enabled, owner, appName, appType, env, tier, cluster, XR_CLUSTER, tenantsRepo?.owner, tenantsRepo?.repo, devLinks?.infisicalUrl, platform.clusters]); // eslint-disable-line react-hooks/exhaustive-deps

  const requestPr: PrSnapshot | undefined =
    extra.requestPr ??
    (target.knownRequestUrl ? { number: Number(target.knownRequestUrl.split('/').pop()) || 0, url: target.knownRequestUrl, state: 'open' } : undefined);
  const steps = deriveEnvLifecycle({
    tier,
    env,
    appName,
    owner,
    declared: target.declared,
    cicdPrUrl: target.cicdPrUrl,
    deployed: target.deployed,
    valuesFileExists: target.valuesFileExists,
    tenantsRepoUrl: tenantsRepo ? `https://github.com/${tenantsRepo.owner}/${tenantsRepo.repo}` : undefined,
    gitopsRepoUrl: `https://github.com/${owner}/${repos?.gitopsRepo}`,
    valuesFileUrl:
      tier === 'flight' && cluster
        ? `https://github.com/${owner}/${repos?.gitopsRepo}/blob/main/${cluster}/${env}/values.yaml`
        : `https://github.com/${owner}/${repos?.configRepo}/blob/main/${target.valuesFilePath ?? `${ENVS_ROOT}/envs/${env}.yaml`}`,
    valuesFilePath: target.valuesFilePath,
    pipelineStep: target.pipelineStep,
    appType,
    ...extra,
    requestPr,
  });
  return { steps, loading };
}
