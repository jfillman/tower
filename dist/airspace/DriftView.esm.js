import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useMemo } from 'react';
import { useTableKit, EmptyNote, Hint, Callout, Section, TextLink, StatusChip, Count } from '../ui/index.esm.js';
import { appsInGraph, fleetDrift, buildAppAirspace, formatRate } from './model.esm.js';
import { STATE_LABEL, STATE_TONE } from './presentation.esm.js';
import { useFleetValues } from './useAirspace.esm.js';
import { PanelSkeleton } from '../ui/LoadState.esm.js';

function DriftView({
  graph,
  env,
  cluster,
  apps,
  nonce,
  onOpenApp
}) {
  const tk = useTableKit();
  const names = useMemo(() => appsInGraph(graph, env, apps.map((a) => a.app)), [graph, env, apps]);
  const targets = useMemo(
    () => apps.filter((a) => names.includes(a.app) && a.owner).map((a) => ({ owner: a.owner, appName: a.app })),
    [apps, names]
  );
  const values = useFleetValues(targets, env, cluster, nonce);
  const items = useMemo(
    () => fleetDrift(
      names.filter((n) => values.byApp.has(n)).map((n) => buildAppAirspace({ app: n, env, graph, values: values.byApp.get(n) }))
    ),
    [names, values.byApp, env, graph]
  );
  if (names.length === 0) return /* @__PURE__ */ jsxs(EmptyNote, { inset: true, children: [
    "No app had traced traffic in ",
    env,
    " in this window."
  ] });
  if (values.loading && values.byApp.size === 0) return /* @__PURE__ */ jsx(PanelSkeleton, { label: "Reading values files" });
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Hint, { children: "Drift compares traffic with each app's declarations (networkPolicy.allowIngressFrom / allowEgressTo). Calls through a broker, to owned components and from the gateway are not drift." }),
    values.failed.length > 0 && /* @__PURE__ */ jsxs(Callout, { tone: "neutral", title: "Some values files could not be read", children: [
      values.failed.join(", "),
      ": their connections are left out."
    ] }),
    /* @__PURE__ */ jsx(Section, { title: "Drift", meta: /* @__PURE__ */ jsxs(Count, { children: [
      env,
      " \xB7 ",
      cluster
    ] }), count: items.length, framed: true, children: items.length === 0 ? /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: "Nothing out of step: every app-to-app call seen is declared, and every declaration saw traffic." }) : /* @__PURE__ */ jsxs("table", { className: tk.table, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { className: tk.th, children: "App" }),
        /* @__PURE__ */ jsx("th", { className: tk.th, children: "Connection" }),
        /* @__PURE__ */ jsx("th", { className: tk.th, children: "Traffic" }),
        /* @__PURE__ */ jsx("th", { className: tk.th, children: "State" })
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { children: items.map((d) => /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(TextLink, { onClick: () => onOpenApp(d.app), children: d.app }) }),
        /* @__PURE__ */ jsx("td", { className: tk.td, children: d.direction === "inbound" ? `\u2190 ${d.peer}` : `\u2192 ${d.peer}` }),
        /* @__PURE__ */ jsx("td", { className: tk.td, children: formatRate(d.rate) }),
        /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(StatusChip, { tone: STATE_TONE[d.state], children: STATE_LABEL[d.state] }) })
      ] }, `${d.app}:${d.direction}:${d.peer}`)) })
    ] }) })
  ] });
}

export { DriftView };
//# sourceMappingURL=DriftView.esm.js.map
