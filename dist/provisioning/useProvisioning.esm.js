import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy.esm.js';
import { TEKTON_CLUSTER } from '../tekton/useTektonPipelineRuns.esm.js';
import { deriveProvisioning } from './deriveProvisioning.esm.js';

const XR_CLUSTER = TEKTON_CLUSTER;
const XR_PLURALS = ["nodejsapplications", "springbootapplications", "pythonapplications", "goapplications"];
const POLL_MS = 6e3;
const MAX_AGE_MS = 24 * 3600 * 1e3;
const KEEP_DONE_MS = 15 * 60 * 1e3;
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
function toRollout(r) {
  return {
    phase: r.status?.phase,
    desired: r.spec?.replicas ?? 1,
    available: r.status?.availableReplicas ?? 0,
    createdAt: epoch(r.metadata.creationTimestamp)
  };
}
function useProvisioning() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    items: [],
    loading: true
  });
  useEffect(() => {
    let cancelled = false;
    const optional = async (path) => {
      try {
        return await k8sProxyGet(discoveryApi, fetchApi, XR_CLUSTER, path);
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
          kind: x.kind ?? XR_PLURALS[i]
        })) : []
      ).filter((x) => now - Date.parse(x.metadata.creationTimestamp) < MAX_AGE_MS);
      const items = await Promise.all(
        xrs.map(async (x) => {
          const name = x.metadata.name;
          const selector = `labelSelector=${encodeURIComponent(`crossplane.io/composite=${name}`)}`;
          const mrBase = `/apis/repo.github.m.upbound.io/v1alpha1/namespaces/${x.metadata.namespace}`;
          const [runs, rollouts, repos, files] = await Promise.all([
            optional(`/apis/tekton.dev/v1/namespaces/app-${name}-cicd/pipelineruns`),
            optional(`/apis/argoproj.io/v1alpha1/namespaces/app-${name}-dev/rollouts`),
            optional(`${mrBase}/repositories?${selector}`),
            optional(`${mrBase}/repositoryfiles?${selector}`)
          ]);
          const first = [...runs?.items ?? []].sort(
            (a, b) => a.metadata.creationTimestamp.localeCompare(b.metadata.creationTimestamp)
          )[0];
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
            managed: toManaged(x.spec?.crossplane?.resourceRefs, [...repos?.items ?? [], ...files?.items ?? []])
          };
        })
      );
      if (cancelled) return;
      const kept = items.filter((i) => {
        const p = deriveProvisioning(i, now);
        if (p.stalled) return false;
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
  }, [discoveryApi, fetchApi]);
  return state;
}

export { toBuild, toManaged, toRollout, useProvisioning };
//# sourceMappingURL=useProvisioning.esm.js.map
