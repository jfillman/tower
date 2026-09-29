import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { k8sProxyGet } from './k8sProxy.esm.js';

const POLL_MS = 4e3;
function ownedBy(o, kind, name) {
  return Boolean(o.metadata.ownerReferences?.some((r) => r.kind === kind && r.name === name));
}
function toPod(obj, rsName) {
  const conds = obj.status?.conditions ?? [];
  return {
    obj,
    rsName,
    ready: conds.some((c) => c.type === "Ready" && c.status === "True"),
    terminating: Boolean(obj.metadata.deletionTimestamp),
    phase: obj.status?.phase ?? "Unknown",
    containers: (obj.spec?.containers ?? []).map((c) => c.name)
  };
}
function stamp(items, apiVersion, kind) {
  return items.map((o) => ({ apiVersion, kind, ...o }));
}
function buildTopology(rollout, rss, pods, services, ars, jobs, stepWeight) {
  const name = rollout.metadata.name;
  const currentHash = rollout.status?.currentPodHash;
  const stableHash = rollout.status?.canary?.stableRS ?? rollout.status?.stableRS;
  const inFlight = Boolean(currentHash && stableHash && currentHash !== stableHash);
  const replicaSets = rss.filter((rs) => ownedBy(rs, "Rollout", name)).map((rs) => {
    const hash = rs.metadata.labels?.["rollouts-pod-template-hash"] ?? rs.metadata.labels?.["pod-template-hash"] ?? "";
    const rsPods = pods.filter((p) => ownedBy(p, "ReplicaSet", rs.metadata.name)).map((p) => toPod(p, rs.metadata.name));
    let role = "unknown";
    if (hash && hash === stableHash) role = "stable";
    else if (hash && hash === currentHash) role = "canary";
    return {
      obj: rs,
      role,
      hash,
      replicas: rs.spec?.replicas ?? 0,
      ready: rs.status?.readyReplicas ?? 0,
      pods: rsPods
    };
  }).filter((rs) => rs.replicas > 0 || rs.pods.length > 0).sort((a, b) => Number(b.role === "stable") - Number(a.role === "stable"));
  const weights = rollout.status?.canary?.weights;
  const weight = inFlight ? Number(weights?.canary?.weight ?? stepWeight ?? 0) : 0;
  const stableSvc = rollout.spec?.strategy?.canary?.stableService;
  const service = services.find((s) => s.metadata.name === stableSvc) ?? services.find((s) => s.metadata.name === name) ?? services[0];
  const analysisRuns = ars.filter((ar) => ownedBy(ar, "Rollout", name)).filter((ar) => !currentHash || ar.metadata.labels?.["rollouts-pod-template-hash"] === currentHash).map((ar) => {
    const myJobs = jobs.filter((j) => ownedBy(j, "AnalysisRun", ar.metadata.name));
    const arPods = myJobs.flatMap((j) => pods.filter((p) => ownedBy(p, "Job", j.metadata.name)).map((p) => toPod(p, ar.metadata.name)));
    return { obj: ar, phase: ar.status?.phase ?? "Pending", pods: arPods };
  }).sort((a, b) => new Date(a.obj.metadata.creationTimestamp ?? 0).getTime() - new Date(b.obj.metadata.creationTimestamp ?? 0).getTime());
  return { rollout, service, replicaSets, analysisRuns, canaryWeight: Math.max(0, Math.min(100, weight)), canaryInFlight: inFlight };
}
function useRolloutTopology(target) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({ loading: Boolean(target) });
  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return void 0;
    }
    let cancelled = false;
    let timer;
    const { cluster, namespace, rolloutName, stepWeight } = target;
    async function tick() {
      const get = (path) => k8sProxyGet(discoveryApi, fetchApi, cluster, path);
      try {
        const [rollout, rss, pods, svcs, ars, jobs] = await Promise.all([
          get(`/apis/argoproj.io/v1alpha1/namespaces/${namespace}/rollouts/${rolloutName}`),
          get(`/apis/apps/v1/namespaces/${namespace}/replicasets`),
          get(`/api/v1/namespaces/${namespace}/pods`),
          get(`/api/v1/namespaces/${namespace}/services`).catch(() => ({ items: [] })),
          get(`/apis/argoproj.io/v1alpha1/namespaces/${namespace}/analysisruns`).catch(() => ({ items: [] })),
          get(`/apis/batch/v1/namespaces/${namespace}/jobs`).catch(() => ({ items: [] }))
        ]);
        if (cancelled) return;
        setState({ loading: false, topology: buildTopology(
          rollout,
          stamp(rss.items, "apps/v1", "ReplicaSet"),
          stamp(pods.items, "v1", "Pod"),
          stamp(svcs.items, "v1", "Service"),
          stamp(ars.items, "argoproj.io/v1alpha1", "AnalysisRun"),
          stamp(jobs.items, "batch/v1", "Job"),
          stepWeight
        ) });
      } catch (e) {
        if (!cancelled) setState((prev) => ({ loading: false, topology: prev.topology, error: String(e) }));
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    }
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [target?.cluster, target?.namespace, target?.rolloutName, target?.stepWeight, discoveryApi, fetchApi]);
  return state;
}

export { buildTopology, useRolloutTopology };
//# sourceMappingURL=useRolloutTopology.esm.js.map
