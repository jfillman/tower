import { useMemo, useState, useEffect } from 'react';
import { usePrometheusInstantQuery } from '../usePrometheusQuery.esm.js';
import { useEnvValuesLoader } from '../values/sources.esm.js';
import { airspaceValuesOf } from './model.esm.js';
import { toServiceGraph, serviceGraphQueries, observedOperationsQuery } from './queries.esm.js';

const POLL_MS = 6e4;
function useServiceGraph(cluster, window2, nonce = 0) {
  const q = serviceGraphQueries(window2);
  const rate = usePrometheusInstantQuery(cluster, q.rate, nonce, POLL_MS);
  const p95 = usePrometheusInstantQuery(cluster, q.p95, nonce, POLL_MS);
  const errors = usePrometheusInstantQuery(cluster, q.errors, nonce, POLL_MS);
  const graph = useMemo(() => toServiceGraph(rate.samples, p95.samples, errors.samples), [rate.samples, p95.samples, errors.samples]);
  return { loading: rate.loading && rate.samples.length === 0, error: rate.error, graph };
}
function useObservedOperations(cluster, service, window2) {
  const r = usePrometheusInstantQuery(cluster, service ? observedOperationsQuery(service, window2) : void 0);
  return useMemo(
    () => ({
      loading: r.loading,
      error: r.error,
      operations: r.samples.filter((s) => s.metric.span_name && Number.isFinite(s.value)).map((s) => ({ name: s.metric.span_name, rate: s.value })).sort((a, b) => b.rate - a.rate)
    }),
    [r.loading, r.error, r.samples]
  );
}
function useAirspaceValues(target, nonce = 0) {
  const load = useEnvValuesLoader();
  const [state, setState] = useState({ loading: Boolean(target) });
  const key = target ? `${target.owner}/${target.appName}/${target.tier}/${target.cluster ?? ""}/${target.env}` : "";
  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return void 0;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: void 0 }));
    load(target).then((v) => {
      if (!cancelled) setState({ loading: false, values: airspaceValuesOf(v) });
    }).catch((e) => {
      if (!cancelled) setState({ loading: false, error: e instanceof Error ? e.message : String(e) });
    });
    return () => {
      cancelled = true;
    };
  }, [key, nonce, load]);
  return state;
}
function useFleetValues(targets, env, cluster, nonce = 0) {
  const load = useEnvValuesLoader();
  const [state, setState] = useState({
    loading: false,
    byApp: /* @__PURE__ */ new Map(),
    failed: []
  });
  const key = `${env}/${cluster}/${targets.map((t) => `${t.owner}/${t.appName}`).sort().join(",")}`;
  useEffect(() => {
    if (!targets.length || !env) {
      setState({ loading: false, byApp: /* @__PURE__ */ new Map(), failed: [] });
      return void 0;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    Promise.all(
      targets.map(async (t) => {
        try {
          return [t.appName, await load({ ...t, env, tier: "ground" })];
        } catch {
          try {
            return [t.appName, await load({ ...t, env, tier: "flight", cluster })];
          } catch {
            return [t.appName, void 0];
          }
        }
      })
    ).then((results) => {
      if (cancelled) return;
      const byApp = /* @__PURE__ */ new Map();
      const failed = [];
      for (const [app, v] of results) {
        if (v) byApp.set(app, airspaceValuesOf(v));
        else failed.push(app);
      }
      setState({ loading: false, byApp, failed });
    });
    return () => {
      cancelled = true;
    };
  }, [key, nonce, load]);
  return state;
}
const VIEW_KEY = "tower.airspace.view";
function loadAirspaceView() {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "radar" ? "radar" : "strips";
  } catch {
    return "strips";
  }
}
function saveAirspaceView(view) {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
  }
}

export { loadAirspaceView, saveAirspaceView, useAirspaceValues, useFleetValues, useObservedOperations, useServiceGraph };
//# sourceMappingURL=useAirspace.esm.js.map
