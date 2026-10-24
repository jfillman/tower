import { edgeKey } from './model.esm.js';

const WINDOWS = ["15m", "1h", "24h"];
function clusterMatcher(cluster, label = "cluster") {
  if (!cluster) return "";
  return `${label.replace(/[^A-Za-z0-9_]/g, "")}="${cluster.replace(/["\\]/g, "")}"`;
}
function airspaceClusters(registry, controlPlane, configKeys) {
  const roleKeys = /* @__PURE__ */ new Set(["controlPlane"]);
  const names = new Set(registry && registry.length ? registry : configKeys.filter((k) => !roleKeys.has(k)));
  if (controlPlane) names.add(controlPlane);
  return [...names].filter(Boolean).sort();
}
function serviceGraphQueries(window, matcher = "") {
  const sel = matcher ? `{${matcher}}` : "";
  return {
    rate: `sum by (client, server, connection_type) (rate(traces_service_graph_request_total${sel}[${window}]))`,
    p95: `histogram_quantile(0.95, sum by (client, server, le) (rate(traces_service_graph_request_server_seconds_bucket${sel}[${window}])))`,
    errors: `sum by (client, server) (rate(traces_service_graph_request_failed_total${sel}[${window}]))`
  };
}
function observedOperationsQuery(service, window, matcher = "") {
  const svc = service.replace(/["\\]/g, "");
  const extra = matcher ? `, ${matcher}` : "";
  return `sum by (span_name) (rate(traces_span_metrics_calls_total{service_name="${svc}", span_kind="SPAN_KIND_SERVER"${extra}}[${window}]))`;
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

export { WINDOWS, airspaceClusters, clusterMatcher, observedOperationsQuery, serviceGraphQueries, toServiceGraph };
//# sourceMappingURL=queries.esm.js.map
