import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { k8sProxyGet } from '../k8sProxy.esm.js';
import { fetchLiveRuns } from '../tekton/liveRuns.esm.js';
import { toPipelineRunSummary } from '../tekton/useTektonPipelineRuns.esm.js';
import { summarizeCloudDeploys } from '../cloudDeploy.esm.js';
import { usePlatformConfig, NO_CONTROL_PLANE } from '../platformConfig.esm.js';
import { INFRA_KIND, isCloudApp, deriveProvisioning } from './deriveProvisioning.esm.js';
import { updateObservation } from './observed.esm.js';
import { appRepos } from '../appRepos.esm.js';

const XR_PLURALS = [
  "nodejsapplications",
  "springbootapplications",
  "pythonapplications",
  "goapplications",
  "lambdafunctions",
  "azurefunctions",
  "infraservices"
];
const XR_KINDS = [
  "NodeJSApplication",
  "SpringBootApplication",
  "PythonApplication",
  "GoApplication",
  "LambdaFunction",
  "AzureFunction",
  INFRA_KIND
];
const POLL_MS = 6e3;
const MAX_AGE_MS = 24 * 3600 * 1e3;
const GITHUB_POLL_MS = 45e3;
const KEEP_DONE_MS = 15 * 60 * 1e3;
function toCloudDeploySnapshot(runs, taskRuns, cluster = "") {
  if (!runs?.length) return void 0;
  const byName = new Map((taskRuns ?? []).map((t) => [t.metadata.name, t]));
  const summary = summarizeCloudDeploys(runs.map((r2) => toPipelineRunSummary(r2, cluster, byName)));
  const pick = summary.inFlight ?? summary.latestFailure ?? summary.current;
  if (!pick) return void 0;
  let state = "succeeded";
  if (pick === summary.inFlight) state = "running";
  else if (pick === summary.latestFailure) state = "failed";
  const r = pick.resource;
  return {
    state,
    label: pick.targetLabel,
    resource: r ? `${r.kind} ${r.name}` : void 0,
    completedAt: pick.completionTime ? Date.parse(pick.completionTime) : void 0,
    failure: pick.failure ? [pick.failure.task, pick.failure.message].filter(Boolean).join(": ") : void 0,
    consoleUrl: pick.consoleUrl
  };
}
const BUILD_PIPELINE = "build";
function pickFirstBuild(runs) {
  return [...runs ?? []].filter((r) => r.metadata.labels?.["tekton.dev/pipeline"] === BUILD_PIPELINE).sort((a, b) => (a.metadata.creationTimestamp ?? "").localeCompare(b.metadata.creationTimestamp ?? ""))[0];
}
const epoch = (iso) => iso ? Date.parse(iso) : void 0;
function toBuild(run) {
  const succeeded = run.status?.conditions?.find((c) => c.type === "Succeeded");
  let phase = "pending";
  if (succeeded?.status === "True") phase = "succeeded";
  else if (succeeded?.status === "False") phase = "failed";
  else if (run.status?.startTime) phase = "running";
  const total = run.status?.pipelineSpec?.tasks?.length ?? 0;
  const created = run.status?.childReferences?.length ?? 0;
  const done = phase === "succeeded" ? total : Math.max(0, created - (phase === "running" ? 1 : 0));
  return {
    name: run.metadata.name,
    phase,
    startedAt: epoch(run.status?.startTime),
    completedAt: epoch(run.status?.completionTime),
    tasksDone: done,
    tasksTotal: total
  };
}
const GITHUB_KINDS = /* @__PURE__ */ new Set(["Repository", "RepositoryFile"]);
function toManaged(refs, found) {
  const byName = new Map(found.map((m) => [m.metadata.name, m]));
  const expected = (refs ?? []).filter((r) => GITHUB_KINDS.has(r.kind)).map((r) => r.name);
  const names = expected.length > 0 ? expected : found.map((m) => m.metadata.name);
  if (names.length === 0 || found.length === 0) return void 0;
  return names.map((name) => {
    const conds = byName.get(name)?.status?.conditions;
    const ready = conds?.find((c) => c.type === "Ready");
    const synced = conds?.find((c) => c.type === "Synced");
    return {
      name,
      ready: ready?.status === "True",
      readyAt: epoch(ready?.lastTransitionTime),
      error: synced?.status === "False" ? synced.message ?? synced.reason : void 0
    };
  });
}
function parseTenantsRepo(sourceInfo) {
  if (!sourceInfo) return void 0;
  try {
    const gitRepo = JSON.parse(sourceInfo).gitRepo;
    const params = new URLSearchParams(gitRepo?.split("?")[1] ?? "");
    const owner = params.get("owner");
    const repo = params.get("repo");
    return owner && repo ? { owner, repo } : void 0;
  } catch {
    return void 0;
  }
}
function toRepoLinks(name, repos, repoNames = appRepos(name, "app")) {
  const repoOf = (r) => r.status?.atProvider?.fullName?.split("/")[1] ?? r.metadata.annotations?.["crossplane.io/external-name"];
  const urlOf = (suffix, repo) => (repos.find((r) => r.metadata.name === `${name}-${suffix}`) ?? (repo ? repos.find((r) => repoOf(r) === repo) : void 0))?.status?.atProvider;
  const src = repoNames.sourceRepo ? urlOf("src", repoNames.sourceRepo) : void 0;
  const gitops = urlOf("gitops", repoNames.gitopsRepo);
  const fullName = src?.fullName ?? gitops?.fullName;
  return {
    owner: fullName?.split("/")[0],
    sourceRepoUrl: src?.htmlUrl,
    gitopsRepoUrl: gitops?.htmlUrl
  };
}
function toSecrets(store, missing) {
  if (!store) return missing ? { found: false, ready: false } : void 0;
  const cond = (type) => store.status?.conditions?.find((c) => c.type === type);
  const ready = cond("Ready");
  const synced = cond("Synced");
  return {
    found: true,
    ready: ready?.status === "True",
    readyAt: epoch(ready?.lastTransitionTime),
    failed: synced?.status === "False" ? synced.message ?? synced.reason ?? "sync failed" : void 0
  };
}
function latestOnboardingPr(prs) {
  const mine = prs.filter((p) => p.repo === "source" && p.title.startsWith("Onboarding:")).sort((a, b) => b.number - a.number);
  const hit = mine.find((p) => p.state === "open") ?? mine[0];
  return hit && { number: hit.number, url: hit.url, state: hit.state, mergedAt: epoch(hit.mergedAt) };
}
function toOnboardingPrs(prs) {
  const pick = (repo) => {
    const mine = prs.filter((p) => p.repo === repo && p.title.startsWith("Onboarding:"));
    const merged = mine.filter((p) => p.state === "merged").sort((a, b) => (a.mergedAt ?? "").localeCompare(b.mergedAt ?? ""))[0];
    const hit = merged ?? mine.find((p) => p.state === "open");
    return hit && { number: hit.number, url: hit.url, state: hit.state, mergedAt: epoch(hit.mergedAt) };
  };
  return { source: pick("source"), gitops: pick("gitops") };
}
function toCreated(refs, readable, store) {
  const readyOf = new Map(
    readable.map((m) => [m.metadata.name, m.status?.conditions?.find((c) => c.type === "Ready")?.status === "True"])
  );
  const out = (refs ?? []).map((r) => ({ kind: r.kind, name: r.name, ready: readyOf.get(r.name) }));
  if (store) out.push({ kind: "SecretStore", name: store.name, ready: store.ready });
  return out;
}
function firstEnvOf(values, devCluster) {
  const envs = values?.deploy?.environments;
  const first = Array.isArray(envs) ? envs[0] : void 0;
  if (typeof first?.name === "string") {
    if (first.tier === "flight" && typeof first.cluster === "string" && first.cluster) {
      return { name: first.name, cluster: first.cluster, tier: "flight" };
    }
    if (first.tier !== "flight") return { name: first.name, cluster: devCluster, tier: "ground" };
  }
  return { name: "dev", cluster: devCluster, tier: "ground" };
}
function toRollout(r) {
  return {
    phase: r.status?.phase,
    desired: r.spec?.replicas ?? 1,
    available: r.status?.availableReplicas ?? 0,
    createdAt: epoch(r.metadata.creationTimestamp)
  };
}
function toPendingInputs(requests, haveXr, cluster, now) {
  return requests.filter((r) => XR_KINDS.includes(r.kind) && !haveXr.has(r.name)).map((r) => ({ r, created: epoch(r.createdAt) ?? now })).filter(({ created }) => now - created < MAX_AGE_MS).map(({ r, created }) => ({
    xr: { kind: r.kind, name: r.name, namespace: "", cluster, createdAt: created, conditions: [], pending: true },
    links: { requestPr: toRequestPr(r) }
  }));
}
function toRequestPr(r) {
  return { number: r.number, url: r.url, state: r.state, createdAt: epoch(r.createdAt), mergedAt: epoch(r.mergedAt) };
}
function mergeRequestPr(live, remembered) {
  if (!live) return remembered;
  if (!remembered) return live;
  return {
    ...live,
    createdAt: live.createdAt ?? remembered.createdAt,
    mergedAt: live.mergedAt ?? remembered.mergedAt
  };
}
function toArgoSnapshot(name, app) {
  return {
    name,
    sync: app?.status?.sync?.status,
    health: app?.status?.health?.status,
    healthSince: epoch(app?.status?.health?.lastTransitionTime),
    missing: app === void 0 ? true : void 0
  };
}
function toFoundArgoSnapshot(name, instances) {
  const app = (instances ?? []).flatMap((i) => i.applications ?? []).find((a) => !a.metadata?.name || a.metadata.name === name);
  return toArgoSnapshot(name, app);
}
const CATALOG_RECHECK_MS = 3e4;
function useProvisioning() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const catalogApi = useApi(catalogApiRef);
  const platform = usePlatformConfig();
  const XR_CLUSTER = platform.controlPlaneCluster;
  const configuredTenants = XR_CLUSTER ? platform.clusters[XR_CLUSTER]?.tenantsRepo : void 0;
  const [state, setState] = useState({
    items: [],
    loading: true
  });
  useEffect(() => {
    if (!XR_CLUSTER) {
      setState({ items: [], loading: false, error: NO_CONTROL_PLANE });
      return void 0;
    }
    let cancelled = false;
    const github = /* @__PURE__ */ new Map();
    const refreshGithub = (x, owner, tenants) => {
      const name = x.metadata.name;
      const entry = github.get(name) ?? { at: 0, busy: false, requestTries: 0 };
      github.set(name, entry);
      const cloudApp = isCloudApp({ kind: x.kind ?? "", deployTarget: x.spec?.deployTarget });
      const bothMerged = x.kind === INFRA_KIND || entry.onboarding?.source?.state === "merged" && (cloudApp || entry.onboarding.gitops?.state === "merged");
      const wantsRequest = !entry.requestPr && entry.requestTries < 3 && Boolean(tenants);
      if (entry.busy || Date.now() - entry.at < GITHUB_POLL_MS || bothMerged && !wantsRequest) return;
      entry.busy = true;
      (async () => {
        try {
          const prBase = await discoveryApi.getBaseUrl("pull-requests");
          const get = async (url) => {
            try {
              const res = await fetchApi.fetch(url);
              return res.ok ? await res.json() : void 0;
            } catch {
              return void 0;
            }
          };
          const [request, prs] = await Promise.all([
            wantsRequest && tenants ? get(
              `${prBase}/request-pr?${new URLSearchParams({ owner: tenants.owner, repo: tenants.repo, kind: x.kind ?? "", name })}`
            ) : void 0,
            owner && !bothMerged ? get(`${prBase}/pull-requests?${new URLSearchParams({ owner, appName: name })}`) : void 0
          ]);
          if (request) entry.requestTries += 1;
          if (request?.pr) entry.requestPr = request.pr;
          if (prs) entry.onboarding = toOnboardingPrs(prs);
        } catch {
        } finally {
          entry.at = Date.now();
          entry.busy = false;
        }
      })();
    };
    const pendingCache = { at: 0, busy: false, list: [] };
    const requestMemo = /* @__PURE__ */ new Map();
    const observedMemo = /* @__PURE__ */ new Map();
    const refreshPending = (tenants) => {
      if (!tenants || pendingCache.busy || Date.now() - pendingCache.at < GITHUB_POLL_MS) return;
      pendingCache.busy = true;
      (async () => {
        try {
          const prBase = await discoveryApi.getBaseUrl("pull-requests");
          const res = await fetchApi.fetch(
            `${prBase}/pending-requests?${new URLSearchParams({ owner: tenants.owner, repo: tenants.repo })}`
          );
          if (res.ok) pendingCache.list = (await res.json()).requests ?? [];
          pendingCache.list.forEach((r) => requestMemo.set(r.name, toRequestPr(r)));
        } catch {
        } finally {
          pendingCache.at = Date.now();
          pendingCache.busy = false;
        }
      })();
    };
    const optional = async (path, cluster = XR_CLUSTER) => {
      try {
        return await k8sProxyGet(discoveryApi, fetchApi, cluster, path);
      } catch {
        return void 0;
      }
    };
    const catalogSeen = /* @__PURE__ */ new Map();
    const inCatalog = async (name) => {
      const seen = catalogSeen.get(name);
      if (seen && (seen.found || Date.now() - seen.at < CATALOG_RECHECK_MS)) return { found: seen.found };
      try {
        const res = await catalogApi.getEntities({
          filter: { kind: "Component", "metadata.name": name },
          fields: ["metadata.name"]
        });
        catalogSeen.set(name, { found: res.items.length > 0, at: Date.now() });
        return { found: res.items.length > 0 };
      } catch {
        return void 0;
      }
    };
    const cicdApp = async (name) => {
      const appName = `${name}-cicd`;
      try {
        const app = await k8sProxyGet(
          discoveryApi,
          fetchApi,
          XR_CLUSTER,
          `/apis/argoproj.io/v1alpha1/namespaces/argocd/applications/${encodeURIComponent(appName)}`
        );
        return toArgoSnapshot(appName, app);
      } catch (e) {
        return /not found/i.test(String(e?.message)) ? toArgoSnapshot(appName, void 0) : void 0;
      }
    };
    const firstEnvs = /* @__PURE__ */ new Map();
    const refreshFirstEnv = (name, owner) => {
      const entry = firstEnvs.get(name) ?? { at: 0, busy: false };
      firstEnvs.set(name, entry);
      if (!owner || entry.env || entry.busy || Date.now() - entry.at < GITHUB_POLL_MS) return;
      entry.busy = true;
      (async () => {
        try {
          const base = await discoveryApi.getBaseUrl("glidepath");
          const res = await fetchApi.fetch(`${base}/config/cicd?${new URLSearchParams({ owner, appName: name })}`);
          const body = res.ok ? await res.json() : void 0;
          if (body?.raw) entry.env = firstEnvOf(body.values, XR_CLUSTER);
        } catch {
        } finally {
          entry.at = Date.now();
          entry.busy = false;
        }
      })();
    };
    const envApp = async (name) => {
      const appName = `${name}-dev`;
      try {
        const base = await discoveryApi.getBaseUrl("argocd");
        const res = await fetchApi.fetch(`${base}/find/name/${encodeURIComponent(appName)}?expand=applications`);
        if (res.status === 404) return toArgoSnapshot(appName, void 0);
        if (!res.ok) return void 0;
        return toFoundArgoSnapshot(appName, await res.json());
      } catch {
        return void 0;
      }
    };
    const load = async () => {
      const lists = await Promise.allSettled(
        XR_PLURALS.map(
          (p) => k8sProxyGet(discoveryApi, fetchApi, XR_CLUSTER, `/apis/catalog.hangar.io/v1alpha1/${p}`)
        )
      );
      if (cancelled) return;
      if (lists.every((l) => l.status === "rejected")) {
        const reason = lists[0].reason;
        setState({
          items: [],
          loading: false,
          error: String(reason?.message ?? reason)
        });
        return;
      }
      const now = Date.now();
      const xrs = lists.flatMap(
        (l, i) => l.status === "fulfilled" ? (l.value.items ?? []).map((x) => ({
          ...x,
          kind: x.kind ?? XR_KINDS[i]
        })) : []
      ).filter((x) => now - Date.parse(x.metadata.creationTimestamp) < MAX_AGE_MS);
      const items = await Promise.all(
        xrs.map(async (x) => {
          const name = x.metadata.name;
          const infra = x.kind === INFRA_KIND;
          const names = appRepos(name, infra ? "infra" : "app");
          const firstEnv = firstEnvs.get(name)?.env;
          const envNs = `app-${name}-${firstEnv?.name ?? "dev"}`;
          const envCluster = firstEnv?.cluster ?? XR_CLUSTER;
          const selector = `labelSelector=${encodeURIComponent(`crossplane.io/composite=${name}`)}`;
          const mrBase = `/apis/repo.github.m.upbound.io/v1alpha1/namespaces/${x.metadata.namespace}`;
          const nsBase = `/apis/catalog.hangar.io/v1alpha1/namespaces/${x.metadata.namespace}`;
          const [runs, rollouts, repos, files, stores, cicds, catalog, cicdArgo, envArgo] = await Promise.all([
            // The app's runs from glidepath-api (tekton/liveRuns.ts; P6b). A new app may not be resolvable yet.
            infra ? void 0 : fetchLiveRuns({ discoveryApi, fetchApi }, name).catch(() => void 0),
            infra ? void 0 : optional(
              `/apis/argoproj.io/v1alpha1/namespaces/${envNs}/rollouts`,
              envCluster
            ),
            optional(`${mrBase}/repositories?${selector}`),
            optional(`${mrBase}/repositoryfiles?${selector}`),
            optional(`${nsBase}/secretstores`),
            optional(`${nsBase}/tektoncicds`),
            inCatalog(name),
            cicdApp(name),
            infra ? envApp(name) : void 0
          ]);
          const store = stores?.items?.find((s) => s.spec?.appRef?.name === name);
          const project = store ? await optional(
            `/apis/project.infisical.m.hangar.io/v1alpha1/namespaces/${x.metadata.namespace}/projects`
          ) : void 0;
          const projectId = project?.items?.find((p) => p.metadata.name === store?.metadata.name)?.metadata.annotations?.["crossplane.io/external-name"];
          const repoLinks = toRepoLinks(name, repos?.items ?? [], names);
          const tenants = parseTenantsRepo(x.metadata.annotations?.["terasky.backstage.io/source-info"]);
          refreshGithub(x, repoLinks.owner ?? tenants?.owner, tenants);
          if (!infra && !isCloudApp({ kind: x.kind ?? "", deployTarget: x.spec?.deployTarget })) {
            refreshFirstEnv(name, repoLinks.owner ?? tenants?.owner);
          }
          const gh = github.get(name);
          const first = pickFirstBuild(runs?.pipelineRuns);
          const deployRuns = (runs?.pipelineRuns ?? []).filter((r) => r.metadata.labels?.["tekton.dev/pipeline"] === "deploy");
          const cloudDeploy = deployRuns.length ? toCloudDeploySnapshot(
            deployRuns,
            runs?.taskRuns,
            XR_CLUSTER
          ) : void 0;
          return {
            xr: {
              kind: x.kind ?? "",
              name,
              namespace: x.metadata.namespace,
              cluster: XR_CLUSTER,
              createdAt: Date.parse(x.metadata.creationTimestamp),
              conditions: x.status?.conditions ?? [],
              deployTarget: x.spec?.deployTarget
            },
            firstEnv,
            build: first ? toBuild(first) : void 0,
            rollout: rollouts?.items?.[0] ? toRollout(rollouts.items[0]) : void 0,
            managed: toManaged(x.spec?.crossplane?.resourceRefs, [...repos?.items ?? [], ...files?.items ?? []]),
            created: toCreated(
              x.spec?.crossplane?.resourceRefs,
              [...repos?.items ?? [], ...files?.items ?? [], ...cicds?.items ?? []],
              store ? {
                name: store.metadata.name,
                ready: store.status?.conditions?.some((c) => c.type === "Ready" && c.status === "True") ?? false
              } : void 0
            ),
            secrets: toSecrets(store, stores !== void 0),
            catalog,
            cicdApp: cicdArgo,
            cloudDeploy,
            envApp: envArgo,
            links: {
              requestPr: mergeRequestPr(gh?.requestPr, requestMemo.get(name)),
              sourceRepoUrl: repoLinks.sourceRepoUrl,
              gitopsRepoUrl: repoLinks.gitopsRepoUrl,
              onboarding: gh?.onboarding,
              infisicalProjectId: projectId,
              infisicalUrl: platform.clusters[XR_CLUSTER]?.infisicalUrl
            }
          };
        })
      );
      if (cancelled) return;
      refreshPending(
        xrs.map((x) => parseTenantsRepo(x.metadata.annotations?.["terasky.backstage.io/source-info"])).find(Boolean) ?? configuredTenants
      );
      items.push(...toPendingInputs(pendingCache.list, new Set(xrs.map((x) => x.metadata.name)), XR_CLUSTER, now));
      const withObserved = items.map((i) => {
        const prior = observedMemo.get(i.xr.name);
        const current = deriveProvisioning({ ...i, observed: prior }, now);
        const next = updateObservation(prior, current.steps, now);
        observedMemo.set(i.xr.name, next);
        return { ...i, observed: next };
      });
      const kept = withObserved.filter((i) => {
        const p = deriveProvisioning(i, now);
        return !p.complete || p.completedAt !== void 0 && now - p.completedAt < KEEP_DONE_MS;
      });
      kept.sort((a, b) => b.xr.createdAt - a.xr.createdAt);
      setState({ items: kept, loading: false });
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [discoveryApi, fetchApi, catalogApi, XR_CLUSTER, configuredTenants?.owner, configuredTenants?.repo]);
  return state;
}

export { BUILD_PIPELINE, firstEnvOf, latestOnboardingPr, mergeRequestPr, parseTenantsRepo, pickFirstBuild, toArgoSnapshot, toBuild, toCloudDeploySnapshot, toCreated, toFoundArgoSnapshot, toManaged, toOnboardingPrs, toPendingInputs, toRepoLinks, toRequestPr, toRollout, toSecrets, useProvisioning };
//# sourceMappingURL=useProvisioning.esm.js.map
