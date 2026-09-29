import { useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import type { K8sResourceRef } from './types';

// ClusterRole/ClusterRoleBinding - the two RBAC kinds useTowerEnvironments.ts
// genuinely can't reach the same way it fetches Role/RoleBinding (2026-09-17):
// they're cluster-scoped, and that fetcher always nests every matcher under
// `/namespaces/<ns>/<plural>` (see useTowerEnvironments.ts's own comment on
// buildResourcePath), the same problem Namespace had. Two raw, one-shot
// calls instead (same generic proxy mechanism NamespaceEvents.tsx/
// useNamespaceResource.ts already use) - a full ClusterRoleBinding LIST
// (Kubernetes has no field selector for "subjects contains this
// namespace", so filtering to what's actually relevant has to happen
// client-side after the fact), then individual GETs for just the
// ClusterRoles something relevant actually references, not every
// ClusterRole in the cluster.

interface RawSubject {
  kind?: string;
  name?: string;
  namespace?: string;
}
interface RawRoleRef {
  kind?: string;
  name?: string;
}
interface RawClusterRoleBinding {
  apiVersion?: string;
  metadata?: { name?: string; labels?: Record<string, string>; annotations?: Record<string, string> };
  subjects?: RawSubject[];
  roleRef?: RawRoleRef;
}
interface RawClusterRole {
  apiVersion?: string;
  metadata?: { name?: string; labels?: Record<string, string>; annotations?: Record<string, string> };
}

export interface ClusterRbacResult {
  loading: boolean;
  error?: string;
  clusterRoleBindings: K8sResourceRef[];
  clusterRoles: K8sResourceRef[];
}

// `extraReferencedClusterRoleNames` lets the caller also resolve a
// namespaced RoleBinding that points at a ClusterRole instead of a Role
// (a very common real pattern - binding a shared ClusterRole's rules
// within just one namespace) without this hook needing to know anything
// about how Role/RoleBinding themselves get fetched.
export function useClusterRbac(
  cluster: string,
  namespace: string,
  extraReferencedClusterRoleNames: string[],
): ClusterRbacResult {
  const kubernetesApi = useApi(kubernetesApiRef);
  const [state, setState] = useState<ClusterRbacResult>({ loading: true, clusterRoleBindings: [], clusterRoles: [] });
  const referencedKey = [...new Set(extraReferencedClusterRoleNames)].sort().join(',');

  useEffect(() => {
    let cancelled = false;
    setState(prev => ({ ...prev, loading: true, error: undefined }));

    (async () => {
      try {
        const bindingsRes = await kubernetesApi.proxy({
          clusterName: cluster,
          path: '/apis/rbac.authorization.k8s.io/v1/clusterrolebindings',
        });
        if (!bindingsRes.ok) throw new Error(`request failed with ${bindingsRes.status}`);
        const bindingsBody = (await bindingsRes.json()) as { items?: RawClusterRoleBinding[] };
        const relevant = (bindingsBody.items ?? []).filter(b =>
          (b.subjects ?? []).some(s => s.kind === 'ServiceAccount' && s.namespace === namespace),
        );

        const neededNames = new Set<string>(extraReferencedClusterRoleNames);
        relevant.forEach(b => {
          if (b.roleRef?.kind === 'ClusterRole' && b.roleRef.name) neededNames.add(b.roleRef.name);
        });

        const fetched = await Promise.all(
          [...neededNames].map(async name => {
            try {
              const res = await kubernetesApi.proxy({
                clusterName: cluster,
                path: `/apis/rbac.authorization.k8s.io/v1/clusterroles/${encodeURIComponent(name)}`,
              });
              if (!res.ok) return undefined;
              return (await res.json()) as RawClusterRole;
            } catch {
              return undefined;
            }
          }),
        );

        if (cancelled) return;

        const clusterRoleBindings: K8sResourceRef[] = relevant.map(b => ({
          kind: 'ClusterRoleBinding',
          apiVersion: b.apiVersion,
          name: b.metadata?.name ?? 'unnamed',
          namespace,
          labels: b.metadata?.labels,
          annotations: b.metadata?.annotations,
          raw: b,
        }));
        const clusterRoles: K8sResourceRef[] = fetched
          .filter((r): r is RawClusterRole => Boolean(r))
          .map(r => ({
            kind: 'ClusterRole',
            apiVersion: r.apiVersion,
            name: r.metadata?.name ?? 'unnamed',
            namespace,
            labels: r.metadata?.labels,
            annotations: r.metadata?.annotations,
            raw: r,
          }));

        setState({ loading: false, clusterRoleBindings, clusterRoles });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e), clusterRoleBindings: [], clusterRoles: [] });
      }
    })();

    return () => {
      cancelled = true;
    };
    // referencedKey (a stable sorted/deduped string) is the real dependency
    // - extraReferencedClusterRoleNames itself is a fresh array every
    // render, which would re-fetch on every render even when its contents
    // haven't actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cluster, namespace, referencedKey, kubernetesApi]);

  return state;
}
