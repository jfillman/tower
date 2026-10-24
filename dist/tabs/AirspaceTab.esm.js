import { jsx, jsxs } from 'react/jsx-runtime';
import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import { useHangarTokens } from '../brand/tokens.esm.js';
import { EmptyNote, FilterBar, FilterChips, Count, Callout, TextLink, PageHeader } from '../ui/index.esm.js';
import { useReleaseContext } from '../useReleaseContext.esm.js';
import { RefreshButton } from '../RefreshButton.esm.js';
import { EnvPicker } from '../EnvPicker.esm.js';
import { envTierOf, envStageRank, health } from '../types.esm.js';
import { AirspaceStrips } from '../airspace/AirspaceStrips.esm.js';
import { AirspaceRadar } from '../airspace/AirspaceRadar.esm.js';
import { buildAppAirspace, serviceNameOf } from '../airspace/model.esm.js';
import { WINDOWS } from '../airspace/queries.esm.js';
import { loadAirspaceView, useServiceGraph, useAirspaceSource, useAirspaceValues, saveAirspaceView } from '../airspace/useAirspace.esm.js';
import { TabSkeleton, TabError } from '../ui/LoadState.esm.js';

const TIER_DISPLAY_ORDER = ["lower", "upper", "preview"];
const useStyles = makeStyles(() => ({
  main: { display: "flex", flexDirection: "column", gap: 16 },
  links: { display: "flex", flexWrap: "wrap", gap: 16 }
}));
function AirspaceTab() {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const { environments, loading, error, appName, owner, pipelineOrder, refresh, entity } = useReleaseContext();
  const [, setSearchParams] = useSearchParams();
  const [selectedEnv, setSelectedEnv] = useState(void 0);
  const [win, setWin] = useState("1h");
  const [view, setViewState] = useState(() => loadAirspaceView());
  const [nonce, setNonce] = useState(0);
  const setView = (v) => {
    setViewState(v);
    saveAirspaceView(v);
  };
  const deployed = useMemo(() => environments.filter((e) => e.deployed !== false), [environments]);
  useEffect(() => {
    if (selectedEnv && deployed.some((e) => e.env === selectedEnv)) return;
    setSelectedEnv(deployed[0]?.env);
  }, [deployed, selectedEnv]);
  const order = { lower: pipelineOrder.lower, upper: pipelineOrder.upper };
  const selected = deployed.find((e) => e.env === selectedEnv) ?? deployed[0];
  const tier = selected ? envTierOf(selected.env, order) : void 0;
  const valuesTarget = selected && owner && appName && tier !== "preview" ? { owner, appName, env: selected.env, tier: tier === "upper" ? "flight" : "ground", cluster: selected.cluster } : void 0;
  const graphState = useServiceGraph(selected?.cluster, win, nonce);
  const graphSource = useAirspaceSource(selected?.cluster);
  const valuesState = useAirspaceValues(valuesTarget, nonce);
  const airspace = useMemo(
    () => selected && appName ? buildAppAirspace({ app: appName, env: selected.env, graph: graphState.graph, values: valuesState.values }) : void 0,
    [selected, appName, graphState.graph, valuesState.values]
  );
  const pickerGroups = useMemo(
    () => TIER_DISPLAY_ORDER.map((tr) => ({
      tier: tr,
      items: deployed.filter((e) => envTierOf(e.env, order) === tr).sort((a, b) => envStageRank(a.env, pipelineOrder.data) - envStageRank(b.env, pipelineOrder.data)).map((e) => ({
        key: e.key,
        envName: e.env,
        cluster: e.cluster,
        health: health(e),
        active: e.env === selected?.env,
        onClick: () => setSelectedEnv(e.env)
      }))
    })).filter((g) => g.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deployed, selected?.env, pipelineOrder]
  );
  const ns = entity?.metadata.namespace ?? "default";
  const openApp = (app) => setSearchParams({ entity: `component:${ns}/${app}`, tab: "airspace" });
  const openFleet = (sub) => setSearchParams(sub === "contracts" && appName ? { view: "airspace", sub, app: appName } : { view: "airspace", sub });
  const doRefresh = () => {
    setNonce((n) => n + 1);
    refresh();
  };
  const header = /* @__PURE__ */ jsx(
    PageHeader,
    {
      title: "Airspace",
      subtitle: "Who this app talks to: seen in traces, declared in its values file, and owned as components.",
      actions: /* @__PURE__ */ jsx(RefreshButton, { onClick: doRefresh })
    }
  );
  if (loading) return /* @__PURE__ */ jsx(TabSkeleton, {});
  if (error) return /* @__PURE__ */ jsx(TabError, { error, what: "the environments", onRetry: refresh });
  if (!selected || !airspace) {
    return /* @__PURE__ */ jsxs("div", { className: c.main, children: [
      header,
      /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: "Once this app runs in an environment, its connections show here." })
    ] });
  }
  const self = serviceNameOf(airspace.app, airspace.env);
  const noTraces = !graphState.loading && !graphState.error && graphState.graph.samples.length === 0;
  const selfSeen = graphState.graph.samples.some((s) => s.client === self || s.server === self);
  const valuesKnown = Boolean(valuesState.values);
  return /* @__PURE__ */ jsxs("div", { className: c.main, children: [
    header,
    /* @__PURE__ */ jsx(EnvPicker, { summary: `${deployed.length} environment${deployed.length === 1 ? "" : "s"}`, groups: pickerGroups, showConnectors: false }),
    /* @__PURE__ */ jsxs(
      FilterBar,
      {
        end: /* @__PURE__ */ jsxs(Count, { children: [
          airspace.inbound.length + airspace.outbound.length,
          " connections \xB7 ",
          airspace.owned.length,
          " owned"
        ] }),
        children: [
          /* @__PURE__ */ jsx(
            FilterChips,
            {
              label: "View",
              options: [
                { id: "strips", label: "Strips" },
                { id: "radar", label: "Radar" }
              ],
              value: view,
              onChange: (v) => setView(v)
            }
          ),
          /* @__PURE__ */ jsx(FilterChips, { label: "Window", options: WINDOWS.map((w) => ({ id: w, label: w })), value: win, onChange: setWin })
        ]
      }
    ),
    graphState.error && /* @__PURE__ */ jsxs(
      Callout,
      {
        tone: "warn",
        title: graphSource.via === "hub" ? `Couldn't read ${selected.cluster}'s service graph from the hub's Thanos` : `Couldn't read the service graph from ${selected.cluster}'s Prometheus`,
        children: [
          graphState.error,
          ". Declared and owned connections still show."
        ]
      }
    ),
    noTraces && /* @__PURE__ */ jsx(Callout, { tone: "neutral", title: "No traces from this cluster yet", children: "The service graph comes from Tempo, fed by OpenTelemetry auto-instrumentation. A cluster without its tracing stack, or apps not yet rolled with the agent, shows declared and owned connections only." }),
    !noTraces && !graphState.loading && !selfSeen && !graphState.error && /* @__PURE__ */ jsx(Callout, { tone: "neutral", title: `No traffic for ${self} in the last ${win}`, children: "The app sent and received no traced requests in this window. Try a longer window." }),
    valuesState.error && /* @__PURE__ */ jsxs(Callout, { tone: "neutral", title: "Couldn't read this environment's values file", children: [
      valuesState.error,
      ". Without it nothing can be called declared, owned or undeclared; traffic still shows."
    ] }),
    airspace.drift.undeclared > 0 && /* @__PURE__ */ jsxs(Callout, { tone: "warn", label: "Drift", children: [
      airspace.drift.undeclared,
      " ",
      airspace.drift.undeclared === 1 ? "connection is" : "connections are",
      " seen in traffic but not declared. Today the declaration is networkPolicy.allowIngressFrom / allowEgressTo in the values file, so most app-to-app calls start out undeclared."
    ] }),
    view === "radar" ? /* @__PURE__ */ jsx(AirspaceRadar, { airspace, valuesKnown, onOpenApp: openApp }) : /* @__PURE__ */ jsx(AirspaceStrips, { airspace, valuesKnown, onOpenApp: openApp }),
    /* @__PURE__ */ jsxs("div", { className: c.links, children: [
      /* @__PURE__ */ jsxs(TextLink, { onClick: () => openFleet("contracts"), children: [
        "Contracts for ",
        appName,
        " \u2192"
      ] }),
      /* @__PURE__ */ jsx(TextLink, { onClick: () => openFleet("map"), children: "Fleet map \u2192" }),
      /* @__PURE__ */ jsx(TextLink, { onClick: () => openFleet("drift"), children: "Fleet drift \u2192" })
    ] })
  ] });
}

export { AirspaceTab };
//# sourceMappingURL=AirspaceTab.esm.js.map
