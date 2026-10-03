import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { k8sProxyGet } from '../k8sProxy.esm.js';
import { TEKTON_CLUSTER } from '../tekton/useTektonPipelineRuns.esm.js';
import { deriveProvisioning } from './deriveProvisioning.esm.js';

const XR_CLUSTER = TEKTON_CLUSTER;
const XR_PLURALS = ["nodejsapplications", "springbootapplications", "pythonapplications", "goapplications"];
const XR_KINDS = ["NodeJSApplication", "SpringBootApplication", "PythonApplication", "GoApplication"];
const TENANTS_REPO_BY_CLUSTER = {
  "kind-dev": { owner: "jfillman", repo: "gitops-cluster-dev-tenants" }
};
const POLL_MS = 6e3;
const MAX_AGE_MS = 24 * 3600 * 1e3;
const GITHUB_POLL_MS = 45e3;
const KEEP_DONE_MS = 15 * 60 * 1e3;
const BUILD_PIPELINE = "build";
function pickFirstBuild(runs) {
  return [...runs ?? []].filter((r) => r.metadata.labels?.["tekton.dev/pipeline"] === BUILD_PIPELINE).sort((a, b) => a.metadata.creationTimestamp.localeCompare(b.metadata.creationTimestamp))[0];
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
    const ready = byName.get(name)?.status?.conditions?.find((c) => c.type === "Ready");
    return { name, ready: ready?.status === "True", readyAt: epoch(ready?.lastTransitionTime) };
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
function toRepoLinks(name, repos) {
  const urlOf = (suffix) => repos.find((r) => r.metadata.name === `${name}-${suffix}`)?.status?.atProvider;
  const src = urlOf("src");
  const gitops = urlOf("gitops");
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
    links: { requestPr: { number: r.number, url: r.url, state: r.state, mergedAt: epoch(r.mergedAt) } }
  }));
}
function useProvisioning() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const catalogApi = useApi(catalogApiRef);
  const [state, setState] = useState({
    items: [],
    loading: true
  });
  useEffect(() => {
    let cancelled = false;
    const github = /* @__PURE__ */ new Map();
    const refreshGithub = (x, owner, tenants) => {
      const name = x.metadata.name;
      const entry = github.get(name) ?? { at: 0, busy: false, requestTries: 0 };
      github.set(name, entry);
      const bothMerged = entry.onboarding?.source?.state === "merged" && entry.onboarding.gitops?.state === "merged";
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
        } catch {
        } finally {
          pendingCache.at = Date.now();
          pendingCache.busy = false;
        }
      })();
    };
    const optional = async (path) => {
      try {
        return await k8sProxyGet(discoveryApi, fetchApi, XR_CLUSTER, path);
      } catch {
        return void 0;
      }
    };
    const inCatalog = async (name) => {
      try {
        const res = await catalogApi.getEntities({
          filter: { kind: "Component", "metadata.name": name },
          fields: ["metadata.name"]
        });
        return { found: res.items.length > 0 };
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
          const selector = `labelSelector=${encodeURIComponent(`crossplane.io/composite=${name}`)}`;
          const mrBase = `/apis/repo.github.m.upbound.io/v1alpha1/namespaces/${x.metadata.namespace}`;
          const nsBase = `/apis/catalog.hangar.io/v1alpha1/namespaces/${x.metadata.namespace}`;
          const [runs, rollouts, repos, files, stores, cicds, catalog] = await Promise.all([
            optional(`/apis/tekton.dev/v1/namespaces/app-${name}-cicd/pipelineruns`),
            optional(`/apis/argoproj.io/v1alpha1/namespaces/app-${name}-dev/rollouts`),
            optional(`${mrBase}/repositories?${selector}`),
            optional(`${mrBase}/repositoryfiles?${selector}`),
            optional(`${nsBase}/secretstores`),
            optional(`${nsBase}/tektoncicds`),
            inCatalog(name)
          ]);
          const store = stores?.items?.find((s) => s.spec?.appRef?.name === name);
          const project = store ? await optional(
            `/apis/project.infisical.m.hangar.io/v1alpha1/namespaces/${x.metadata.namespace}/projects`
          ) : void 0;
          const projectId = project?.items?.find((p) => p.metadata.name === store?.metadata.name)?.metadata.annotations?.["crossplane.io/external-name"];
          const repoLinks = toRepoLinks(name, repos?.items ?? []);
          const tenants = parseTenantsRepo(x.metadata.annotations?.["terasky.backstage.io/source-info"]);
          refreshGithub(x, repoLinks.owner ?? tenants?.owner, tenants);
          const gh = github.get(name);
          const first = pickFirstBuild(runs?.items);
          return {
            xr: {
              kind: x.kind ?? "",
              name,
              namespace: x.metadata.namespace,
              cluster: XR_CLUSTER,
              createdAt: Date.parse(x.metadata.creationTimestamp),
              conditions: x.status?.conditions ?? []
            },
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
            links: {
              requestPr: gh?.requestPr,
              sourceRepoUrl: repoLinks.sourceRepoUrl,
              gitopsRepoUrl: repoLinks.gitopsRepoUrl,
              onboarding: gh?.onboarding,
              infisicalProjectId: projectId
            }
          };
        })
      );
      if (cancelled) return;
      refreshPending(
        xrs.map((x) => parseTenantsRepo(x.metadata.annotations?.["terasky.backstage.io/source-info"])).find(Boolean) ?? TENANTS_REPO_BY_CLUSTER[XR_CLUSTER]
      );
      items.push(...toPendingInputs(pendingCache.list, new Set(xrs.map((x) => x.metadata.name)), XR_CLUSTER, now));
      const kept = items.filter((i) => {
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
  }, [discoveryApi, fetchApi, catalogApi]);
  return state;
}

export { BUILD_PIPELINE, parseTenantsRepo, pickFirstBuild, toBuild, toCreated, toManaged, toOnboardingPrs, toPendingInputs, toRepoLinks, toRollout, toSecrets, useProvisioning };
//# sourceMappingURL=useProvisioning.esm.js.map
