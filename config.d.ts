export interface Config {
  tower?: {
    /**
     * The control-plane (dev) cluster: the one that runs Tekton, Glidepath's release records and Airframe's app XRs.
     * Its name in kubernetes.clusterLocatorMethods, which is also its registry name and kubectl context. No default:
     * views that read that cluster say so when it is unset.
     * @visibility frontend
     */
    controlPlaneCluster?: string;
    /**
     * Per-cluster links, keyed by cluster name (as registered in kubernetes.clusterLocatorMethods). All optional; an
     * unset value hides its link or lookup.
     * @visibility frontend
     */
    clusters?: {
      [name: string]: {
        /** The cluster's tenants repo (`owner/repo`), where XR requests are opened. @visibility frontend */
        tenantsRepo?: string;
        /** The cluster's Grafana, linked from an app's Overview. @visibility frontend */
        grafanaUrl?: string;
        /** The cluster's Infisical UI, for project links. @visibility frontend */
        infisicalUrl?: string;
      };
    };
    /**
     * The fleet's default environment chart (Airframe's airframe-application): an environment rendering any other chart
     * is edited as raw YAML. Unset: Tower treats no chart as its own.
     * @visibility frontend
     */
    airframe?: {
      /** @visibility frontend */
      repoURL?: string;
      /** Defaults to charts/airframe-application. @visibility frontend */
      path?: string;
    };
    dora?: {
      /**
       * The Prometheus-API query service holding dora-exporter's series, reached through the
       * Kubernetes proxy of `cluster`. Use the long-term query layer (Thanos Query, Mimir) so 7-90
       * day windows are answerable. Defaults to tower.controlPlaneCluster's own Prometheus.
       * @visibility frontend
       */
      metrics?: {
        /** Cluster name as registered in kubernetes.clusterLocatorMethods. @visibility frontend */
        cluster?: string;
        /** @visibility frontend */
        namespace?: string;
        /** @visibility frontend */
        service?: string;
        /** @visibility frontend */
        port?: number;
      };
    };
  };
}
