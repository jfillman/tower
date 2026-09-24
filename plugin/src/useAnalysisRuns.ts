import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { k8sProxyGet } from './k8sProxy';
import type { AnalysisMetricResult, AnalysisRunSummary } from './types';

const POLL_MS = 5000;

// AnalysisRuns are Argo Rollouts controller-generated child resources - like
// Tekton's PipelineRuns (see tekton/useTektonPipelineRuns.ts's own comment),
// they carry no `hangar.io/app` label at all (confirmed live: only
// app.kubernetes.io/name, rollout-type, rollouts-pod-template-hash), so
// useCustomResources(entity, [...])'s label-selector would always match
// zero of them. Listed by namespace via the same generic k8s proxy instead,
// then matched back to this specific Rollout via ownerReferences (confirmed
// live: AnalysisRun.metadata.ownerReferences[0] = {kind:'Rollout',
// name:'<rollout-name>'}) - the one thing every AnalysisRun reliably carries
// regardless of which AnalysisTemplate it ran.

interface RawObjectMeta {
  name: string;
  namespace: string;
  labels?: Record<string, string>;
  ownerReferences?: Array<{ kind: string; name: string }>;
}
interface RawAnalysisRunMetricSpec {
  name: string;
  successCondition?: string;
  provider?: { prometheus?: { query?: string } };
}
interface RawAnalysisRunMeasurement {
  startedAt?: string;
  value?: string;
}
interface RawAnalysisRunMetricResult {
  name: string;
  phase?: string;
  // status.metricResults[].message - see AnalysisMetricResult.message's own
  // comment in types.ts (2026-09-18: "canary error messages need to surface
  // better").
  message?: string;
  measurements?: RawAnalysisRunMeasurement[];
  metadata?: { ResolvedPrometheusQuery?: string };
}
interface RawAnalysisRun {
  metadata: RawObjectMeta;
  spec?: { metrics?: RawAnalysisRunMetricSpec[] };
  status?: {
    phase?: string;
    // status.message - see AnalysisRunSummary.message's own comment in
    // types.ts.
    message?: string;
    startedAt?: string;
    completedAt?: string;
    metricResults?: RawAnalysisRunMetricResult[];
  };
}

function toAnalysisRunSummary(raw: RawAnalysisRun): AnalysisRunSummary {
  const specByName = new Map((raw.spec?.metrics ?? []).map(m => [m.name, m]));
  const metrics: AnalysisMetricResult[] = (raw.status?.metricResults ?? []).map(mr => {
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
      measurements: (mr.measurements ?? []).map(m => ({ at: m.startedAt, value: m.value ?? '' })),
    };
  });
  return {
    name: raw.metadata.name,
    phase: raw.status?.phase,
    message: raw.status?.message,
    rolloutType: raw.metadata.labels?.['rollout-type'],
    stepIndex: raw.metadata.labels?.['step-index'] !== undefined ? Number(raw.metadata.labels['step-index']) : undefined,
    startedAt: raw.status?.startedAt,
    completedAt: raw.status?.completedAt,
    metrics,
    raw,
  };
}

export interface UseAnalysisRunsTarget {
  cluster: string;
  namespace: string;
  rolloutName: string;
  // Restricts to the currently-canarying revision's own runs - without it,
  // an AnalysisRun from an earlier, already-promoted revision (Argo Rollouts
  // doesn't clean these up immediately) would show up mixed in with the
  // current one's real-time results.
  podHash?: string;
}

export interface UseAnalysisRunsResult {
  loading: boolean;
  error?: string;
  runs: AnalysisRunSummary[];
}

// refreshNonce: manual re-fetch trigger, same convention as every other
// Tower hook. Polls on its own (unlike the GitHub-backed hooks) only while
// at least one fetched run is still actually in progress - once every
// analysis this rollout ran has a final phase, there's nothing left to watch
// change.
export function useAnalysisRuns(
  target: UseAnalysisRunsTarget | undefined,
  refreshNonce = 0,
): UseAnalysisRunsResult {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<UseAnalysisRunsResult>({ loading: Boolean(target), runs: [] });

  useEffect(() => {
    if (!target) {
      setState({ loading: false, runs: [] });
      return undefined;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      try {
        const list = await k8sProxyGet<{ items: RawAnalysisRun[] }>(
          discoveryApi,
          fetchApi,
          target!.cluster,
          `/apis/argoproj.io/v1alpha1/namespaces/${target!.namespace}/analysisruns`,
        );
        if (cancelled) return;
        const runs = list.items
          .filter(ar => ar.metadata.ownerReferences?.some(o => o.kind === 'Rollout' && o.name === target!.rolloutName))
          .filter(ar => !target!.podHash || ar.metadata.labels?.['rollouts-pod-template-hash'] === target!.podHash)
          .map(toAnalysisRunSummary)
          .sort((a, b) => new Date(b.startedAt ?? 0).getTime() - new Date(a.startedAt ?? 0).getTime());
        setState({ loading: false, runs });
        const stillRunning = runs.some(r => r.phase === 'Running' || r.phase === 'Pending');
        if (!cancelled && stillRunning) timer = setTimeout(tick, POLL_MS);
      } catch (e) {
        if (!cancelled) setState(prev => ({ loading: false, runs: prev.runs, error: String(e) }));
      }
    }

    setState(prev => ({ loading: prev.runs.length === 0, runs: prev.runs }));
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Depends on target's individual fields (a fresh object every render
    // otherwise re-fetches on every parent re-render) - same pattern as
    // every other Tower hook that takes a small options object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.cluster, target?.namespace, target?.rolloutName, target?.podHash, refreshNonce, discoveryApi, fetchApi]);

  return state;
}
