import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useMemo, useState, useRef, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { dump } from 'js-yaml';
import { relativeTime, formatDateTime } from './shared/format.esm.js';
import { fontMono, useHangarTokens } from './brand/tokens.esm.js';
import { preventFocusScroll } from './preventFocusScroll.esm.js';
import { PodLogsView } from './PodLogsView.esm.js';
import { usePipelineDagStyles, PAD, NODE_H, NODE_W, ROW_GAP, COL_GAP } from './PipelineDag.esm.js';
import { useRolloutTopology } from './useRolloutTopology.esm.js';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.2;
const useStyles = makeStyles(() => ({
  "@keyframes flow": { to: { strokeDashoffset: -24 } },
  edgeFlow: { strokeDasharray: "6 6", animationName: "$flow", animationTimingFunction: "linear", animationIterationCount: "infinite" },
  edgeLabel: { fontFamily: fontMono, fontSize: 10, fontWeight: 700 },
  tag: { fontFamily: fontMono, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "0 5px", borderRadius: 6, marginLeft: 4 },
  traffic: { position: "absolute", display: "flex", alignItems: "center", gap: 5, fontFamily: fontMono, fontSize: 10, color: ({ t }) => t.amberInk, whiteSpace: "nowrap", transform: "translate(-50%, -100%)" },
  tabs: { display: "flex", gap: 6, marginBottom: 10 },
  tabBtn: { fontFamily: fontMono, fontSize: 11, padding: "3px 10px", borderRadius: 6, border: ({ t }) => `1px solid ${t.line}`, background: "none", color: ({ t }) => t.textLo, cursor: "pointer" },
  tabBtnOn: { color: ({ t }) => t.sky, borderColor: ({ t }) => t.skyLine, backgroundColor: ({ t }) => t.skySoft },
  yaml: { margin: 0, padding: 12, fontFamily: fontMono, fontSize: 11.5, lineHeight: 1.55, color: ({ t }) => t.textHi, backgroundColor: ({ t }) => t.bg, border: ({ t }) => `1px solid ${t.lineSoft}`, borderRadius: 4, maxHeight: 420, overflow: "auto", whiteSpace: "pre" }
}));
function toneColor(t, tone) {
  switch (tone) {
    case "good":
      return { bg: t.goodSoft, border: t.good, fg: t.good };
    case "amber":
      return { bg: t.amberSoft, border: t.amber, fg: t.amberInk };
    case "bad":
      return { bg: t.badSoft, border: t.bad, fg: t.bad };
    case "sky":
      return { bg: t.skySoft, border: t.sky, fg: t.sky };
    default:
      return { bg: t.panelAlt, border: t.line, fg: t.textFaint };
  }
}
function podTone(p) {
  if (p.terminating) return { tone: "faint", pulse: true, dim: true };
  if (p.phase === "Failed") return { tone: "bad" };
  if (p.phase === "Succeeded") return { tone: "good" };
  if (p.ready) return { tone: "good" };
  return { tone: "amber", pulse: true };
}
function arTone(phase) {
  if (phase === "Successful") return { tone: "good" };
  if (phase === "Failed" || phase === "Error") return { tone: "bad" };
  if (phase === "Running" || phase === "Pending") return { tone: "amber", pulse: true };
  return { tone: "faint" };
}
function roleWeight(role, canaryWeight) {
  if (role === "canary") return canaryWeight;
  if (role === "stable") return 100 - canaryWeight;
  return 0;
}
function roleTone(role) {
  if (role === "canary") return "amber";
  if (role === "stable") return "good";
  return "faint";
}
function rolloutTone(phase) {
  if (phase === "Healthy") return "good";
  if (phase === "Degraded") return "bad";
  return "amber";
}
function podSub(p) {
  if (p.terminating) return "terminating";
  return p.ready ? "running" : p.phase.toLowerCase();
}
function shortPod(name, rsName) {
  return name.startsWith(`${rsName}-`) ? `\u2026-${name.slice(rsName.length + 1)}` : name;
}
function buildGraph(topo) {
  const nodes = [];
  const edges = [];
  let row = 0;
  const rsWeight = (rs) => roleWeight(rs.role, topo.canaryWeight);
  const groupRows = [];
  const place = (count) => {
    const n = Math.max(count, 1);
    const center = row + (n - 1) / 2;
    row += n;
    return center;
  };
  topo.replicaSets.forEach((rs) => {
    const center = place(rs.pods.length);
    groupRows.push(center);
    const w = rsWeight(rs);
    nodes.push({
      id: `rs:${rs.obj.metadata.name}`,
      kind: "ReplicaSet",
      label: "ReplicaSet",
      sub: `${rs.ready}/${rs.replicas} ready`,
      tag: rs.role === "unknown" ? void 0 : rs.role,
      col: 2,
      row: center,
      obj: rs.obj,
      tone: roleTone(rs.role),
      pulse: rs.role === "canary" && rs.ready < rs.replicas
    });
    edges.push({ from: "rollout", to: `rs:${rs.obj.metadata.name}`, weight: w });
    const live = rs.pods.filter((p) => p.ready && !p.terminating);
    rs.pods.forEach((p, i) => {
      const tone = podTone(p);
      nodes.push({
        id: `pod:${p.obj.metadata.name}`,
        kind: "Pod",
        label: shortPod(p.obj.metadata.name, rs.obj.metadata.name),
        sub: podSub(p),
        tag: rs.role === "unknown" ? void 0 : rs.role,
        col: 3,
        row: center - (rs.pods.length - 1) / 2 + i,
        obj: p.obj,
        pod: p,
        ...tone
      });
      edges.push({ from: `rs:${rs.obj.metadata.name}`, to: `pod:${p.obj.metadata.name}`, weight: p.ready && !p.terminating ? w / Math.max(live.length, 1) : 0 });
    });
  });
  topo.analysisRuns.forEach((ar) => {
    const center = place(ar.pods.length);
    groupRows.push(center);
    nodes.push({
      id: `ar:${ar.obj.metadata.name}`,
      kind: "AnalysisRun",
      label: "AnalysisRun",
      sub: ar.phase.toLowerCase(),
      col: 2,
      row: center,
      obj: ar.obj,
      ar,
      ...arTone(ar.phase)
    });
    edges.push({ from: "rollout", to: `ar:${ar.obj.metadata.name}` });
    ar.pods.forEach((p, i) => {
      const tone = podTone(p);
      nodes.push({
        id: `pod:${p.obj.metadata.name}`,
        kind: "Pod",
        label: shortPod(p.obj.metadata.name, ar.obj.metadata.name),
        sub: p.phase === "Succeeded" ? "completed" : p.phase.toLowerCase(),
        col: 3,
        row: center - (ar.pods.length - 1) / 2 + i,
        obj: p.obj,
        pod: p,
        ...tone
      });
      edges.push({ from: `ar:${ar.obj.metadata.name}`, to: `pod:${p.obj.metadata.name}` });
    });
  });
  const mid = groupRows.length ? (Math.min(...groupRows) + Math.max(...groupRows)) / 2 : 0;
  const rolloutPhase = topo.rollout.status?.phase ?? "Unknown";
  nodes.push({
    id: "rollout",
    kind: "Rollout",
    label: topo.rollout.metadata.name,
    sub: `rollout \xB7 ${rolloutPhase.toLowerCase()}`,
    col: 1,
    row: mid,
    obj: topo.rollout,
    tone: rolloutTone(rolloutPhase),
    pulse: rolloutPhase === "Progressing"
  });
  if (topo.service) {
    nodes.push({ id: "svc", kind: "Service", label: topo.service.metadata.name, sub: "service", col: 0, row: mid, obj: topo.service, tone: "sky" });
    edges.push({ from: "svc", to: "rollout", weight: 100 });
  }
  return { nodes, edges, totalRows: Math.max(row, 1) };
}
function kvRows(node, topo) {
  const m = node.obj.metadata;
  const rows = [["Kind", node.kind], ["Name", m.name]];
  if (node.tag) rows.push(["Role", node.tag]);
  if (m.creationTimestamp) rows.push(["Created", `${relativeTime(m.creationTimestamp)} \xB7 ${formatDateTime(m.creationTimestamp)}`]);
  if (node.kind === "Service") {
    rows.push(["Type", node.obj.spec?.type ?? "ClusterIP"], ["Cluster IP", node.obj.spec?.clusterIP ?? "\u2014"]);
    rows.push(["Ports", (node.obj.spec?.ports ?? []).map((p) => `${p.port}/${p.protocol ?? "TCP"}`).join(", ") || "\u2014"]);
  } else if (node.kind === "Rollout") {
    rows.push(["Phase", node.obj.status?.phase ?? "\u2014"], ["Canary weight", `${topo.canaryWeight}%`], ["Stable weight", `${100 - topo.canaryWeight}%`]);
    if (node.obj.status?.message) rows.push(["Message", node.obj.status.message]);
  } else if (node.kind === "ReplicaSet") {
    rows.push(["Replicas", `${node.obj.status?.readyReplicas ?? 0} ready / ${node.obj.spec?.replicas ?? 0} desired`]);
    rows.push(["Pod template hash", node.obj.metadata.labels?.["rollouts-pod-template-hash"] ?? "\u2014"]);
    rows.push(["Image", node.obj.spec?.template?.spec?.containers?.[0]?.image ?? "\u2014"]);
  } else if (node.kind === "Pod") {
    rows.push(["Phase", node.obj.status?.phase ?? "\u2014"], ["Node", node.obj.spec?.nodeName ?? "\u2014"], ["Pod IP", node.obj.status?.podIP ?? "\u2014"]);
    rows.push(["Image", node.obj.spec?.containers?.[0]?.image ?? "\u2014"]);
  } else if (node.kind === "AnalysisRun") {
    rows.push(["Phase", node.obj.status?.phase ?? "\u2014"]);
    if (node.obj.status?.message) rows.push(["Message", node.obj.status.message]);
    (node.obj.status?.metricResults ?? []).forEach((mr) => {
      rows.push([`Metric ${mr.name}`, `${mr.phase ?? "\u2014"} \xB7 ${mr.successful ?? 0} ok / ${mr.failed ?? 0} failed${mr.message ? ` \xB7 ${mr.message}` : ""}`]);
    });
  }
  return rows;
}
function RolloutTopologyDag({ cluster, namespace, rolloutName, stepWeight }) {
  const t = useHangarTokens();
  const dag = usePipelineDagStyles({ t });
  const classes = useStyles({ t });
  const target = useMemo(() => ({ cluster, namespace, rolloutName, stepWeight }), [cluster, namespace, rolloutName, stepWeight]);
  const { loading, error, topology } = useRolloutTopology(target);
  const [zoom, setZoom] = useState(1);
  const [openId, setOpenId] = useState(void 0);
  const [tab, setTab] = useState("info");
  const scrollRef = useRef(null);
  const [rps, setRps] = useState(120);
  useEffect(() => {
    const id = setInterval(() => setRps(Math.max(20, Math.round(120 + (Math.random() - 0.5) * 40))), 1200);
    return () => clearInterval(id);
  }, []);
  const graph = useMemo(() => topology ? buildGraph(topology) : void 0, [topology]);
  const geom = useMemo(() => {
    if (!graph) return void 0;
    const colUnit = NODE_W + COL_GAP;
    const rowUnit = NODE_H + ROW_GAP;
    const pos = /* @__PURE__ */ new Map();
    graph.nodes.forEach((n) => pos.set(n.id, { x: PAD + n.col * colUnit + NODE_W / 2, y: PAD + 14 + n.row * rowUnit + NODE_H / 2 }));
    return { pos, width: PAD * 2 + 4 * colUnit - COL_GAP, height: PAD * 2 + 14 + graph.totalRows * rowUnit - ROW_GAP };
  }, [graph]);
  const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +z.toFixed(2)));
  const fit = () => {
    const w = scrollRef.current?.clientWidth ?? geom?.width ?? 1;
    setZoom(clampZoom(Math.min(1, w / (geom?.width ?? 1))));
  };
  const openNode = graph?.nodes.find((n) => n.id === openId);
  useEffect(() => {
    if (openId && graph && !graph.nodes.some((n) => n.id === openId)) setOpenId(void 0);
  }, [graph, openId]);
  return /* @__PURE__ */ jsxs("div", { className: dag.wrap, children: [
    /* @__PURE__ */ jsxs("div", { className: dag.head, children: [
      /* @__PURE__ */ jsxs("span", { className: dag.headTitle, children: [
        "kubernetes topology \xB7 ",
        /* @__PURE__ */ jsx("span", { className: dag.headTitleValue, children: rolloutName })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: dag.controls, children: [
        /* @__PURE__ */ jsx("button", { type: "button", className: dag.utilBtn, onMouseDown: preventFocusScroll, onClick: fit, children: "Fit" }),
        /* @__PURE__ */ jsxs("div", { className: dag.zoomCtl, children: [
          /* @__PURE__ */ jsx("button", { type: "button", className: dag.zoomBtn, onMouseDown: preventFocusScroll, onClick: () => setZoom((z) => clampZoom(z - ZOOM_STEP)), children: "\u2212" }),
          /* @__PURE__ */ jsxs("span", { className: dag.zoomLabel, children: [
            Math.round(zoom * 100),
            "%"
          ] }),
          /* @__PURE__ */ jsx("button", { type: "button", className: dag.zoomBtn, onMouseDown: preventFocusScroll, onClick: () => setZoom((z) => clampZoom(z + ZOOM_STEP)), children: "+" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: dag.body, children: [
      loading && !topology && /* @__PURE__ */ jsx(Typography, { className: dag.note, children: "Loading rollout topology\u2026" }),
      error && /* @__PURE__ */ jsxs(Typography, { className: dag.note, children: [
        "Couldn't refresh topology: ",
        error
      ] }),
      topology && graph && geom && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("div", { className: dag.scroll, ref: scrollRef, children: /* @__PURE__ */ jsx("div", { className: dag.sizer, style: { width: geom.width * zoom, height: geom.height * zoom, margin: "0 auto" }, children: /* @__PURE__ */ jsxs("div", { className: dag.inner, style: { width: geom.width, height: geom.height, transform: `scale(${zoom})` }, children: [
          /* @__PURE__ */ jsx("svg", { width: geom.width, height: geom.height, style: { position: "absolute", top: 0, left: 0, overflow: "visible" }, children: graph.edges.map((e) => {
            const a = geom.pos.get(e.from);
            const b = geom.pos.get(e.to);
            if (!a || !b) return null;
            const sx = a.x + NODE_W / 2;
            const tx = b.x - NODE_W / 2;
            const mx = (sx + tx) / 2;
            const d = `M ${sx} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${tx} ${b.y}`;
            const weighted = e.weight !== void 0;
            const active = weighted && e.weight > 0;
            const canaryEdge = e.to.startsWith("rs:") || e.from.startsWith("rs:");
            const isCanary = canaryEdge && graph.nodes.find((n) => n.id === (e.to.startsWith("rs:") ? e.to : e.from))?.tag === "canary";
            const activeStroke = isCanary ? t.amber : t.good;
            const stroke = active ? activeStroke : t.line;
            const dur = active ? 0.5 + (1 - e.weight / 100) * 2.5 : 0;
            return /* @__PURE__ */ jsxs("g", { children: [
              /* @__PURE__ */ jsx(
                "path",
                {
                  d,
                  fill: "none",
                  stroke,
                  strokeWidth: active ? 1.5 + e.weight / 100 * 2 : 1.5,
                  strokeDasharray: !weighted ? "3 3" : void 0,
                  className: active ? classes.edgeFlow : void 0,
                  style: active ? { animationDuration: `${dur}s` } : void 0
                }
              ),
              weighted && /* @__PURE__ */ jsxs("g", { transform: `translate(${mx}, ${(a.y + b.y) / 2})`, children: [
                /* @__PURE__ */ jsx("rect", { x: -19, y: -8, width: 38, height: 16, rx: 8, fill: t.panel, stroke, strokeWidth: 1 }),
                /* @__PURE__ */ jsxs("text", { className: classes.edgeLabel, textAnchor: "middle", dy: 3.5, fill: active ? stroke : t.textFaint, children: [
                  Math.round(e.weight * 10) / 10,
                  "%"
                ] })
              ] })
            ] }, `${e.from}-${e.to}`);
          }) }),
          geom.pos.get("svc") && /* @__PURE__ */ jsxs("span", { className: classes.traffic, style: { left: geom.pos.get("svc").x, top: geom.pos.get("svc").y - NODE_H / 2 - 4 }, children: [
            /* @__PURE__ */ jsx("span", { className: dag.dot, style: { backgroundColor: t.amber, animation: "none" } }),
            "~",
            rps,
            " req/s in (simulated)"
          ] }),
          graph.nodes.map((n) => {
            const p = geom.pos.get(n.id);
            const color = toneColor(t, n.tone);
            return /* @__PURE__ */ jsxs(
              "button",
              {
                type: "button",
                className: `${dag.node} ${openId === n.id ? dag.nodeSelected : ""} ${n.pulse ? dag.nodeRunning : ""}`,
                style: { left: p.x, top: p.y, borderColor: color.border, opacity: n.dim ? 0.55 : 1 },
                onMouseDown: preventFocusScroll,
                onClick: () => {
                  setOpenId((prev) => prev === n.id ? void 0 : n.id);
                  setTab("info");
                },
                children: [
                  /* @__PURE__ */ jsxs("span", { className: dag.dotRow, children: [
                    /* @__PURE__ */ jsx("span", { className: dag.dot, style: { backgroundColor: color.fg } }),
                    /* @__PURE__ */ jsx("span", { className: dag.nodeLabel, children: n.label }),
                    n.tag && /* @__PURE__ */ jsx("span", { className: classes.tag, style: { backgroundColor: toneColor(t, roleTone(n.tag)).bg, color: toneColor(t, roleTone(n.tag)).fg }, children: n.tag })
                  ] }),
                  /* @__PURE__ */ jsx("span", { className: dag.nodeSub, style: { color: color.fg }, children: n.sub })
                ]
              },
              n.id
            );
          })
        ] }) }) }),
        /* @__PURE__ */ jsxs("div", { className: dag.legend, children: [
          /* @__PURE__ */ jsxs("span", { children: [
            /* @__PURE__ */ jsx("span", { className: dag.legendDot, style: { backgroundColor: t.good } }),
            "stable / healthy"
          ] }),
          /* @__PURE__ */ jsxs("span", { children: [
            /* @__PURE__ */ jsx("span", { className: dag.legendDot, style: { backgroundColor: t.amber } }),
            "canary / starting"
          ] }),
          /* @__PURE__ */ jsxs("span", { children: [
            /* @__PURE__ */ jsx("span", { className: dag.legendDot, style: { backgroundColor: t.bad } }),
            "failed"
          ] }),
          /* @__PURE__ */ jsxs("span", { children: [
            /* @__PURE__ */ jsx("span", { className: dag.legendDot, style: { backgroundColor: t.textFaint, opacity: 0.5 } }),
            "terminating / idle"
          ] }),
          /* @__PURE__ */ jsx("span", { children: "edge % = traffic weight (from Rollout status) \xB7 req/s is simulated" })
        ] }),
        openNode && /* @__PURE__ */ jsxs("div", { className: dag.detail, children: [
          /* @__PURE__ */ jsxs(Typography, { className: dag.detailTitle, children: [
            openNode.kind,
            ": ",
            openNode.obj.metadata.name
          ] }),
          /* @__PURE__ */ jsx("div", { className: classes.tabs, children: ["info", "yaml", "logs"].map((k) => /* @__PURE__ */ jsx("button", { type: "button", className: `${classes.tabBtn} ${tab === k ? classes.tabBtnOn : ""}`, onMouseDown: preventFocusScroll, onClick: () => setTab(k), children: k }, k)) }),
          tab === "info" && /* @__PURE__ */ jsx("div", { className: dag.detailGrid, children: kvRows(openNode, topology).map(([k, v]) => /* @__PURE__ */ jsxs("div", { className: dag.detailGridItem, children: [
            /* @__PURE__ */ jsx("span", { className: dag.kvLabel, children: k }),
            /* @__PURE__ */ jsx("span", { className: dag.kvValue, children: v })
          ] }, k)) }),
          tab === "yaml" && /* @__PURE__ */ jsx("pre", { className: classes.yaml, children: dump(stripNoise(openNode.obj)) }),
          tab === "logs" && /* @__PURE__ */ jsx(NodeLogs, { node: openNode, cluster, namespace, noteClass: dag.note })
        ] })
      ] })
    ] })
  ] });
}
function stripNoise(obj) {
  const { managedFields, ...meta } = obj.metadata ?? {};
  return { ...obj, metadata: meta };
}
function NodeLogs({ node, cluster, namespace, noteClass }) {
  const pod = node.pod ?? node.ar?.pods[0];
  if (pod) {
    return /* @__PURE__ */ jsx(
      PodLogsView,
      {
        cluster,
        namespace,
        podName: pod.obj.metadata.name,
        containers: pod.containers,
        live: pod.phase === "Running" && !pod.terminating
      }
    );
  }
  if (node.kind === "AnalysisRun") {
    return /* @__PURE__ */ jsx(Typography, { className: noteClass, children: "This analysis has no Job pod (e.g. a Prometheus/web metric provider queries directly) - see the Info tab for its metric results and messages." });
  }
  return /* @__PURE__ */ jsxs(Typography, { className: noteClass, children: [
    node.kind,
    "s don't produce logs - select a Pod to see its container logs."
  ] });
}

export { RolloutTopologyDag };
//# sourceMappingURL=RolloutTopologyDag.esm.js.map
