import { useState, useEffect } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';

function useClusterRbac(cluster, namespace, extraReferencedClusterRoleNames) {
  const kubernetesApi = useApi(kubernetesApiRef);
  const [state, setState] = useState({ loading: true, clusterRoleBindings: [], clusterRoles: [] });
  const referencedKey = [...new Set(extraReferencedClusterRoleNames)].sort().join(",");
  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: void 0 }));
    (async () => {
      try {
        const bindingsRes = await kubernetesApi.proxy({
          clusterName: cluster,
          path: "/apis/rbac.authorization.k8s.io/v1/clusterrolebindings"
        });
        if (!bindingsRes.ok) throw new Error(`request failed with ${bindingsRes.status}`);
        const bindingsBody = await bindingsRes.json();
        const relevant = (bindingsBody.items ?? []).filter(
          (b) => (b.subjects ?? []).some((s) => s.kind === "ServiceAccount" && s.namespace === namespace)
        );
        const neededNames = new Set(extraReferencedClusterRoleNames);
        relevant.forEach((b) => {
          if (b.roleRef?.kind === "ClusterRole" && b.roleRef.name) neededNames.add(b.roleRef.name);
        });
        const fetched = await Promise.all(
          [...neededNames].map(async (name) => {
            try {
              const res = await kubernetesApi.proxy({
                clusterName: cluster,
                path: `/apis/rbac.authorization.k8s.io/v1/clusterroles/${encodeURIComponent(name)}`
              });
              if (!res.ok) return void 0;
              return await res.json();
            } catch {
              return void 0;
            }
          })
        );
        if (cancelled) return;
        const clusterRoleBindings = relevant.map((b) => ({
          kind: "ClusterRoleBinding",
          apiVersion: b.apiVersion,
          name: b.metadata?.name ?? "unnamed",
          namespace,
          labels: b.metadata?.labels,
          annotations: b.metadata?.annotations,
          raw: b
        }));
        const clusterRoles = fetched.filter((r) => Boolean(r)).map((r) => ({
          kind: "ClusterRole",
          apiVersion: r.apiVersion,
          name: r.metadata?.name ?? "unnamed",
          namespace,
          labels: r.metadata?.labels,
          annotations: r.metadata?.annotations,
          raw: r
        }));
        setState({ loading: false, clusterRoleBindings, clusterRoles });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e), clusterRoleBindings: [], clusterRoles: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cluster, namespace, referencedKey, kubernetesApi]);
  return state;
}

export { useClusterRbac };
//# sourceMappingURL=useClusterRbac.esm.js.map
