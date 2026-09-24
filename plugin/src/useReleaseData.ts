import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import type {
  ArgoApplicationSummary,
  DeployHistoryEntry,
  ImageVersion,
  ProvenanceResponse,
  PromoteRequest,
  PromoteResult,
  RepoHead,
} from './types';

// Every hook in this file calls a backend route that already exists and is
// already live (packages/backend/src/glidepathProvenance.ts, pluginId
// 'glidepath'; the redhat-argocd-backend community plugin, pluginId
// 'argocd') - Tower reuses these directly rather than standing up parallel
// backend routes. Per HANDOFF-tower-module.md: reusing a plugin's *backend*
// data route is fine and avoids re-plumbing auth (GitHub token, ArgoCD
// credentials) Tower has no reason to hold a second copy of; only the
// *frontend* gets reimplemented in Tower's own design language. Ported from
// GlidepathPage.tsx's identical hooks (same names kept for continuity)
// rather than imported, since that module must stay untouched.

// Every catch block below does `throw new Error(body?.error ?? ...)` then
// displays the caught error - but every backend route in
// glidepathProvenance.ts itself catches with `res.status(xxx).json({ error:
// String(e) })`, and String() on a real Error already prepends "Error: " to
// its message. Displaying via plain `String(caughtError)` double-wraps that
// ("Error: Error: ArgoCD refresh for order-api-pre-prod on kiac-prod failed
// with 503: no available server" - confirmed live, 2026-09-16 Deployments
// tab bug report). `.message` on a real Error never carries that prefix, so
// it's the one safe way to unwrap a caught value here regardless of whether
// it's an Error (the normal case, from the `throw new Error(...)` above) or
// something else a `.catch` handler was never guaranteed to receive.
function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useRepoHead(
  target: { owner: string; repo: string; ref?: string } | undefined,
  refreshNonce = 0,
) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: RepoHead }>({
    loading: Boolean(target),
  });
  const key = target ? `${target.owner}/${target.repo}@${target.ref ?? ''}` : '';

  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return undefined;
    }
    let cancelled = false;
    // Keeps previously-loaded data visible during a background refetch
    // instead of wiping it to `{ loading: true }` first - see
    // usePipelineOrder's own comment below for the real bug this caused.
    setState(prev => ({ ...prev, loading: true }));
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('glidepath');
        const params = new URLSearchParams({ owner: target.owner, repo: target.repo });
        if (target.ref) params.set('ref', target.ref);
        const res = await fetchApi.fetch(`${baseUrl}/head?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => undefined);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = (await res.json()) as RepoHead;
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: errorMessage(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, discoveryApi, fetchApi, refreshNonce]);

  return state;
}

// Real GHCR package versions for the Images tab - one call per tab view,
// not polled, same posture as useRepoHead/useDeployHistory (see
// usePipelineOrder's own comment on why refreshNonce is manual, not a poll).
// Ported from GlidepathPage.tsx's identical hook (same name kept for
// continuity) rather than imported, since that module must stay untouched.
export function useImageVersions(
  ownerRepo: { owner: string; repo: string } | undefined,
  refreshNonce = 0,
) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: ImageVersion[] }>({
    loading: Boolean(ownerRepo),
  });
  const key = ownerRepo ? `${ownerRepo.owner}/${ownerRepo.repo}` : '';

  useEffect(() => {
    if (!ownerRepo) {
      setState({ loading: false });
      return undefined;
    }
    let cancelled = false;
    // Keeps previously-loaded data visible during a background refetch
    // instead of wiping it to `{ loading: true }` first - see
    // usePipelineOrder's own comment below for the real bug this caused.
    setState(prev => ({ ...prev, loading: true }));
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('glidepath');
        const params = new URLSearchParams({ owner: ownerRepo.owner, repo: ownerRepo.repo });
        const res = await fetchApi.fetch(`${baseUrl}/images?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => undefined);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = (await res.json()) as ImageVersion[];
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: errorMessage(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, discoveryApi, fetchApi, refreshNonce]);

  return state;
}

// refreshNonce: bump it (from a caller's own `useState`) to force a refetch
// without waiting for `ownerRepo` to change. No automatic polling here -
// this hits GitHub through the glidepath backend, and this platform has a
// real prior GitHub rate-limit exhaustion incident on its books (see
// project_kiac_github_rate_limit_investigation) - manual, user-triggered
// refresh only. Defaults to 0 so existing callers that never pass it are
// unaffected.
export function usePipelineOrder(
  ownerRepo: { owner: string; repo: string } | undefined,
  refreshNonce = 0,
) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{
    loading: boolean;
    error?: string;
    data?: string[];
    lower?: string[];
    upper?: string[];
    // env name -> cluster, upper envs only - see the backend route's own
    // comment on why this rides alongside `upper` instead of changing its
    // shape. Used by ConfigTab.tsx to build its env picker directly from
    // cicd.yaml's declared upper environments, not from live
    // Kubernetes-discovered ones (a `rollout: null` env has no live
    // workload to discover yet, but still needs to be editable).
    upperClusters?: Record<string, string>;
  }>({ loading: Boolean(ownerRepo) });
  const key = ownerRepo ? `${ownerRepo.owner}/${ownerRepo.repo}` : '';

  useEffect(() => {
    if (!ownerRepo) {
      setState({ loading: false });
      return undefined;
    }
    let cancelled = false;
    // Keeps previously-loaded data/error visible while a background refetch
    // is in flight (2026-09-12 bug: a manual Refresh click - and, once the
    // CI/CD tab started auto-polling every 20s while a delivery is active,
    // every one of THOSE ticks too - reset this straight to `{ loading:
    // true }`, wiping out pipelineOrder's lower/upper for that whole window.
    // envTierOf falls back to 'lower' whenever pipelineOrder isn't loaded
    // (see types.ts's own comment on that default), so every Flight env
    // misclassified as Ground for a moment, collapsing/reshuffling the CD
    // panel's tier tabs on every single poll tick - "the CICD refresh now
    // redraws the screen and moves the page away from the CD panel").
    setState(prev => ({ ...prev, loading: true }));
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('glidepath');
        const params = new URLSearchParams({ owner: ownerRepo.owner, repo: ownerRepo.repo });
        const res = await fetchApi.fetch(`${baseUrl}/pipeline-order?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => undefined);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = (await res.json()) as {
          order: string[];
          lower: string[];
          upper: string[];
          upperClusters: Record<string, string>;
        };
        if (!cancelled) {
          setState({
            loading: false,
            data: data.order,
            lower: data.lower,
            upper: data.upper,
            upperClusters: data.upperClusters,
          });
        }
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: errorMessage(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, discoveryApi, fetchApi, refreshNonce]);

  return state;
}

export interface ProvenanceState {
  loading: boolean;
  error?: string;
  data?: ProvenanceResponse;
}

// See usePipelineOrder's own comment: refreshNonce is a manual re-fetch
// trigger, not a poll interval - deliberately no setInterval here.
export function useProvenanceMap(images: string[], refreshNonce = 0): Record<string, ProvenanceState> {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<Record<string, ProvenanceState>>({});
  const key = images.join('|');

  useEffect(() => {
    const uniqueImages = [...new Set(images.filter(Boolean))];
    if (uniqueImages.length === 0) return undefined;
    let cancelled = false;
    setState(prev => {
      const next = { ...prev };
      uniqueImages.forEach(image => {
        if (!next[image]) next[image] = { loading: true };
      });
      return next;
    });
    uniqueImages.forEach(image => {
      (async () => {
        try {
          const baseUrl = await discoveryApi.getBaseUrl('glidepath');
          const res = await fetchApi.fetch(
            `${baseUrl}/provenance?image=${encodeURIComponent(image)}`,
          );
          if (!res.ok) {
            const body = await res.json().catch(() => undefined);
            throw new Error(body?.error ?? `request failed with ${res.status}`);
          }
          const data = (await res.json()) as ProvenanceResponse;
          if (!cancelled) setState(prev => ({ ...prev, [image]: { loading: false, data } }));
        } catch (e) {
          if (!cancelled) {
            setState(prev => ({ ...prev, [image]: { loading: false, error: errorMessage(e) } }));
          }
        }
      })();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, discoveryApi, fetchApi, refreshNonce]);

  return state;
}

export function usePromote() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; result?: PromoteResult }>(
    { loading: false },
  );

  const promote = async (request: PromoteRequest) => {
    setState({ loading: true });
    try {
      const baseUrl = await discoveryApi.getBaseUrl('glidepath');
      const res = await fetchApi.fetch(`${baseUrl}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => undefined);
        throw new Error(body?.error ?? `request failed with ${res.status}`);
      }
      const result = (await res.json()) as PromoteResult;
      setState({ loading: false, result });
    } catch (e) {
      setState({ loading: false, error: errorMessage(e) });
    }
  };

  const reset = () => setState({ loading: false });

  return { ...state, promote, reset };
}

// ArgoCD Refresh + Sync (HANDOFF-tower-write-actions.md Tier 1) - hits the
// new /argo/refresh and /argo/sync routes glidepathProvenance.ts's backend
// plugin adds (glidepathArgoActions.ts), not the read-only redhat-argocd
// community plugin useArgoStatusMap above already reuses - see that file's
// own comment for why refresh/sync needed a route of their own. `pending`
// names which action is in flight ('refresh' | 'hardRefresh' | 'sync')
// rather than a bare boolean so a caller can disable just the one button
// that's actually running, not both at once.
//
// Hard refresh (2026-09-16: "hard refresh is missing") - refreshArgoApp's
// backend implementation already accepted a `hard` flag from day one
// (`?refresh=hard` bypasses ArgoCD's manifest cache, vs `normal`'s cached
// re-diff), it just had no frontend caller passing `hard: true` yet. Zero
// new backend work, zero new RBAC (same `get`-only Tier 1 action as a plain
// refresh) - purely a missing button.
export function useArgoActions() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [pending, setPending] = useState<'refresh' | 'hardRefresh' | 'sync' | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const call = async (
    pendingKey: 'refresh' | 'hardRefresh' | 'sync',
    path: 'refresh' | 'sync',
    cluster: string,
    appName: string,
    hard?: boolean,
  ) => {
    setPending(pendingKey);
    setError(undefined);
    try {
      const baseUrl = await discoveryApi.getBaseUrl('glidepath');
      const res = await fetchApi.fetch(`${baseUrl}/argo/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster, appName, ...(hard ? { hard: true } : {}) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => undefined);
        throw new Error(body?.error ?? `request failed with ${res.status}`);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(undefined);
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
    clearError: () => setError(undefined),
    refresh: (cluster: string, appName: string) => call('refresh', 'refresh', cluster, appName),
    hardRefresh: (cluster: string, appName: string) => call('hardRefresh', 'refresh', cluster, appName, true),
    sync: (cluster: string, appName: string) => call('sync', 'sync', cluster, appName),
  };
}

// Best-effort ArgoCD sync status, same route Glidepath's module already
// calls (the backstage-ingestor ServiceAccount has no direct RBAC for
// applications.argoproj.io - see GlidepathPage.tsx's own comment).
export function useArgoStatusMap(
  appNames: string[],
  refreshNonce = 0,
): Record<string, ArgoApplicationSummary | undefined> {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<Record<string, ArgoApplicationSummary | undefined>>({});
  const key = appNames.join('|');

  useEffect(() => {
    const uniqueNames = [...new Set(appNames.filter(Boolean))];
    if (uniqueNames.length === 0) return undefined;
    let cancelled = false;
    uniqueNames.forEach(name => {
      (async () => {
        try {
          const baseUrl = await discoveryApi.getBaseUrl('argocd');
          const res = await fetchApi.fetch(
            `${baseUrl}/find/name/${encodeURIComponent(name)}?expand=applications`,
          );
          if (!res.ok) return;
          const instances = (await res.json()) as Array<{
            applications?: Array<{
              spec?: {
                source?: { repoURL?: string; path?: string; targetRevision?: string };
                syncPolicy?: { automated?: { prune?: boolean; selfHeal?: boolean } };
              };
              status?: {
                sync?: { status?: string; revision?: string };
                health?: { status?: string; lastTransitionTime?: string };
                reconciledAt?: string;
                operationState?: {
                  startedAt?: string;
                  finishedAt?: string;
                  phase?: string;
                  message?: string;
                  // The last sync operation's own per-resource result list -
                  // real fields status.resources itself doesn't carry
                  // (message, hookType) - see ArgoResourceNode's own comment
                  // on why the resource tree merges both sources, the same
                  // way ArgoCD's own UI "Sync Status" panel does.
                  syncResult?: {
                    resources?: Array<{
                      kind?: string;
                      name?: string;
                      namespace?: string;
                      status?: string;
                      message?: string;
                      hookType?: string;
                    }>;
                  };
                };
                resources?: Array<{
                  kind?: string;
                  name?: string;
                  namespace?: string;
                  status?: string;
                  health?: { status?: string };
                }>;
                // Real Application-level problems ArgoCD's own UI shows as a
                // standing warning/error banner (ComparisonError,
                // SyncError, ...) - distinct from operationState.message
                // (which describes the last SYNC OPERATION specifically);
                // a condition can be present even between syncs, e.g. a
                // live comparison failure (2026-09-16: "the argocd info
                // panel is missing vital info - there was a sync result
                // message" - the screenshot showed both this AND the
                // operation message, neither surfaced prominently before).
                conditions?: Array<{ type?: string; message?: string }>;
              };
            }>;
          }>;
          const app = instances.flatMap(i => i.applications ?? [])[0];
          if (!cancelled && app) {
            setState(prev => ({
              ...prev,
              [name]: {
                syncStatus: app.status?.sync?.status,
                healthStatus: app.status?.health?.status,
                operationStartedAt: app.status?.operationState?.startedAt,
                operationFinishedAt: app.status?.operationState?.finishedAt,
                healthSince: app.status?.health?.lastTransitionTime,
                operationPhase: app.status?.operationState?.phase,
                source: app.spec?.source
                  ? {
                      repoUrl: app.spec.source.repoURL,
                      path: app.spec.source.path,
                      targetRevision: app.spec.source.targetRevision,
                    }
                  : undefined,
                // `automated` only exists on the spec at all once sync
                // automation is turned on - its own absence IS "manual
                // sync", not a value to read prune/selfHeal off of.
                syncPolicy: {
                  automated: Boolean(app.spec?.syncPolicy?.automated),
                  selfHeal: Boolean(app.spec?.syncPolicy?.automated?.selfHeal),
                  prune: Boolean(app.spec?.syncPolicy?.automated?.prune),
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
                    (app.status?.operationState?.syncResult?.resources ?? [])
                      .filter(r => Boolean(r.kind && r.name))
                      .map(r => [`${r.kind}/${r.namespace ?? ''}/${r.name}`, r]),
                  );
                  return app.status?.resources
                    ?.filter(r => Boolean(r.kind && r.name))
                    .map(r => {
                      const syncResult = syncResultByKey.get(`${r.kind}/${r.namespace ?? ''}/${r.name}`);
                      return {
                        kind: r.kind!,
                        name: r.name!,
                        namespace: r.namespace,
                        syncStatus: r.status,
                        health: r.health?.status,
                        message: syncResult?.message,
                        hookType: syncResult?.hookType,
                      };
                    });
                })(),
                conditions: (app.status?.conditions ?? [])
                  .filter((c): c is { type: string; message: string } => Boolean(c.type && c.message)),
              },
            }));
          }
        } catch {
          // Best-effort - see this hook's own comment above.
        }
      })();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, discoveryApi, fetchApi, refreshNonce]);

  return state;
}

// Real deploy history for the Release Timeline/Lead Time panels - one commit
// per real promotion, sourced from whichever file each environment's own
// tier commits to (glidepathProvenance.ts's fetchDeployHistory). Fetched
// once per (owner, appName, env set), not on the Kubernetes poll cadence -
// deploy history only changes when an actual promotion happens. See
// usePipelineOrder's own comment on refreshNonce: manual re-fetch, no poll.
export function useDeployHistory(
  repoRef: { owner: string; repo: string } | undefined,
  environments: Array<{ env: string; cluster: string }>,
  refreshNonce = 0,
) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{
    loading: boolean;
    error?: string;
    data?: Record<string, DeployHistoryEntry[]>;
  }>({ loading: Boolean(repoRef) });
  const key = repoRef
    ? `${repoRef.owner}/${repoRef.repo}:${environments
        .map(e => `${e.env}@${e.cluster}`)
        .sort()
        .join(',')}`
    : '';

  useEffect(() => {
    if (!repoRef || environments.length === 0) {
      setState({ loading: false });
      return undefined;
    }
    let cancelled = false;
    // Keeps previously-loaded data visible during a background refetch
    // instead of wiping it to `{ loading: true }` first - see
    // usePipelineOrder's own comment above for the real bug this caused,
    // and why this also mattered for gitopsPrs specifically (usePullRequests
    // has the identical fix): deploy-history briefly going empty during a
    // refetch could make a delivery look like it had no PR at all for a
    // moment (2026-09-12 bug: "the gate pill disappeared").
    setState(prev => ({ ...prev, loading: true }));
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('glidepath');
        const res = await fetchApi.fetch(`${baseUrl}/deploy-history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner: repoRef.owner,
            appName: repoRef.repo,
            environments: environments.map(e => ({ env: e.env, cluster: e.cluster })),
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => undefined);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = (await res.json()) as Record<string, DeployHistoryEntry[]>;
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: errorMessage(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, discoveryApi, fetchApi, refreshNonce]);

  return state;
}
