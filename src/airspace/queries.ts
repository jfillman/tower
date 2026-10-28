import type { ServiceGraph, ServiceGraphSample } from './model';
import { edgeKey } from './model';

// PromQL over the service-graph series (the OpenTelemetry collector's servicegraph connector, remote-written into
// each cluster's Prometheus, docs/airspace.md). Label names checked against hangar-dev on 2026-10-28: client,
// server, connection_type (plus `failed`, summed away); failures are traces_service_graph_request_failed_total,
// which only exists once some request has failed.
export const WINDOWS = ['15m', '1h', '24h'] as const;
export type AirspaceWindow = (typeof WINDOWS)[number];

/**
 * A label matcher for one cluster's series in a shared query layer: the hub's Thanos holds every cluster's trace
 * metrics, told apart by the `cluster` external label (Apron sets it on every cluster's Prometheus). '' when the
 * query goes to the cluster's own Prometheus, where every series is that cluster's.
 */
export function clusterMatcher(cluster: string | undefined, label = 'cluster'): string {
  if (!cluster) return '';
  return `${label.replace(/[^A-Za-z0-9_]/g, '')}="${cluster.replace(/["\\]/g, '')}"`;
}

/**
 * The clusters the fleet page offers: the cluster registry's names when it answers. Otherwise the control-plane
 * cluster, plus `tower.clusters` keys that are cluster names - the backend's own config shape puts role keys
 * (`controlPlane: {name}`) under the same `tower.clusters`, and those are not clusters.
 */
export function airspaceClusters(registry: string[] | undefined, controlPlane: string | undefined, configKeys: string[]): string[] {
  const roleKeys = new Set(['controlPlane']);
  const names = new Set(registry && registry.length ? registry : configKeys.filter(k => !roleKeys.has(k)));
  if (controlPlane) names.add(controlPlane);
  return [...names].filter(Boolean).sort();
}

export function serviceGraphQueries(window: AirspaceWindow, matcher = '') {
  const sel = matcher ? `{${matcher}}` : '';
  return {
    rate: `sum by (client, server, connection_type) (rate(traces_service_graph_request_total${sel}[${window}]))`,
    p95: `histogram_quantile(0.95, sum by (client, server, le) (rate(traces_service_graph_request_server_seconds_bucket${sel}[${window}])))`,
    errors: `sum by (client, server) (rate(traces_service_graph_request_failed_total${sel}[${window}]))`,
  };
}

/** Operations (span names) a service served, from the collector's span metrics: what is seen, not a contract. */
export function observedOperationsQuery(service: string, window: AirspaceWindow, matcher = ''): string {
  const svc = service.replace(/["\\]/g, '');
  const extra = matcher ? `, ${matcher}` : '';
  return `sum by (span_name) (rate(traces_span_metrics_calls_total{service_name="${svc}", span_kind="SPAN_KIND_SERVER"${extra}}[${window}]))`;
}

interface Sample {
  metric: Record<string, string>;
  value: number;
}

/** The three instant-query results as one ServiceGraph. A NaN (an empty histogram bucket) is no value. */
export function toServiceGraph(rate: Sample[], p95: Sample[], errors: Sample[]): ServiceGraph {
  const samples: ServiceGraphSample[] = rate
    .filter(s => s.metric.client && s.metric.server && Number.isFinite(s.value))
    .map(s => ({
      client: s.metric.client,
      server: s.metric.server,
      connectionType: s.metric.connection_type ?? '',
      rate: s.value,
    }));
  const toMap = (xs: Sample[]) =>
    new Map(
      xs
        .filter(s => s.metric.client && s.metric.server && Number.isFinite(s.value))
        .map(s => [edgeKey(s.metric.client, s.metric.server), s.value] as const),
    );
  return { samples, p95: toMap(p95), errors: toMap(errors) };
}
