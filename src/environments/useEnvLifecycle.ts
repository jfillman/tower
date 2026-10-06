import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy';
import {
  infisicalProjectUrl,
  type ManagedSnapshot,
  type PrSnapshot,
  type SecretsSnapshot,
  type XrCondition,
} from '../provisioning/deriveProvisioning';
import { TENANTS_REPO_BY_CLUSTER, XR_CLUSTER, toManaged, toOnboardingPrs, toSecrets } from '../provisioning/useProvisioning';
import { deriveEnvLifecycle, type EnvLifecycleInputs, type EnvLifecycleStep } from './lifecycle';

// Reads what is observable about one environment's creation and turns it into steps (see lifecycle.ts). Polled while
// it is on screen: the cluster every few seconds, GitHub (through the backend, which answers repeats with conditional
// requests) at a slower pace, since this platform has hit its GitHub rate limit before.

const POLL_MS = 8000;
const GITHUB_POLL_MS = 45000;

interface ListResponse<T> {
  items?: T[];
}
interface RawXr {
  metadata: { name: string };
  spec?: { crossplane?: { resourceRefs?: { kind: string; name: string }[] } };
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
  /** Ground: the values file's path in the source repo (platform/ or glidepath/). */
  valuesFilePath?: string;
  /** Request pull request URLs already known from this session's submit (Flight). */
  knownRequestUrl?: string;
}

export function useEnvLifecycle(target: EnvLifecycleTarget, enabled: boolean): { steps: EnvLifecycleStep[]; loading: boolean } {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [extra, setExtra] = useState<Partial<EnvLifecycleInputs>>({});
  const [loading, setLoading] = useState(enabled);
  const { owner, appName, env, tier, cluster } = target;

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const github: { at: number; busy: boolean; requestPr?: PrSnapshot; onboardingPr?: PrSnapshot } = { at: 0, busy: false };
    const xrName = `${appName}-${cluster}-${env}`;
    const ns = `app-${appName}-cicd`;
    const tenants = TENANTS_REPO_BY_CLUSTER[XR_CLUSTER];

    const optional = async <T,>(path: string): Promise<T | undefined> => {
      try {
        return await k8sProxyGet<T>(discoveryApi, fetchApi, XR_CLUSTER, path);
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
        if (tier === 'flight' && tenants) {
          const r = await getJson<{ pr: PrSnapshot | null }>(
            `${prBase}/request-pr?${new URLSearchParams({ owner: tenants.owner, repo: tenants.repo, kind: 'ApplicationEnvironment', name: xrName })}`,
          );
          if (r?.pr) github.requestPr = r.pr;
        }
        if (tier === 'ground') {
          const prs = await getJson<Parameters<typeof toOnboardingPrs>[0]>(
            `${prBase}/pull-requests?${new URLSearchParams({ owner, appName })}`,
          );
          if (prs) github.onboardingPr = toOnboardingPrs(prs).source;
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
        const [xr, files, stores] = await Promise.all([
          optional<RawXr>(`${nsBase}/applicationenvironments/${encodeURIComponent(xrName)}`),
          optional<ListResponse<RawManaged>>(`/apis/repo.github.m.upbound.io/v1alpha1/namespaces/${ns}/repositoryfiles?${selector}`),
          optional<ListResponse<RawManaged & { status?: { conditions?: XrCondition[] } }>>(`${nsBase}/secretstores`),
        ]);
        if (xr) {
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
        const store = stores?.items?.find(s => s.metadata.name === xrName);
        next.secrets = toSecrets(store as never, stores !== undefined) as SecretsSnapshot | undefined;
        if (store) {
          const projects = await optional<ListResponse<RawManaged>>(
            `/apis/project.infisical.m.hangar.io/v1alpha1/namespaces/${ns}/projects`,
          );
          const id = projects?.items?.find(p => p.metadata.name === store.metadata.name)?.metadata.annotations?.['crossplane.io/external-name'];
          if (id) next.infisicalUrl = infisicalProjectUrl(XR_CLUSTER, id);
        }
      }
      void refreshGithub();
      if (cancelled) return;
      setExtra({ ...next, requestPr: github.requestPr, onboardingPr: github.onboardingPr });
      setLoading(false);
    };

    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [discoveryApi, fetchApi, enabled, owner, appName, env, tier, cluster]);

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
    tenantsRepoUrl: TENANTS_REPO_BY_CLUSTER[XR_CLUSTER] ? `https://github.com/${TENANTS_REPO_BY_CLUSTER[XR_CLUSTER].owner}/${TENANTS_REPO_BY_CLUSTER[XR_CLUSTER].repo}` : undefined,
    gitopsRepoUrl: `https://github.com/${owner}/gitops-${appName}`,
    valuesFileUrl:
      tier === 'flight' && cluster
        ? `https://github.com/${owner}/gitops-${appName}/blob/main/${cluster}/${env}/values.yaml`
        : `https://github.com/${owner}/${appName}/blob/main/${target.valuesFilePath ?? `platform/envs/${env}.yaml`}`,
    valuesFilePath: target.valuesFilePath,
    ...extra,
    requestPr,
  });
  return { steps, loading };
}
