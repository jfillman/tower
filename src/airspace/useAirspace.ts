import { useEffect, useMemo, useState } from 'react';
import { usePrometheusInstantQuery } from '../usePrometheusQuery';
import { useEnvValuesLoader, type EnvValuesTarget } from '../values/sources';
import { airspaceValuesOf, type AirspaceValues, type ServiceGraph } from './model';
import { observedOperationsQuery, serviceGraphQueries, toServiceGraph, type AirspaceWindow } from './queries';

// Live data for Airspace. The service graph comes from the cluster's own Prometheus (no GitHub, so it may poll); the
// values files come through the Glidepath backend from GitHub, so they load once per selection and on Refresh only.

const POLL_MS = 60_000;

export interface ServiceGraphState {
  loading: boolean;
  error?: string;
  graph: ServiceGraph;
}

export function useServiceGraph(cluster: string | undefined, window: AirspaceWindow, nonce = 0): ServiceGraphState {
  const q = serviceGraphQueries(window);
  const rate = usePrometheusInstantQuery(cluster, q.rate, nonce, POLL_MS);
  const p95 = usePrometheusInstantQuery(cluster, q.p95, nonce, POLL_MS);
  const errors = usePrometheusInstantQuery(cluster, q.errors, nonce, POLL_MS);
  const graph = useMemo(() => toServiceGraph(rate.samples, p95.samples, errors.samples), [rate.samples, p95.samples, errors.samples]);
  // Only the rate query decides loading/error: the other two are optional detail.
  return { loading: rate.loading && rate.samples.length === 0, error: rate.error, graph };
}

export function useObservedOperations(cluster: string | undefined, service: string | undefined, window: AirspaceWindow) {
  const r = usePrometheusInstantQuery(cluster, service ? observedOperationsQuery(service, window) : undefined);
  return useMemo(
    () => ({
      loading: r.loading,
      error: r.error,
      operations: r.samples
        .filter(s => s.metric.span_name && Number.isFinite(s.value))
        .map(s => ({ name: s.metric.span_name, rate: s.value }))
        .sort((a, b) => b.rate - a.rate),
    }),
    [r.loading, r.error, r.samples],
  );
}

export interface ValuesState {
  loading: boolean;
  error?: string;
  values?: AirspaceValues;
}

/** One environment's values file, read once per target (and on `nonce`). */
export function useAirspaceValues(target: EnvValuesTarget | undefined, nonce = 0): ValuesState {
  const load = useEnvValuesLoader();
  const [state, setState] = useState<ValuesState>({ loading: Boolean(target) });
  const key = target ? `${target.owner}/${target.appName}/${target.tier}/${target.cluster ?? ''}/${target.env}` : '';
  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return undefined;
    }
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: undefined }));
    load(target)
      .then(v => {
        if (!cancelled) setState({ loading: false, values: airspaceValuesOf(v as Record<string, unknown>) });
      })
      .catch(e => {
        if (!cancelled) setState({ loading: false, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
    // `target` is identified by `key`; a new object with the same key must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce, load]);
  return state;
}

/** Several apps' values files for one env, for the fleet Drift view. Each app tries Ground, then Flight. */
export function useFleetValues(
  targets: Array<{ owner: string; appName: string }>,
  env: string,
  cluster: string,
  nonce = 0,
): { loading: boolean; byApp: Map<string, AirspaceValues>; failed: string[] } {
  const load = useEnvValuesLoader();
  const [state, setState] = useState<{ loading: boolean; byApp: Map<string, AirspaceValues>; failed: string[] }>({
    loading: false,
    byApp: new Map(),
    failed: [],
  });
  const key = `${env}/${cluster}/${targets.map(t => `${t.owner}/${t.appName}`).sort().join(',')}`;
  useEffect(() => {
    if (!targets.length || !env) {
      setState({ loading: false, byApp: new Map(), failed: [] });
      return undefined;
    }
    let cancelled = false;
    setState(s => ({ ...s, loading: true }));
    Promise.all(
      targets.map(async t => {
        try {
          return [t.appName, await load({ ...t, env, tier: 'ground' })] as const;
        } catch {
          try {
            return [t.appName, await load({ ...t, env, tier: 'flight', cluster })] as const;
          } catch {
            return [t.appName, undefined] as const;
          }
        }
      }),
    ).then(results => {
      if (cancelled) return;
      const byApp = new Map<string, AirspaceValues>();
      const failed: string[] = [];
      for (const [app, v] of results) {
        if (v) byApp.set(app, airspaceValuesOf(v as Record<string, unknown>));
        else failed.push(app);
      }
      setState({ loading: false, byApp, failed });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce, load]);
  return state;
}

const VIEW_KEY = 'tower.airspace.view';
export type AirspaceView = 'strips' | 'radar';

export function loadAirspaceView(): AirspaceView {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'radar' ? 'radar' : 'strips';
  } catch {
    return 'strips';
  }
}

export function saveAirspaceView(view: AirspaceView): void {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Private mode or blocked storage: the choice just isn't remembered.
  }
}
