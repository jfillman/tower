import type { ServiceGraph, ServiceGraphSample } from './model';
import { edgeKey } from './model';

// PromQL over Tempo's service-graph series (remote-written into each cluster's Prometheus, docs/airspace.md). Label
// names checked against hangar-dev on 2026-10-23: client, server, connection_type; failures are
// traces_service_graph_request_failed_total, which only exists once some request has failed.
export const WINDOWS = ['15m', '1h', '24h'] as const;
export type AirspaceWindow = (typeof WINDOWS)[number];

export function serviceGraphQueries(window: AirspaceWindow) {
  return {
    rate: `sum by (client, server, connection_type) (rate(traces_service_graph_request_total[${window}]))`,
    p95: `histogram_quantile(0.95, sum by (client, server, le) (rate(traces_service_graph_request_server_seconds_bucket[${window}])))`,
    errors: `sum by (client, server) (rate(traces_service_graph_request_failed_total[${window}]))`,
  };
}

/** Operations (span names) a service served, from the collector's span metrics: what is seen, not a contract. */
export function observedOperationsQuery(service: string, window: AirspaceWindow): string {
  const svc = service.replace(/["\\]/g, '');
  return `sum by (span_name) (rate(traces_span_metrics_calls_total{service_name="${svc}", span_kind="SPAN_KIND_SERVER"}[${window}]))`;
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
