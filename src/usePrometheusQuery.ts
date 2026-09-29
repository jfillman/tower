import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { k8sProxyGet } from './k8sProxy';

// Shared cluster-aware Prometheus access, built on the same generic
// `services/proxy` mechanism this codebase already uses for Rekor
// (glidepathProvenance.ts's fetchRekorPublicKey) - but via the FRONTEND's
// kubernetes-plugin proxy route (k8sProxyGet, same one useAnalysisRuns.ts
// and useTowerEnvironments.ts already call) rather than a dedicated backend
// route with its own hand-rolled per-cluster https client. That's a
// deliberate simplification over glidepathProvenance's approach: this
// platform's kubernetes-backend plugin is already configured with working
// per-cluster credentials for every registered cluster (KIND_DEV_SA_TOKEN /
// KIND_PROD_SA_TOKEN), so there's no new RBAC or token to plumb - `view`
// (already bound to backstage-ingestor on every cluster) was confirmed live
// to already cover `services/proxy` (see HANDOFF-tower-slos.md), unlike the
// Rekor case which needed an explicit extra grant.
//
// kube-prometheus-stack's Prometheus Service name/port is the one constant
// every AnalysisTemplate on this platform already hardcodes (see e.g.
// gitops-checkout-api's own values.yaml) - not per-app configurable, since
// it's shared platform infrastructure, one instance per cluster.
const PROMETHEUS_NAMESPACE = 'observability';
const PROMETHEUS_SERVICE = 'kube-prometheus-stack-prometheus';
const PROMETHEUS_PORT = 9090;

function proxyPath(subpath: string): string {
  return `/api/v1/namespaces/${PROMETHEUS_NAMESPACE}/services/${PROMETHEUS_SERVICE}:${PROMETHEUS_PORT}/proxy${subpath}`;
}

interface RawPrometheusVector {
  status: 'success' | 'error';
  error?: string;
  data?: {
    resultType: 'vector';
    result: Array<{ metric: Record<string, string>; value: [number, string] }>;
  };
}

interface RawPrometheusMatrix {
  status: 'success' | 'error';
  error?: string;
  data?: {
    resultType: 'matrix';
    result: Array<{ metric: Record<string, string>; values: Array<[number, string]> }>;
  };
}

export interface PrometheusSample {
  metric: Record<string, string>;
  time: number;
  value: number;
}

export interface PrometheusSeries {
  metric: Record<string, string>;
  points: Array<{ time: number; value: number }>;
}

export interface UsePrometheusQueryResult {
  loading: boolean;
  error?: string;
  samples: PrometheusSample[];
}

export interface UsePrometheusRangeResult {
  loading: boolean;
  error?: string;
  series: PrometheusSeries[];
}

// Not polled by default (unlike useAnalysisRuns) - an SLO's burn-rate
// numbers move slowly (5m is the shortest Sloth window) and this tab is
// meant to be an at-a-glance dashboard, not a live ticker. Callers that want
// a refresh use the same refreshNonce convention as every other Tower hook.
export function usePrometheusInstantQuery(
  cluster: string | undefined,
  query: string | undefined,
  refreshNonce = 0,
  // Opt-in poll interval, same posture as PodLogsView's own `live` prop -
  // this hits the cluster's own in-cluster Prometheus, not a rate-limited
  // external API, so a caller showing a live metrics strip can poll it
  // without the GitHub-rate-limit concerns that keep every other Tower data
  // hook manual-refresh-only.
  pollMs?: number,
): UsePrometheusQueryResult {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<UsePrometheusQueryResult>({ loading: Boolean(cluster && query), samples: [] });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!pollMs) return undefined;
    const id = setInterval(() => setTick(n => n + 1), pollMs);
    return () => clearInterval(id);
  }, [pollMs]);

  useEffect(() => {
    if (!cluster || !query) {
      setState({ loading: false, samples: [] });
      return undefined;
    }
    let cancelled = false;
    setState(prev => ({ loading: true, samples: prev.samples }));

    (async () => {
      try {
        const path = proxyPath(`/api/v1/query?query=${encodeURIComponent(query)}`);
        const res = await k8sProxyGet<RawPrometheusVector>(discoveryApi, fetchApi, cluster, path);
        if (cancelled) return;
        if (res.status === 'error' || !res.data) {
          setState({ loading: false, samples: [], error: res.error ?? 'Prometheus query failed' });
          return;
        }
        const samples: PrometheusSample[] = res.data.result.map(r => ({
          metric: r.metric,
          time: r.value[0],
          value: Number(r.value[1]),
        }));
        setState({ loading: false, samples });
      } catch (e) {
        if (!cancelled) setState({ loading: false, samples: [], error: String(e) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cluster, query, refreshNonce, tick, discoveryApi, fetchApi]);

  return state;
}

// Range-query counterpart, for a real sparkline rather than a single
// point-in-time number - CPU/memory/network/disk all read more honestly as
// "what's the trend" than "what's it right now" (a single sample can land
// on either side of a scraping-interval spike). `stepSeconds` should stay
// coarse enough to keep the response small - these charts are a glance, not
// a full Prometheus explorer.
export function usePrometheusRangeQuery(
  cluster: string | undefined,
  query: string | undefined,
  rangeSeconds: number,
  stepSeconds: number,
  refreshNonce = 0,
): UsePrometheusRangeResult {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<UsePrometheusRangeResult>({ loading: Boolean(cluster && query), series: [] });

  useEffect(() => {
    if (!cluster || !query) {
      setState({ loading: false, series: [] });
      return undefined;
    }
    let cancelled = false;
    setState(prev => ({ loading: true, series: prev.series }));

    (async () => {
      try {
        const end = Math.floor(Date.now() / 1000);
        const start = end - rangeSeconds;
        const path = proxyPath(
          `/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${stepSeconds}`,
        );
        const res = await k8sProxyGet<RawPrometheusMatrix>(discoveryApi, fetchApi, cluster, path);
        if (cancelled) return;
        if (res.status === 'error' || !res.data) {
          setState({ loading: false, series: [], error: res.error ?? 'Prometheus query failed' });
          return;
        }
        const series: PrometheusSeries[] = res.data.result.map(r => ({
          metric: r.metric,
          points: r.values.map(([time, value]) => ({ time, value: Number(value) })),
        }));
        setState({ loading: false, series });
      } catch (e) {
        if (!cancelled) setState({ loading: false, series: [], error: String(e) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cluster, query, rangeSeconds, stepSeconds, refreshNonce, discoveryApi, fetchApi]);

  return state;
}
