// What Tower knows about airframe's analysis catalog (airframe analysis/, one ClusterAnalysisTemplate per check, installed
// on each cluster by its analysis-catalog Application). Every catalog template takes `namespace` and `app` (the pod-name
// prefix). A catalog query with no data PASSES rather than blocks, so a check is only offered once the metric behind it
// has data for this workload: `dataQuery` returns a series exactly when it does.

export interface CheckContext {
  app: string;
  /** The environment's namespace, app-<app>-<env>. */
  namespace: string;
}

export interface CatalogCheck {
  name: string;
  title: string;
  /** What the check needs scraped, in words. */
  needs: string;
  dataQuery: (c: CheckContext) => string;
}

const pods = (c: CheckContext) => `namespace="${c.namespace}", pod=~"${c.app}-.*"`;
// Traefik names the service after the HTTPRoute's backend, which carries the namespace and the app.
const traefik = (c: CheckContext) => `service=~".*${c.namespace}.*${c.app}.*"`;

export const CATALOG_CHECKS: CatalogCheck[] = [
  {
    name: 'pod-health-check',
    title: 'Pods ready',
    needs: 'kube-state-metrics',
    dataQuery: c => `count(kube_pod_status_ready{${pods(c)}})`,
  },
  {
    name: 'no-restarts-check',
    title: 'No restarts',
    needs: 'kube-state-metrics',
    dataQuery: c => `count(kube_pod_container_status_restarts_total{${pods(c)}})`,
  },
  {
    // The OOM series itself only exists after a container was killed; the container metrics show the scrape works.
    name: 'no-oom-check',
    title: 'No OOM kills',
    needs: 'kube-state-metrics',
    dataQuery: c => `count(kube_pod_container_info{${pods(c)}})`,
  },
  {
    name: 'probe-success-check',
    title: 'Probes succeed',
    needs: "the kubelet's prober metrics",
    dataQuery: c => `count(prober_probe_total{${pods(c)}})`,
  },
  {
    name: 'error-rate-check',
    title: 'Error rate',
    needs: 'Traefik request metrics',
    dataQuery: c => `count(traefik_service_requests_total{${traefik(c)}})`,
  },
  {
    name: 'success-rate-check',
    title: 'Success rate',
    needs: 'Traefik request metrics',
    dataQuery: c => `count(traefik_service_requests_total{${traefik(c)}})`,
  },
  {
    name: 'latency-check',
    title: 'p95 latency',
    needs: 'Traefik request-duration metrics',
    dataQuery: c => `count(traefik_service_request_duration_seconds_bucket{${traefik(c)}})`,
  },
];

export const catalogCheck = (name: string) => CATALOG_CHECKS.find(c => c.name === name);

/** The args a catalog template needs for this workload. */
export const checkArgs = (c: CheckContext) => [
  { name: 'namespace', value: c.namespace },
  { name: 'app', value: c.app },
];
