const pods = (c) => `namespace="${c.namespace}", pod=~"${c.app}-.*"`;
const traefik = (c) => `service=~".*${c.namespace}.*${c.app}.*"`;
const CATALOG_CHECKS = [
  {
    name: "pod-health-check",
    title: "Pods ready",
    needs: "kube-state-metrics",
    dataQuery: (c) => `count(kube_pod_status_ready{${pods(c)}})`
  },
  {
    name: "no-restarts-check",
    title: "No restarts",
    needs: "kube-state-metrics",
    dataQuery: (c) => `count(kube_pod_container_status_restarts_total{${pods(c)}})`
  },
  {
    // The OOM series itself only exists after a container was killed; the container metrics show the scrape works.
    name: "no-oom-check",
    title: "No OOM kills",
    needs: "kube-state-metrics",
    dataQuery: (c) => `count(kube_pod_container_info{${pods(c)}})`
  },
  {
    name: "probe-success-check",
    title: "Probes succeed",
    needs: "the kubelet's prober metrics",
    dataQuery: (c) => `count(prober_probe_total{${pods(c)}})`
  },
  {
    name: "error-rate-check",
    title: "Error rate",
    needs: "Traefik request metrics",
    dataQuery: (c) => `count(traefik_service_requests_total{${traefik(c)}})`
  },
  {
    name: "success-rate-check",
    title: "Success rate",
    needs: "Traefik request metrics",
    dataQuery: (c) => `count(traefik_service_requests_total{${traefik(c)}})`
  },
  {
    name: "latency-check",
    title: "p95 latency",
    needs: "Traefik request-duration metrics",
    dataQuery: (c) => `count(traefik_service_request_duration_seconds_bucket{${traefik(c)}})`
  }
];
const catalogCheck = (name) => CATALOG_CHECKS.find((c) => c.name === name);
const checkArgs = (c) => [
  { name: "namespace", value: c.namespace },
  { name: "app", value: c.app }
];

export { CATALOG_CHECKS, catalogCheck, checkArgs };
//# sourceMappingURL=analysisCatalog.esm.js.map
