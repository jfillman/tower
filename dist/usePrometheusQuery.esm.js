import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { k8sProxyGet } from './k8sProxy.esm.js';

const CLUSTER_PROMETHEUS = {
  namespace: "observability",
  service: "kube-prometheus-stack-prometheus",
  port: 9090
};
function prometheusProxyPath(subpath, endpoint = CLUSTER_PROMETHEUS) {
  return `/api/v1/namespaces/${endpoint.namespace}/services/${endpoint.service}:${endpoint.port}/proxy${subpath}`;
}
const proxyPath = (subpath) => prometheusProxyPath(subpath);
function usePrometheusInstantQuery(cluster, query, refreshNonce = 0, pollMs) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({ loading: Boolean(cluster && query), samples: [] });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    return void 0;
  }, [pollMs]);
  useEffect(() => {
    if (!cluster || !query) {
      setState({ loading: false, samples: [] });
      return void 0;
    }
    let cancelled = false;
    setState((prev) => ({ loading: true, samples: prev.samples }));
    (async () => {
      try {
        const path = proxyPath(`/api/v1/query?query=${encodeURIComponent(query)}`);
        const res = await k8sProxyGet(discoveryApi, fetchApi, cluster, path);
        if (cancelled) return;
        if (res.status === "error" || !res.data) {
          setState({ loading: false, samples: [], error: res.error ?? "Prometheus query failed" });
          return;
        }
        const samples = res.data.result.map((r) => ({
          metric: r.metric,
          time: r.value[0],
          value: Number(r.value[1])
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
function usePrometheusRangeQuery(cluster, query, rangeSeconds, stepSeconds, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({ loading: Boolean(cluster && query), series: [] });
  useEffect(() => {
    if (!cluster || !query) {
      setState({ loading: false, series: [] });
      return void 0;
    }
    let cancelled = false;
    setState((prev) => ({ loading: true, series: prev.series }));
    (async () => {
      try {
        const end = Math.floor(Date.now() / 1e3);
        const start = end - rangeSeconds;
        const path = proxyPath(
          `/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${stepSeconds}`
        );
        const res = await k8sProxyGet(discoveryApi, fetchApi, cluster, path);
        if (cancelled) return;
        if (res.status === "error" || !res.data) {
          setState({ loading: false, series: [], error: res.error ?? "Prometheus query failed" });
          return;
        }
        const series = res.data.result.map((r) => ({
          metric: r.metric,
          points: r.values.map(([time, value]) => ({ time, value: Number(value) }))
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

export { CLUSTER_PROMETHEUS, prometheusProxyPath, usePrometheusInstantQuery, usePrometheusRangeQuery };
//# sourceMappingURL=usePrometheusQuery.esm.js.map
