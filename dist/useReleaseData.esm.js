import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';

function errorMessage(e) {
  return e instanceof Error ? e.message : String(e);
}
function useRepoHead(target, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: Boolean(target)
  });
  const key = target ? `${target.owner}/${target.repo}@${target.ref ?? ""}` : "";
  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return void 0;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl("glidepath");
        const params = new URLSearchParams({ owner: target.owner, repo: target.repo });
        if (target.ref) params.set("ref", target.ref);
        const res = await fetchApi.fetch(`${baseUrl}/head?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => void 0);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: errorMessage(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, discoveryApi, fetchApi, refreshNonce]);
  return state;
}
function useImageVersions(ownerRepo, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: Boolean(ownerRepo)
  });
  const key = ownerRepo ? `${ownerRepo.owner}/${ownerRepo.repo}` : "";
  useEffect(() => {
    if (!ownerRepo) {
      setState({ loading: false });
      return void 0;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl("glidepath");
        const params = new URLSearchParams({ owner: ownerRepo.owner, repo: ownerRepo.repo });
        const res = await fetchApi.fetch(`${baseUrl}/images?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => void 0);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: errorMessage(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, discoveryApi, fetchApi, refreshNonce]);
  return state;
}
function usePipelineOrder(ownerRepo, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({ loading: Boolean(ownerRepo) });
  const key = ownerRepo ? `${ownerRepo.owner}/${ownerRepo.repo}` : "";
  useEffect(() => {
    if (!ownerRepo) {
      setState({ loading: false });
      return void 0;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl("glidepath");
        const params = new URLSearchParams({ owner: ownerRepo.owner, repo: ownerRepo.repo });
        const res = await fetchApi.fetch(`${baseUrl}/pipeline-order?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => void 0);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setState({
            loading: false,
            data: data.order,
            lower: data.lower,
            upper: data.upper,
            upperClusters: data.upperClusters
          });
        }
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: errorMessage(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, discoveryApi, fetchApi, refreshNonce]);
  return state;
}
function useProvenanceMap(images, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({});
  const key = images.join("|");
  useEffect(() => {
    const uniqueImages = [...new Set(images.filter(Boolean))];
    if (uniqueImages.length === 0) return void 0;
    let cancelled = false;
    setState((prev) => {
      const next = { ...prev };
      uniqueImages.forEach((image) => {
        if (!next[image]) next[image] = { loading: true };
      });
      return next;
    });
    uniqueImages.forEach((image) => {
      (async () => {
        try {
          const baseUrl = await discoveryApi.getBaseUrl("glidepath");
          const res = await fetchApi.fetch(
            `${baseUrl}/provenance?image=${encodeURIComponent(image)}`
          );
          if (!res.ok) {
            const body = await res.json().catch(() => void 0);
            throw new Error(body?.error ?? `request failed with ${res.status}`);
          }
          const data = await res.json();
          if (!cancelled) setState((prev) => ({ ...prev, [image]: { loading: false, data } }));
        } catch (e) {
          if (!cancelled) {
            setState((prev) => ({ ...prev, [image]: { loading: false, error: errorMessage(e) } }));
          }
        }
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [key, discoveryApi, fetchApi, refreshNonce]);
  return state;
}
function usePromote() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState(
    { loading: false }
  );
  const promote = async (request) => {
    setState({ loading: true });
    try {
      const baseUrl = await discoveryApi.getBaseUrl("glidepath");
      const res = await fetchApi.fetch(`${baseUrl}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => void 0);
        throw new Error(body?.error ?? `request failed with ${res.status}`);
      }
      const result = await res.json();
      setState({ loading: false, result });
    } catch (e) {
      setState({ loading: false, error: errorMessage(e) });
    }
  };
  const reset = () => setState({ loading: false });
  return { ...state, promote, reset };
}
function useArgoActions() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [pending, setPending] = useState(void 0);
  const [error, setError] = useState(void 0);
  const call = async (pendingKey, path, cluster, appName, hard) => {
    setPending(pendingKey);
    setError(void 0);
    try {
      const baseUrl = await discoveryApi.getBaseUrl("glidepath");
      const res = await fetchApi.fetch(`${baseUrl}/argo/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cluster, appName, ...hard ? { hard: true } : {} })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => void 0);
        throw new Error(body?.error ?? `request failed with ${res.status}`);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(void 0);
    }
  };
  return {
    pending,
    error,
    // Lets a caller drop a stale error once it's confirmed superseded by a
    // real, newer ArgoCD state - see ArgoCommandPanel.tsx's own use of this
    // (2026-09-17 bug: "an argocd error message... isn't clearing... but
    // syncs took place and the ui updated" - `error` here only ever cleared
    // on the NEXT call through this same hook, so a sync that succeeded via
    // ArgoCD's own automated self-heal, not a repeat click through this
    // panel, left the earlier failed attempt's message sitting forever).
    clearError: () => setError(void 0),
    refresh: (cluster, appName) => call("refresh", "refresh", cluster, appName),
    hardRefresh: (cluster, appName) => call("hardRefresh", "refresh", cluster, appName, true),
    sync: (cluster, appName) => call("sync", "sync", cluster, appName)
  };
}
function useArgoStatusMap(appNames, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({});
  const key = appNames.join("|");
  useEffect(() => {
    const uniqueNames = [...new Set(appNames.filter(Boolean))];
    if (uniqueNames.length === 0) return void 0;
    let cancelled = false;
    uniqueNames.forEach((name) => {
      (async () => {
        try {
          const baseUrl = await discoveryApi.getBaseUrl("argocd");
          const res = await fetchApi.fetch(
            `${baseUrl}/find/name/${encodeURIComponent(name)}?expand=applications`
          );
          if (!res.ok) return;
          const instances = await res.json();
          const holder = instances.find((i) => (i.applications ?? []).length > 0);
          const app = holder?.applications?.[0];
          if (!cancelled && app) {
            setState((prev) => ({
              ...prev,
              [name]: {
                instance: holder?.name,
                syncStatus: app.status?.sync?.status,
                healthStatus: app.status?.health?.status,
                operationStartedAt: app.status?.operationState?.startedAt,
                operationFinishedAt: app.status?.operationState?.finishedAt,
                healthSince: app.status?.health?.lastTransitionTime,
                operationPhase: app.status?.operationState?.phase,
                source: app.spec?.source ? {
                  repoUrl: app.spec.source.repoURL,
                  path: app.spec.source.path,
                  targetRevision: app.spec.source.targetRevision
                } : void 0,
                // `automated` only exists on the spec at all once sync
                // automation is turned on - its own absence IS "manual
                // sync", not a value to read prune/selfHeal off of.
                syncPolicy: {
                  automated: Boolean(app.spec?.syncPolicy?.automated),
                  selfHeal: Boolean(app.spec?.syncPolicy?.automated?.selfHeal),
                  prune: Boolean(app.spec?.syncPolicy?.automated?.prune)
                },
                revision: app.status?.sync?.revision,
                operationMessage: app.status?.operationState?.message,
                reconciledAt: app.status?.reconciledAt,
                // `status.resources` (the live aggregate tree - has health,
                // never message/hookType) merged with the last sync
                // operation's own `operationState.syncResult.resources` (has
                // message/hookType, but only ever describes the resources
                // that operation actually touched) - matches ArgoCD's own
                // "Sync Status" UI panel, which does the identical merge
                // rather than picking one source (2026-09-16: "I would like
                // the argocd resource tree section to contain the same info
                // as argocd's UI does in the sync status page"). Keyed on
                // kind+namespace+name - Group/Version aren't carried by the
                // health-bearing side, so aren't part of the join key either.
                resources: (() => {
                  const syncResultByKey = new Map(
                    (app.status?.operationState?.syncResult?.resources ?? []).filter((r) => Boolean(r.kind && r.name)).map((r) => [`${r.kind}/${r.namespace ?? ""}/${r.name}`, r])
                  );
                  return app.status?.resources?.filter((r) => Boolean(r.kind && r.name)).map((r) => {
                    const syncResult = syncResultByKey.get(`${r.kind}/${r.namespace ?? ""}/${r.name}`);
                    return {
                      kind: r.kind,
                      name: r.name,
                      namespace: r.namespace,
                      syncStatus: r.status,
                      health: r.health?.status,
                      message: syncResult?.message,
                      hookType: syncResult?.hookType
                    };
                  });
                })(),
                conditions: (app.status?.conditions ?? []).filter((c) => Boolean(c.type && c.message))
              }
            }));
          }
        } catch {
        }
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [key, discoveryApi, fetchApi, refreshNonce]);
  return state;
}
function useDeployHistory(repoRef, environments, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({ loading: Boolean(repoRef) });
  const key = repoRef ? `${repoRef.owner}/${repoRef.repo}:${environments.map((e) => `${e.env}@${e.cluster}`).sort().join(",")}` : "";
  useEffect(() => {
    if (!repoRef || environments.length === 0) {
      setState({ loading: false });
      return void 0;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl("glidepath");
        const res = await fetchApi.fetch(`${baseUrl}/deploy-history`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner: repoRef.owner,
            appName: repoRef.repo,
            environments: environments.map((e) => ({ env: e.env, cluster: e.cluster }))
          })
        });
        if (!res.ok) {
          const body = await res.json().catch(() => void 0);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: errorMessage(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, discoveryApi, fetchApi, refreshNonce]);
  return state;
}

export { useArgoActions, useArgoStatusMap, useDeployHistory, useImageVersions, usePipelineOrder, usePromote, useProvenanceMap, useRepoHead };
//# sourceMappingURL=useReleaseData.esm.js.map
