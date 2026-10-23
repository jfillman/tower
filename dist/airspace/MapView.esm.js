import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { useHangarTokens } from '../brand/tokens.esm.js';
import { useTableKit, EmptyNote, Card, Hint, Fact, TextLink } from '../ui/index.esm.js';
import { buildFleetGraph, formatRate, formatSeconds } from './model.esm.js';
import { NODE_W, NODE_H, GraphCanvas } from './GraphCanvas.esm.js';
import { KIND_LABEL } from './presentation.esm.js';

const COL_GAP = 90;
const ROW_GAP = 20;
const PAD = 24;
const useStyles = makeStyles(() => ({
  // The map takes the full width (a fleet is wider than one app's radar); the detail of a node sits under it.
  layout: { display: "flex", flexDirection: "column", gap: 16 },
  canvasCard: { minWidth: 0 },
  inspector: { minWidth: 0 }
}));
function roleWord(role) {
  if (role === "ingress") return "no traced caller";
  return role === "peer" ? "not a Hangar app" : "app";
}
function MapView({
  graph,
  env,
  knownApps,
  onOpenApp
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const tk = useTableKit();
  const fleet = useMemo(() => buildFleetGraph(graph, env, knownApps), [graph, env, knownApps]);
  const [selected, setSelected] = useState(void 0);
  const layout = useMemo(() => {
    const byCol = /* @__PURE__ */ new Map();
    fleet.nodes.forEach((n) => byCol.set(n.column, [...byCol.get(n.column) ?? [], n.id]));
    const tallest = Math.max(1, ...[...byCol.values()].map((ids) => ids.length));
    const height = PAD * 2 + tallest * NODE_H + (tallest - 1) * ROW_GAP;
    const width = PAD * 2 + fleet.columns * NODE_W + (fleet.columns - 1) * COL_GAP;
    const nodes = fleet.nodes.map((n) => {
      const ids = byCol.get(n.column);
      const i = ids.indexOf(n.id);
      const colH = ids.length * NODE_H + (ids.length - 1) * ROW_GAP;
      const inbound = fleet.edges.filter((e) => e.to === n.id).reduce((s, e) => s + e.stats.rate, 0);
      return {
        id: n.id,
        label: n.label,
        sub: n.role === "app" ? `${env} \xB7 ${formatRate(inbound)} in` : roleWord(n.role),
        x: PAD + n.column * (NODE_W + COL_GAP),
        y: PAD + (height - PAD * 2 - colH) / 2 + i * (NODE_H + ROW_GAP),
        dashed: n.role === "peer",
        dotColor: fleet.edges.some((e) => e.to === n.id && e.stats.errorRate > 0) ? t.bad : void 0
      };
    });
    const edges = fleet.edges.map((e) => ({
      id: `${e.from}->${e.to}`,
      from: e.from,
      to: e.to,
      color: e.kind === "messaging" || e.kind === "ingress" ? t.skyLine : t.sky
    }));
    return { nodes, edges, width, height };
  }, [fleet, env, t]);
  if (fleet.nodes.length === 0) {
    return /* @__PURE__ */ jsxs(EmptyNote, { inset: true, children: [
      "No traced traffic for ",
      env,
      " in this window on this cluster."
    ] });
  }
  const node = fleet.nodes.find((n) => n.id === selected);
  const touching = node ? fleet.edges.filter((e) => e.from === node.id || e.to === node.id) : [];
  return /* @__PURE__ */ jsxs("div", { className: c.layout, children: [
    /* @__PURE__ */ jsx(Card, { className: c.canvasCard, title: "Map", meta: /* @__PURE__ */ jsx(Hint, { children: "ingress \u2192 apps by call depth \u2192 databases, caches, external" }), children: /* @__PURE__ */ jsx(
      GraphCanvas,
      {
        label: `Fleet map, ${env}`,
        nodes: layout.nodes,
        edges: layout.edges,
        width: layout.width,
        height: layout.height,
        selected,
        onSelect: setSelected
      }
    ) }),
    /* @__PURE__ */ jsx(Card, { className: c.inspector, title: node ? node.label : `${fleet.nodes.filter((n) => n.role === "app").length} apps in ${env}`, children: node ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Fact, { inline: true, label: "Role", children: roleWord(node.role) }),
      touching.length === 0 ? /* @__PURE__ */ jsx(Hint, { children: "No edges in this window." }) : /* @__PURE__ */ jsxs("table", { className: tk.table, children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { className: tk.th, children: "Edge" }),
          /* @__PURE__ */ jsx("th", { className: tk.th, children: "Kind" }),
          /* @__PURE__ */ jsx("th", { className: tk.th, children: "Rate" }),
          /* @__PURE__ */ jsx("th", { className: tk.th, children: "p95" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: touching.map((e) => /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("td", { className: tk.td, children: e.from === node.id ? `\u2192 ${e.to}` : `\u2190 ${e.from}` }),
          /* @__PURE__ */ jsx("td", { className: tk.td, children: KIND_LABEL[e.kind] }),
          /* @__PURE__ */ jsx("td", { className: tk.td, children: formatRate(e.stats.rate) }),
          /* @__PURE__ */ jsx("td", { className: tk.td, children: formatSeconds(e.stats.p95) })
        ] }, `${e.from}->${e.to}`)) })
      ] }),
      node.app && /* @__PURE__ */ jsxs(TextLink, { onClick: () => onOpenApp(node.app), children: [
        "Open ",
        node.app,
        "'s Airspace \u2192"
      ] })
    ] }) : /* @__PURE__ */ jsx(Hint, { children: "Select a node to see its edges. Dashed nodes are not Hangar apps: databases, caches and external hosts." }) })
  ] });
}

export { MapView };
//# sourceMappingURL=MapView.esm.js.map
