import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy.esm.js';
import { infisicalProjectUrl } from '../provisioning/deriveProvisioning.esm.js';
import { TENANTS_REPO_BY_CLUSTER, XR_CLUSTER, toManaged, toSecrets, toOnboardingPrs } from '../provisioning/useProvisioning.esm.js';
import { deriveEnvLifecycle } from './lifecycle.esm.js';

const POLL_MS = 8e3;
const GITHUB_POLL_MS = 45e3;
function useEnvLifecycle(target, enabled) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [extra, setExtra] = useState({});
  const [loading, setLoading] = useState(enabled);
  const { owner, appName, env, tier, cluster } = target;
  useEffect(() => {
    if (!enabled) return void 0;
    let cancelled = false;
    const github = { at: 0, busy: false };
    const xrName = `${appName}-${cluster}-${env}`;
    const ns = `app-${appName}-cicd`;
    const tenants = TENANTS_REPO_BY_CLUSTER[XR_CLUSTER];
    const optional = async (path) => {
      try {
        return await k8sProxyGet(discoveryApi, fetchApi, XR_CLUSTER, path);
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
        if (tier === "flight" && tenants) {
          const r = await getJson(
            `${prBase}/request-pr?${new URLSearchParams({ owner: tenants.owner, repo: tenants.repo, kind: "ApplicationEnvironment", name: xrName })}`
          );
          if (r?.pr) github.requestPr = r.pr;
        }
        if (tier === "ground") {
          const prs = await getJson(
            `${prBase}/pull-requests?${new URLSearchParams({ owner, appName })}`
          );
          if (prs) github.onboardingPr = toOnboardingPrs(prs).source;
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
        const [xr, files, stores] = await Promise.all([
          optional(`${nsBase}/applicationenvironments/${encodeURIComponent(xrName)}`),
          optional(`/apis/repo.github.m.upbound.io/v1alpha1/namespaces/${ns}/repositoryfiles?${selector}`),
          optional(`${nsBase}/secretstores`)
        ]);
        if (xr) {
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
        const store = stores?.items?.find((s) => s.metadata.name === xrName);
        next.secrets = toSecrets(store, stores !== void 0);
        if (store) {
          const projects = await optional(
            `/apis/project.infisical.m.hangar.io/v1alpha1/namespaces/${ns}/projects`
          );
          const id2 = projects?.items?.find((p) => p.metadata.name === store.metadata.name)?.metadata.annotations?.["crossplane.io/external-name"];
          if (id2) next.infisicalUrl = infisicalProjectUrl(XR_CLUSTER, id2);
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
  const requestPr = extra.requestPr ?? (target.knownRequestUrl ? { number: Number(target.knownRequestUrl.split("/").pop()) || 0, url: target.knownRequestUrl, state: "open" } : void 0);
  const steps = deriveEnvLifecycle({
    tier,
    env,
    declared: target.declared,
    cicdPrUrl: target.cicdPrUrl,
    deployed: target.deployed,
    valuesFileExists: target.valuesFileExists,
    tenantsRepoUrl: TENANTS_REPO_BY_CLUSTER[XR_CLUSTER] ? `https://github.com/${TENANTS_REPO_BY_CLUSTER[XR_CLUSTER].owner}/${TENANTS_REPO_BY_CLUSTER[XR_CLUSTER].repo}` : void 0,
    gitopsRepoUrl: `https://github.com/${owner}/gitops-${appName}`,
    valuesFileUrl: tier === "flight" && cluster ? `https://github.com/${owner}/gitops-${appName}/blob/main/${cluster}/${env}/values.yaml` : `https://github.com/${owner}/${appName}/blob/main/platform/envs/${env}.yaml`,
    ...extra,
    requestPr
  });
  return { steps, loading };
}

export { useEnvLifecycle };
//# sourceMappingURL=useEnvLifecycle.esm.js.map
