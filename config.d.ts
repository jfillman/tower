export interface Config {
  tower?: {
    dora?: {
      /**
       * The Prometheus-API query service holding dora-exporter's series, reached through the
       * Kubernetes proxy of `cluster`. Use the long-term query layer (Thanos Query, Mimir) so 7-90
       * day windows are answerable. Defaults to the control-plane cluster's own Prometheus.
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
