import { jsxs, jsx } from 'react/jsx-runtime';
import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import { useHangarTokens } from '../brand/tokens.esm.js';
import { HangarMark } from '../brand/HangarMark.esm.js';
import { TextLink, PageHeader, Subtabs, FilterBar, FilterChips, FilterSelect, Callout } from '../ui/index.esm.js';
import { RefreshButton } from '../RefreshButton.esm.js';
import { usePlatformConfig } from '../platformConfig.esm.js';
import { useRegisteredClusters } from '../environments/registeredClusters.esm.js';
import { airspaceClusters, WINDOWS } from './queries.esm.js';
import { useAirspaceSource, useServiceGraph } from './useAirspace.esm.js';
import { useHangarApps } from './useHangarApps.esm.js';
import { MapView } from './MapView.esm.js';
import { ContractsView } from './ContractsView.esm.js';
import { DriftView } from './DriftView.esm.js';

const SUBS = [
  { id: "map", label: "Map" },
  { id: "contracts", label: "Contracts" },
  { id: "drift", label: "Drift" }
];
const useStyles = makeStyles(() => ({
  root: { padding: "20px 24px 40px", display: "flex", flexDirection: "column", gap: 16 },
  brandRow: { display: "flex", alignItems: "center", gap: 10 }
}));
function AirspacePage({ onBack }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const [searchParams, setSearchParams] = useSearchParams();
  const sub = SUBS.find((s) => s.id === searchParams.get("sub"))?.id ?? "map";
  const appFilter = searchParams.get("app") ?? void 0;
  const platform = usePlatformConfig();
  const registry = useRegisteredClusters();
  const clusters = useMemo(
    () => airspaceClusters(
      registry.status === "ready" ? registry.clusters.map((r) => r.name) : void 0,
      platform.controlPlaneCluster,
      Object.keys(platform.clusters)
    ),
    [platform, registry]
  );
  const [cluster, setCluster] = useState(() => searchParams.get("cluster") ?? platform.controlPlaneCluster ?? "");
  const source = useAirspaceSource(cluster);
  useEffect(() => {
    if (!cluster && clusters[0]) setCluster(clusters[0]);
  }, [cluster, clusters]);
  const [win, setWin] = useState("1h");
  const [nonce, setNonce] = useState(0);
  const graph = useServiceGraph(cluster || void 0, win, nonce);
  const apps = useHangarApps();
  const appNames = useMemo(() => apps.apps.map((a) => a.app), [apps.apps]);
  const envs = useMemo(() => {
    const out = /* @__PURE__ */ new Set();
    for (const s of graph.graph.samples) {
      for (const svc of [s.client, s.server]) {
        const app = appNames.filter((a) => svc.startsWith(`${a}-`)).sort((a, b) => b.length - a.length)[0];
        if (app && svc.length > app.length + 1) out.add(svc.slice(app.length + 1));
      }
    }
    return [...out].sort();
  }, [graph.graph.samples, appNames]);
  const [envChoice, setEnvChoice] = useState(() => searchParams.get("env") ?? void 0);
  const env = envChoice && envs.includes(envChoice) ? envChoice : envs[0] ?? envChoice ?? "";
  const setSub = (s) => {
    const next = new URLSearchParams(searchParams);
    next.set("view", "airspace");
    next.set("sub", s);
    if (s !== "contracts") next.delete("app");
    setSearchParams(next);
  };
  const openApp = (app) => {
    const ref = apps.apps.find((a) => a.app === app)?.ref;
    if (ref) setSearchParams({ entity: ref, tab: "airspace" });
  };
  return /* @__PURE__ */ jsxs("div", { className: c.root, children: [
    /* @__PURE__ */ jsx(TextLink, { onClick: onBack, children: "\u2190 All services" }),
    /* @__PURE__ */ jsxs("div", { className: c.brandRow, children: [
      /* @__PURE__ */ jsx(HangarMark, { glyph: "tower", size: 22 }),
      /* @__PURE__ */ jsx(
        PageHeader,
        {
          title: "Airspace",
          subtitle: "Who talks to whom across the fleet, the APIs they publish, and what is seen but not declared.",
          actions: /* @__PURE__ */ jsx(RefreshButton, { onClick: () => setNonce((n) => n + 1) })
        }
      )
    ] }),
    /* @__PURE__ */ jsx(Subtabs, { label: "Airspace views", tabs: SUBS, value: sub, onChange: setSub }),
    /* @__PURE__ */ jsxs(FilterBar, { children: [
      clusters.length > 1 && /* @__PURE__ */ jsx(FilterChips, { label: "Cluster", options: clusters.map((x) => ({ id: x, label: x })), value: cluster, onChange: setCluster }),
      envs.length > 0 && /* @__PURE__ */ jsx(FilterSelect, { label: "Environment", value: env, options: envs.map((e) => ({ value: e, label: e })), onChange: setEnvChoice }),
      /* @__PURE__ */ jsx(FilterChips, { label: "Window", options: WINDOWS.map((w) => ({ id: w, label: w })), value: win, onChange: setWin })
    ] }),
    graph.error && /* @__PURE__ */ jsx(
      Callout,
      {
        tone: "warn",
        title: source.via === "hub" ? `Couldn't read ${cluster}'s service graph from the hub's Thanos` : `Couldn't read the service graph from ${cluster}'s Prometheus`,
        children: graph.error
      }
    ),
    apps.error && /* @__PURE__ */ jsx(Callout, { tone: "bad", title: "Couldn't read the catalog's services", children: apps.error }),
    sub === "map" && /* @__PURE__ */ jsx(MapView, { graph: graph.graph, env, knownApps: appNames, onOpenApp: openApp }),
    sub === "contracts" && /* @__PURE__ */ jsx(
      ContractsView,
      {
        graph: graph.graph,
        cluster,
        env,
        win,
        appFilter,
        compareTo: searchParams.get("compare") ?? void 0,
        roster: apps.entities,
        nonce,
        onOpenApp: openApp
      }
    ),
    sub === "drift" && /* @__PURE__ */ jsx(DriftView, { graph: graph.graph, env, cluster, apps: apps.apps, nonce, onOpenApp: openApp })
  ] });
}

export { AirspacePage };
//# sourceMappingURL=AirspacePage.esm.js.map
