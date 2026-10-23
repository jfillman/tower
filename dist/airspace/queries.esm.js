import { edgeKey } from './model.esm.js';

const WINDOWS = ["15m", "1h", "24h"];
function serviceGraphQueries(window) {
  return {
    rate: `sum by (client, server, connection_type) (rate(traces_service_graph_request_total[${window}]))`,
    p95: `histogram_quantile(0.95, sum by (client, server, le) (rate(traces_service_graph_request_server_seconds_bucket[${window}])))`,
    errors: `sum by (client, server) (rate(traces_service_graph_request_failed_total[${window}]))`
  };
}
function observedOperationsQuery(service, window) {
  const svc = service.replace(/["\\]/g, "");
  return `sum by (span_name) (rate(traces_span_metrics_calls_total{service_name="${svc}", span_kind="SPAN_KIND_SERVER"}[${window}]))`;
}
function toServiceGraph(rate, p95, errors) {
  const samples = rate.filter((s) => s.metric.client && s.metric.server && Number.isFinite(s.value)).map((s) => ({
    client: s.metric.client,
    server: s.metric.server,
    connectionType: s.metric.connection_type ?? "",
    rate: s.value
  }));
  const toMap = (xs) => new Map(
    xs.filter((s) => s.metric.client && s.metric.server && Number.isFinite(s.value)).map((s) => [edgeKey(s.metric.client, s.metric.server), s.value])
  );
  return { samples, p95: toMap(p95), errors: toMap(errors) };
}

export { WINDOWS, observedOperationsQuery, serviceGraphQueries, toServiceGraph };
//# sourceMappingURL=queries.esm.js.map
