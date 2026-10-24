import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { useHangarTokens } from '../brand/tokens.esm.js';
import { Card, Hint, FactGrid, Fact, TextLink, StatusChip } from '../ui/index.esm.js';
import { formatRate, formatSeconds } from './model.esm.js';
import { GraphCanvas, NODE_H, NODE_W } from './GraphCanvas.esm.js';
import { KIND_LABEL, STATE_HINT, STATE_LABEL, STATE_TONE, edgeStroke } from './presentation.esm.js';
import { EdgeLegend } from './EdgeLegend.esm.js';

const COL_GAP = 120;
const ROW_GAP = 22;
const PAD = 24;
const useStyles = makeStyles(() => ({
  layout: { display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" },
  canvasCard: { flex: "999 1 560px", minWidth: 0 },
  inspector: { flex: "1 1 300px", minWidth: 0 }
}));
const LEGEND_ORDER = ["ok", "undeclared", "silent", "broker", "ingress", "composed"];
function legendStates(airspace) {
  const present = new Set([...airspace.inbound, ...airspace.outbound, ...airspace.owned].map((r) => r.state));
  return LEGEND_ORDER.filter((s) => present.has(s));
}
function radarLayout(airspace, t) {
  const cols = { inbound: airspace.inbound, outbound: airspace.outbound };
  const rowsTall = Math.max(cols.inbound.length, cols.outbound.length, 1);
  const bandH = rowsTall * NODE_H + (rowsTall - 1) * ROW_GAP;
  const ownedRowY = PAD + bandH + 80;
  const width = PAD * 2 + NODE_W * 3 + COL_GAP * 2;
  const ownedPerRow = 3;
  const ownedRows = Math.ceil(airspace.owned.length / ownedPerRow);
  const height = airspace.owned.length ? ownedRowY + ownedRows * (NODE_H + ROW_GAP) + PAD : PAD * 2 + bandH;
  const centre = {
    id: "self",
    label: airspace.app,
    sub: `${airspace.env} \xB7 this app`,
    x: PAD + NODE_W + COL_GAP,
    y: PAD + bandH / 2 - NODE_H / 2,
    emphasis: "centre"
  };
  const place = (rows, x) => {
    const total = rows.length * NODE_H + (rows.length - 1) * ROW_GAP;
    const top = PAD + (bandH - total) / 2;
    return rows.map((r, i) => nodeOf(r, x, top + i * (NODE_H + ROW_GAP), t));
  };
  const ownedNodes = airspace.owned.map((r, i) => {
    const inRow = Math.min(ownedPerRow, airspace.owned.length - Math.floor(i / ownedPerRow) * ownedPerRow);
    const rowWidth = inRow * NODE_W + (inRow - 1) * 40;
    const left = (width - rowWidth) / 2;
    return nodeOf(r, left + i % ownedPerRow * (NODE_W + 40), ownedRowY + Math.floor(i / ownedPerRow) * (NODE_H + ROW_GAP), t);
  });
  const nodes = [centre, ...place(cols.inbound, PAD), ...place(cols.outbound, PAD + (NODE_W + COL_GAP) * 2), ...ownedNodes];
  const edges = [
    ...cols.inbound.map((r) => ({ id: r.id, from: r.id, to: "self", ...edgeStroke(r.state, t) })),
    ...cols.outbound.map((r) => ({ id: r.id, from: "self", to: r.id, ...edgeStroke(r.state, t) })),
    ...airspace.owned.map((r) => ({ id: r.id, from: "self", to: r.id, vertical: true, ...edgeStroke(r.state, t) }))
  ];
  return { nodes, edges, width, height };
}
function declaredWord(r, valuesKnown) {
  if (!valuesKnown && r.direction !== "owned") return "values file not loaded";
  return r.declared ? "yes" : "no";
}
function nodeOf(r, x, y, t) {
  return {
    id: r.id,
    label: r.name,
    sub: [r.componentType, KIND_LABEL[r.kind], r.observed ? formatRate(r.observed.rate) : void 0].filter(Boolean).join(" \xB7 "),
    x,
    y,
    emphasis: r.state === "undeclared" ? "attention" : void 0,
    dashed: r.state === "silent",
    dotColor: r.observed && r.observed.errorRate > 0 ? t.bad : void 0
  };
}
function AirspaceRadar({
  airspace,
  valuesKnown,
  onOpenApp
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const layout = useMemo(() => radarLayout(airspace, t), [airspace, t]);
  const all = [...airspace.inbound, ...airspace.outbound, ...airspace.owned];
  const [selectedId, setSelectedId] = useState(void 0);
  const selected = all.find((r) => r.id === selectedId);
  return /* @__PURE__ */ jsxs("div", { className: c.layout, children: [
    /* @__PURE__ */ jsxs(Card, { className: c.canvasCard, title: "Radar", meta: /* @__PURE__ */ jsx(Hint, { children: "callers \u2190 this app \u2192 calls \xB7 owned below" }), children: [
      /* @__PURE__ */ jsx(
        GraphCanvas,
        {
          label: `${airspace.app} connections`,
          nodes: layout.nodes,
          edges: layout.edges,
          width: layout.width,
          height: layout.height,
          selected: selectedId,
          onSelect: (id) => setSelectedId(id === "self" ? void 0 : id)
        }
      ),
      /* @__PURE__ */ jsx(EdgeLegend, { states: legendStates(airspace) })
    ] }),
    /* @__PURE__ */ jsx(Card, { className: c.inspector, title: selected ? selected.name : airspace.app, meta: selected ? /* @__PURE__ */ jsx(StatusChip, { tone: STATE_TONE[selected.state], children: STATE_LABEL[selected.state] }) : void 0, children: selected ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs(FactGrid, { min: 90, children: [
        /* @__PURE__ */ jsx(Fact, { label: "Traffic", children: selected.observed ? formatRate(selected.observed.rate) : "\u2014" }),
        /* @__PURE__ */ jsx(Fact, { label: "p95", children: formatSeconds(selected.observed?.p95) }),
        /* @__PURE__ */ jsx(Fact, { label: "Errors", children: selected.observed ? formatRate(selected.observed.errorRate) : "\u2014" })
      ] }),
      /* @__PURE__ */ jsx(Fact, { inline: true, label: "Direction", children: selected.direction }),
      /* @__PURE__ */ jsx(Fact, { inline: true, label: "Kind", children: [selected.componentType, KIND_LABEL[selected.kind]].filter(Boolean).join(" \xB7 ") }),
      /* @__PURE__ */ jsx(Fact, { inline: true, label: "Declared", children: declaredWord(selected, valuesKnown) }),
      selected.ports && /* @__PURE__ */ jsx(Fact, { inline: true, label: "Ports", children: selected.ports.join(", ") }),
      /* @__PURE__ */ jsx(Hint, { children: STATE_HINT[selected.state] }),
      selected.app && onOpenApp && /* @__PURE__ */ jsxs(TextLink, { onClick: () => onOpenApp(selected.app), children: [
        "Open ",
        selected.app,
        "'s Airspace \u2192"
      ] })
    ] }) : /* @__PURE__ */ jsxs(Hint, { children: [
      airspace.inbound.length,
      " inbound, ",
      airspace.outbound.length,
      " outbound, ",
      airspace.owned.length,
      " owned. Select a node for its detail."
    ] }) })
  ] });
}

export { AirspaceRadar, legendStates, radarLayout };
//# sourceMappingURL=AirspaceRadar.esm.js.map
