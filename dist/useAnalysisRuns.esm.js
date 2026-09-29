import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { k8sProxyGet } from './k8sProxy.esm.js';

const POLL_MS = 5e3;
function toAnalysisRunSummary(raw) {
  const specByName = new Map((raw.spec?.metrics ?? []).map((m) => [m.name, m]));
  const metrics = (raw.status?.metricResults ?? []).map((mr) => {
    const specMetric = specByName.get(mr.name);
    return {
      name: mr.name,
      phase: mr.phase,
      message: mr.message,
      successCondition: specMetric?.successCondition,
      // The resolved query (real namespace/pod-hash substituted in) only
      // exists once the metric has actually run at least once - status's own
      // metadata carries it (confirmed live); before that, or if it's
      // missing, fall back to the raw template form from spec.
      query: mr.metadata?.ResolvedPrometheusQuery ?? specMetric?.provider?.prometheus?.query,
      measurements: (mr.measurements ?? []).map((m) => ({ at: m.startedAt, value: m.value ?? "" }))
    };
  });
  return {
    name: raw.metadata.name,
    phase: raw.status?.phase,
    message: raw.status?.message,
    rolloutType: raw.metadata.labels?.["rollout-type"],
    stepIndex: raw.metadata.labels?.["step-index"] !== void 0 ? Number(raw.metadata.labels["step-index"]) : void 0,
    startedAt: raw.status?.startedAt,
    completedAt: raw.status?.completedAt,
    metrics,
    raw
  };
}
function useAnalysisRuns(target, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({ loading: Boolean(target), runs: [] });
  useEffect(() => {
    if (!target) {
      setState({ loading: false, runs: [] });
      return void 0;
    }
    let cancelled = false;
    let timer;
    async function tick() {
      try {
        const list = await k8sProxyGet(
          discoveryApi,
          fetchApi,
          target.cluster,
          `/apis/argoproj.io/v1alpha1/namespaces/${target.namespace}/analysisruns`
        );
        if (cancelled) return;
        const runs = list.items.filter((ar) => ar.metadata.ownerReferences?.some((o) => o.kind === "Rollout" && o.name === target.rolloutName)).filter((ar) => !target.podHash || ar.metadata.labels?.["rollouts-pod-template-hash"] === target.podHash).map(toAnalysisRunSummary).sort((a, b) => new Date(b.startedAt ?? 0).getTime() - new Date(a.startedAt ?? 0).getTime());
        setState({ loading: false, runs });
        const stillRunning = runs.some((r) => r.phase === "Running" || r.phase === "Pending");
        if (!cancelled && stillRunning) timer = setTimeout(tick, POLL_MS);
      } catch (e) {
        if (!cancelled) setState((prev) => ({ loading: false, runs: prev.runs, error: String(e) }));
      }
    }
    setState((prev) => ({ loading: prev.runs.length === 0, runs: prev.runs }));
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [target?.cluster, target?.namespace, target?.rolloutName, target?.podHash, refreshNonce, discoveryApi, fetchApi]);
  return state;
}

export { useAnalysisRuns };
//# sourceMappingURL=useAnalysisRuns.esm.js.map
