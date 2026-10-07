import { useCallback, useMemo } from 'react';
import { useApi, discoveryApiRef, fetchApiRef, configApiRef } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy.esm.js';
import { TEKTON_CLUSTER } from '../tekton/useTektonPipelineRuns.esm.js';
import { CLUSTER_PROMETHEUS, prometheusProxyPath } from '../usePrometheusQuery.esm.js';
import { doraQueries, buildDoraSnapshot } from './dora.esm.js';
import { usePolled } from './usePolled.esm.js';

const POLL_MS = 5 * 6e4;
function useDoraSource() {
  const config = useApi(configApiRef);
  return useMemo(() => {
    const c = config.getOptionalConfig("tower.dora.metrics");
    return {
      cluster: c?.getOptionalString("cluster") ?? TEKTON_CLUSTER,
      namespace: c?.getOptionalString("namespace") ?? CLUSTER_PROMETHEUS.namespace,
      service: c?.getOptionalString("service") ?? CLUSTER_PROMETHEUS.service,
      port: c?.getOptionalNumber("port") ?? CLUSTER_PROMETHEUS.port
    };
  }, [config]);
}
const SCALAR_KEYS = [
  "deploys",
  "deploysPrevious",
  "failures",
  "releases",
  "failuresPrevious",
  "releasesPrevious",
  "leadTimeP50",
  "restoreP50"
];
function useDoraMetrics(windowDays, apps) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const source = useDoraSource();
  const appsKey = apps ? [...apps].sort().join(",") : "*";
  const fetcher = useCallback(async () => {
    const q = doraQueries(windowDays, apps);
    const instant = async (query) => {
      const res = await k8sProxyGet(
        discoveryApi,
        fetchApi,
        source.cluster,
        prometheusProxyPath(`/api/v1/query?query=${encodeURIComponent(query)}`, source)
      );
      if (res.status !== "success" || !res.data) throw new Error(res.error ?? "query failed");
      return res.data.result.map((r) => ({ metric: r.metric, value: Number(r.value[1]) }));
    };
    const range = async (query) => {
      const end = Math.floor(Date.now() / 86400) * 86400 + 86400;
      const start = end - windowDays * 86400;
      const res = await k8sProxyGet(
        discoveryApi,
        fetchApi,
        source.cluster,
        prometheusProxyPath(
          `/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=86400`,
          source
        )
      );
      if (res.status !== "success" || !res.data) throw new Error(res.error ?? "query failed");
      return (res.data.result[0]?.values ?? []).map(([time, v]) => ({ time, value: Number(v) || 0 }));
    };
    const [scalars, deploysByApp, releasesByAppOutcome, leadByApp, restoreByApp, deploysDaily, failuresDaily] = await Promise.all([
      Promise.all(SCALAR_KEYS.map((k) => instant(q[k]).then((r) => [k, r[0]?.value]))),
      instant(q.deploysByApp),
      instant(q.releasesByAppOutcome),
      instant(q.leadTimeP50ByApp),
      instant(q.restoreP50ByApp),
      range(q.deploysDaily),
      range(q.failuresDaily)
    ]);
    const raw = {
      scalar: Object.fromEntries(scalars),
      deploysByApp: deploysByApp.map((r) => ({ app: r.metric.app ?? "", value: r.value })),
      releasesByAppOutcome: releasesByAppOutcome.map((r) => ({
        app: r.metric.app ?? "",
        outcome: r.metric.outcome ?? "",
        value: r.value
      })),
      leadTimeP50ByApp: leadByApp.map((r) => ({ app: r.metric.app ?? "", value: r.value })),
      restoreP50ByApp: restoreByApp.map((r) => ({ app: r.metric.app ?? "", value: r.value })),
      deploysDaily,
      failuresDaily
    };
    return buildDoraSnapshot(windowDays, raw);
  }, [windowDays, appsKey, source, discoveryApi, fetchApi]);
  const polled = usePolled(`dora:${windowDays}:${appsKey}:${source.cluster}/${source.service}`, fetcher, POLL_MS);
  return { ...polled, source };
}

export { useDoraMetrics, useDoraSource };
//# sourceMappingURL=useDoraMetrics.esm.js.map
