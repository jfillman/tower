import { useState, useEffect } from 'react';
import { useAppType, appRepos } from '../appRepos.esm.js';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy.esm.js';
import { infisicalProjectUrl } from '../provisioning/deriveProvisioning.esm.js';
import { parseTenantsRepo, toManaged, toSecrets, latestOnboardingPr } from '../provisioning/useProvisioning.esm.js';
import { usePlatformConfig } from '../platformConfig.esm.js';
import { deriveEnvLifecycle } from './lifecycle.esm.js';
import { ENVS_ROOT } from '../types.esm.js';

const POLL_MS = 8e3;
const GITHUB_POLL_MS = 45e3;
function useEnvLifecycle(target, enabled) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const platform = usePlatformConfig();
  const XR_CLUSTER = platform.controlPlaneCluster;
  const devLinks = XR_CLUSTER ? platform.clusters[XR_CLUSTER] : void 0;
  const tenantsRepo = devLinks?.tenantsRepo;
  const [extra, setExtra] = useState({});
  const [loading, setLoading] = useState(enabled);
  const { owner, appName, env, tier, cluster } = target;
  const appType = useAppType(appName);
  const repos = appName ? appRepos(appName, appType) : void 0;
  useEffect(() => {
    if (!enabled) return void 0;
    if (!XR_CLUSTER) {
      setLoading(false);
      return void 0;
    }
    let cancelled = false;
    const github = { at: 0, busy: false };
    const xrName = `${appName}-${cluster}-${env}`;
    const ns = appRepos(appName, appType).cicdNamespace;
    const optional = async (path, on = XR_CLUSTER) => {
      try {
        return await k8sProxyGet(discoveryApi, fetchApi, on, path);
      } catch {
        return void 0;
      }
    };
    const getJson = async (url) => {
      try {
        const res = await fetchApi.fetch(url);
        return res.ok ? await res.json() : void 0;
      } catch {
        return void 0;
      }
    };
    const refreshGithub = async () => {
      if (github.busy || Date.now() - github.at < GITHUB_POLL_MS) return;
      github.busy = true;
      try {
        const prBase = await discoveryApi.getBaseUrl("pull-requests");
        const tenants = github.tenants ?? tenantsRepo;
        if (tier === "flight" && tenants) {
          const r = await getJson(
            `${prBase}/request-pr?${new URLSearchParams({ owner: tenants.owner, repo: tenants.repo, kind: "ApplicationEnvironment", name: xrName })}`
          );
          if (r?.pr) github.requestPr = r.pr;
        }
        if (tier === "ground") {
          const prs = await getJson(
            `${prBase}/pull-requests?${new URLSearchParams({ owner, appName, ...appType === "infra" ? { appType } : {} })}`
          );
          if (prs) github.onboardingPr = latestOnboardingPr(prs);
        }
      } catch {
      } finally {
        github.at = Date.now();
        github.busy = false;
      }
    };
    const load = async () => {
      const next = {};
      if (tier === "flight") {
        const nsBase = `/apis/catalog.hangar.io/v1alpha1/namespaces/${ns}`;
        const selector = `labelSelector=${encodeURIComponent(`crossplane.io/composite=${xrName}`)}`;
        const [xr, files] = await Promise.all([
          optional(`${nsBase}/applicationenvironments/${encodeURIComponent(xrName)}`),
          optional(`/apis/repo.github.m.upbound.io/v1alpha1/namespaces/${ns}/repositoryfiles?${selector}`)
        ]);
        if (xr) {
          github.tenants = parseTenantsRepo(xr.metadata.annotations?.["terasky.backstage.io/source-info"]) ?? github.tenants;
          const cond = (t) => xr.status?.conditions?.find((c) => c.type === t);
          const synced = cond("Synced");
          const workload = cond("WorkloadDeployed");
          next.xr = {
            found: true,
            synced: synced?.status === "True",
            failed: synced?.status === "False" ? synced.message ?? synced.reason ?? "sync failed" : void 0,
            workloadDeployed: workload?.status === "True",
            workloadReason: workload?.reason
          };
          next.files = toManaged(xr.spec?.crossplane?.resourceRefs, files?.items ?? []);
        } else {
          next.xr = { found: false };
        }
        if (cluster) {
          const xrsNs = `${xr?.spec?.appType || "app"}-${appName}-xrs`;
          const stores = await optional(
            `/apis/catalog.hangar.io/v1alpha1/namespaces/${xrsNs}/secretstores`,
            cluster
          );
          const store = stores?.items?.find((s) => s.metadata.name === xrName);
          next.secrets = toSecrets(store, stores !== void 0);
          if (store) {
            const projects = await optional(
              `/apis/project.infisical.m.hangar.io/v1alpha1/namespaces/${xrsNs}/projects`,
              cluster
            );
            const id2 = projects?.items?.find((p) => p.metadata.name === `${appName}-${cluster}`)?.metadata.annotations?.["crossplane.io/external-name"];
            if (id2) next.infisicalUrl = infisicalProjectUrl(platform.clusters[cluster]?.infisicalUrl ?? devLinks?.infisicalUrl, id2);
          }
        }
      }
      void refreshGithub();
      if (cancelled) return;
      setExtra({
        ...next,
        requestPr: github.requestPr,
        onboardingPr: github.onboardingPr,
        ...github.tenants ? { tenantsRepoUrl: `https://github.com/${github.tenants.owner}/${github.tenants.repo}` } : {}
      });
      setLoading(false);
    };
    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [discoveryApi, fetchApi, enabled, owner, appName, appType, env, tier, cluster, XR_CLUSTER, tenantsRepo?.owner, tenantsRepo?.repo, devLinks?.infisicalUrl, platform.clusters]);
  const requestPr = extra.requestPr ?? (target.knownRequestUrl ? { number: Number(target.knownRequestUrl.split("/").pop()) || 0, url: target.knownRequestUrl, state: "open" } : void 0);
  const steps = deriveEnvLifecycle({
    tier,
    env,
    declared: target.declared,
    cicdPrUrl: target.cicdPrUrl,
    deployed: target.deployed,
    valuesFileExists: target.valuesFileExists,
    tenantsRepoUrl: tenantsRepo ? `https://github.com/${tenantsRepo.owner}/${tenantsRepo.repo}` : void 0,
    gitopsRepoUrl: `https://github.com/${owner}/${repos?.gitopsRepo}`,
    valuesFileUrl: tier === "flight" && cluster ? `https://github.com/${owner}/${repos?.gitopsRepo}/blob/main/${cluster}/${env}/values.yaml` : `https://github.com/${owner}/${repos?.configRepo}/blob/main/${target.valuesFilePath ?? `${ENVS_ROOT}/envs/${env}.yaml`}`,
    valuesFilePath: target.valuesFilePath,
    pipelineStep: target.pipelineStep,
    ...extra,
    requestPr
  });
  return { steps, loading };
}

export { useEnvLifecycle };
//# sourceMappingURL=useEnvLifecycle.esm.js.map
