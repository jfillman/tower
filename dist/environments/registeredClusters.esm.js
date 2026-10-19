import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';

function useRegisteredClusters(enabled = true) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    if (!enabled) return void 0;
    let live = true;
    (async () => {
      try {
        const res = await fetchApi.fetch(`${await discoveryApi.getBaseUrl("cluster-registry")}/clusters`);
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (live) setState({ status: "ready", clusters: body.clusters ?? [] });
      } catch {
        if (live) setState({ status: "failed" });
      }
    })();
    return () => {
      live = false;
    };
  }, [enabled, discoveryApi, fetchApi]);
  return state;
}
function flightClusterOptions(clusters, usedBy = {}) {
  return clusters.filter((c) => c.flight).map((c) => {
    const detail = [c.zone, c.roles.join(", ")].filter(Boolean).join(" \xB7 ");
    const used = usedBy[c.name]?.length ? `used by ${usedBy[c.name].join(", ")}` : "";
    const extra = [detail, used].filter(Boolean).join(", ");
    return { value: c.name, label: extra ? `${c.name} (${extra})` : c.name };
  });
}
function flightClusterProblem(state, cluster) {
  if (state.status !== "ready" || !cluster) return void 0;
  const usable = state.clusters.filter((c) => c.flight).map((c) => c.name);
  if (usable.includes(cluster)) return void 0;
  const known = state.clusters.find((c) => c.name === cluster);
  const why = known ? "is registered but cannot host a Flight environment (it needs type upper and crossplaneReady)" : "is not in the cluster registry";
  return `Cluster "${cluster}" ${why}.${usable.length ? ` Registered upper clusters: ${usable.join(", ")}.` : ""}`;
}

export { flightClusterOptions, flightClusterProblem, useRegisteredClusters };
//# sourceMappingURL=registeredClusters.esm.js.map
