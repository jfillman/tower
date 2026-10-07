import { useCallback, useMemo } from 'react';
import { configApiRef, discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy';
import { TEKTON_CLUSTER } from '../tekton/useTektonPipelineRuns';
import {
  CLUSTER_PROMETHEUS,
  prometheusProxyPath,
  type PrometheusEndpoint,
  type RawPrometheusMatrix,
  type RawPrometheusVector,
} from '../usePrometheusQuery';
import { buildDoraSnapshot, doraQueries, type DoraQueries, type DoraRawResults, type DoraSnapshot } from './dora';
import { usePolled, type Polled } from './usePolled';

// DORA moves on the scale of releases, not seconds.
const POLL_MS = 5 * 60_000;

export interface DoraSource extends PrometheusEndpoint {
  cluster: string;
}

/**
 * Where dora-exporter's series are queried: `tower.dora.metrics` in app-config. Point it at the
 * long-term query layer (Thanos Query, Mimir) on the cluster dora-exporter reports to. Without
 * config, the control-plane cluster's own Prometheus, which only covers its local retention.
 */
export function useDoraSource(): DoraSource {
  const config = useApi(configApiRef);
  return useMemo(() => {
    const c = config.getOptionalConfig('tower.dora.metrics');
    return {
      cluster: c?.getOptionalString('cluster') ?? TEKTON_CLUSTER,
      namespace: c?.getOptionalString('namespace') ?? CLUSTER_PROMETHEUS.namespace,
      service: c?.getOptionalString('service') ?? CLUSTER_PROMETHEUS.service,
      port: c?.getOptionalNumber('port') ?? CLUSTER_PROMETHEUS.port,
    };
  }, [config]);
}

type ScalarKey = Exclude<
  keyof DoraQueries,
  'deploysByApp' | 'releasesByAppOutcome' | 'leadTimeP50ByApp' | 'restoreP50ByApp' | 'deploysDaily' | 'failuresDaily'
>;
const SCALAR_KEYS: ScalarKey[] = [
  'deploys',
  'deploysPrevious',
  'failures',
  'releases',
  'failuresPrevious',
  'releasesPrevious',
  'leadTimeP50',
  'restoreP50',
];

export function useDoraMetrics(
  windowDays: number,
  apps: string[] | undefined,
): Polled<DoraSnapshot> & { source: DoraSource } {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const source = useDoraSource();
  const appsKey = apps ? [...apps].sort().join(',') : '*';

  const fetcher = useCallback(async () => {
    const q = doraQueries(windowDays, apps);
    const instant = async (query: string) => {
      const res = await k8sProxyGet<RawPrometheusVector>(
        discoveryApi,
        fetchApi,
        source.cluster,
        prometheusProxyPath(`/api/v1/query?query=${encodeURIComponent(query)}`, source),
      );
      if (res.status !== 'success' || !res.data) throw new Error(res.error ?? 'query failed');
      return res.data.result.map(r => ({ metric: r.metric, value: Number(r.value[1]) }));
    };
    const range = async (query: string) => {
      const end = Math.floor(Date.now() / 86400) * 86400 + 86400;
      const start = end - windowDays * 86400;
      const res = await k8sProxyGet<RawPrometheusMatrix>(
        discoveryApi,
        fetchApi,
        source.cluster,
        prometheusProxyPath(
          `/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=86400`,
          source,
        ),
      );
      if (res.status !== 'success' || !res.data) throw new Error(res.error ?? 'query failed');
      return (res.data.result[0]?.values ?? []).map(([time, v]) => ({ time, value: Number(v) || 0 }));
    };

    const [scalars, deploysByApp, releasesByAppOutcome, leadByApp, restoreByApp, deploysDaily, failuresDaily] =
      await Promise.all([
        Promise.all(SCALAR_KEYS.map(k => instant(q[k]).then(r => [k, r[0]?.value] as const))),
        instant(q.deploysByApp),
        instant(q.releasesByAppOutcome),
        instant(q.leadTimeP50ByApp),
        instant(q.restoreP50ByApp),
        range(q.deploysDaily),
        range(q.failuresDaily),
      ]);
    const raw: DoraRawResults = {
      scalar: Object.fromEntries(scalars),
      deploysByApp: deploysByApp.map(r => ({ app: r.metric.app ?? '', value: r.value })),
      releasesByAppOutcome: releasesByAppOutcome.map(r => ({
        app: r.metric.app ?? '',
        outcome: r.metric.outcome ?? '',
        value: r.value,
      })),
      leadTimeP50ByApp: leadByApp.map(r => ({ app: r.metric.app ?? '', value: r.value })),
      restoreP50ByApp: restoreByApp.map(r => ({ app: r.metric.app ?? '', value: r.value })),
      deploysDaily,
      failuresDaily,
    };
    return buildDoraSnapshot(windowDays, raw);
    // appsKey stands in for apps (a fresh array every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowDays, appsKey, source, discoveryApi, fetchApi]);

  const polled = usePolled(`dora:${windowDays}:${appsKey}:${source.cluster}/${source.service}`, fetcher, POLL_MS);
  return { ...polled, source };
}
