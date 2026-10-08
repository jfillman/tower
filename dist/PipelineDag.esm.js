import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useMemo, useState, useRef, useEffect, Fragment as Fragment$1 } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import CheckIcon from '@material-ui/icons/Check';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import RemoveIcon from '@material-ui/icons/Remove';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import CloseIcon from '@material-ui/icons/Close';
import { dump } from 'js-yaml';
import { relativeTime, formatDateTime } from './shared/format.esm.js';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { stepDuration, TaskRunLogConsole } from './TaskRunLogConsole.esm.js';
import { layoutPipelineGraph } from './tekton/pipelineGraph.esm.js';

const NODE_W = 150;
const NODE_H = 56;
const COL_GAP = 90;
const ROW_GAP = 24;
const PAD = 32;
const FINALLY_EXTRA = 50;
const ELBOW_GAP = 18;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.2;
function layoutPixels(run) {
  const layout = layoutPipelineGraph(run);
  const colUnit = NODE_W + COL_GAP;
  const rowUnit = NODE_H + ROW_GAP;
  const colCounts = /* @__PURE__ */ new Map();
  layout.nodes.forEach((n) => colCounts.set(n.col, (colCounts.get(n.col) ?? 0) + 1));
  const totalHeight = layout.maxRows * rowUnit - ROW_GAP;
  const pos = /* @__PURE__ */ new Map();
  layout.nodes.forEach((n) => {
    const count = colCounts.get(n.col) ?? 1;
    const colHeight = count * rowUnit - ROW_GAP;
    const offsetY = (totalHeight - colHeight) / 2;
    const extraX = n.finally ? FINALLY_EXTRA : 0;
    pos.set(n.id, {
      x: PAD + n.col * colUnit + extraX + NODE_W / 2,
      y: PAD + offsetY + n.row * rowUnit + NODE_H / 2
    });
  });
  const hasFinally = run.finallyTasks.length > 0;
  const width = PAD * 2 + layout.cols * colUnit - COL_GAP + (hasFinally ? FINALLY_EXTRA : 0);
  const height = PAD * 2 + Math.max(totalHeight, NODE_H);
  const finallyDividerX = hasFinally ? PAD + layout.finallyColStart * colUnit - COL_GAP / 2 + FINALLY_EXTRA / 2 : void 0;
  return { layout, pos, width, height, finallyDividerX };
}
const usePipelineDagStyles = makeStyles(() => ({
  wrap: { border: ({ t }) => `1px solid ${t.line}`, borderRadius: 5, backgroundColor: ({ t }) => t.panelAlt },
  head: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 14px",
    flexWrap: "wrap"
  },
  headTitle: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, textTransform: "uppercase", letterSpacing: "0.05em" },
  headTitleValue: { color: ({ t }) => t.textLo },
  controls: { display: "flex", alignItems: "center", gap: 8 },
  zoomCtl: { display: "flex", alignItems: "center", border: ({ t }) => `1px solid ${t.line}`, borderRadius: 6, overflow: "hidden" },
  zoomBtn: {
    width: 26,
    height: 24,
    background: ({ t }) => t.panel,
    border: "none",
    cursor: "pointer",
    fontFamily: fontMono,
    fontSize: 13,
    color: ({ t }) => t.textLo,
    "&:hover": { backgroundColor: ({ t }) => t.line }
  },
  zoomLabel: {
    minWidth: 42,
    textAlign: "center",
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.textFaint,
    borderLeft: ({ t }) => `1px solid ${t.line}`,
    borderRight: ({ t }) => `1px solid ${t.line}`,
    height: 24,
    lineHeight: "24px",
    background: ({ t }) => t.panel
  },
  utilBtn: {
    height: 26,
    padding: "0 10px",
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6,
    background: ({ t }) => t.panel,
    color: ({ t }) => t.textLo,
    fontFamily: fontMono,
    fontSize: 11,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    "&:hover": { backgroundColor: ({ t }) => t.line }
  },
  body: { padding: "0 14px 14px" },
  scroll: {
    width: "100%",
    overflow: "auto",
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    borderRadius: 5,
    backgroundColor: ({ t }) => t.panel
  },
  sizer: { position: "relative" },
  inner: { position: "absolute", top: 0, left: 0, transformOrigin: "top left" },
  finallyDivider: { position: "absolute", top: 8, bottom: 8, width: 0, borderLeft: ({ t }) => `1px dashed ${t.line}` },
  finallyTag: {
    position: "absolute",
    top: 0,
    fontFamily: fontMono,
    fontSize: 9,
    color: ({ t }) => t.textFaint,
    textTransform: "uppercase",
    letterSpacing: "0.06em"
  },
  node: {
    position: "absolute",
    width: NODE_W,
    height: NODE_H,
    borderRadius: 8,
    border: "1.5px solid",
    backgroundColor: ({ t }) => t.panel,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    cursor: "pointer",
    transform: "translate(-50%, -50%)",
    "&:hover": { backgroundColor: ({ t }) => t.panelAlt }
  },
  nodeSelected: { boxShadow: ({ t }) => `0 0 0 2px ${t.sky}` },
  // 2026-09-12: "can we also make it slowly blink while its running like
  // elsewhere on the page? i want activity to be more prominent" - same
  // opacity pulse + timing as SignalRail's liveDot/gatesTogglePulse and
  // CiCdTab's dotLive, scoped locally since makeStyles keyframes aren't
  // shared across components.
  "@keyframes pulse": {
    "0%, 100%": { opacity: 1 },
    "50%": { opacity: 0.5 }
  },
  nodeRunning: { animation: "$pulse 1.6s ease-in-out infinite" },
  // A sibling of the node, not a child: the running node's opacity pulse would otherwise fade the card too.
  hoverCard: {
    position: "absolute",
    minWidth: 170,
    padding: "8px 10px",
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
    pointerEvents: "none",
    zIndex: 2,
    textAlign: "left"
  },
  hoverTitle: {
    fontFamily: fontMono,
    fontSize: 9.5,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: ({ t }) => t.textFaint,
    marginBottom: 5
  },
  hoverRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.textHi,
    padding: "2px 0"
  },
  hoverStep: { color: ({ t }) => t.sky },
  hoverDuration: { color: ({ t }) => t.textFaint, whiteSpace: "nowrap" },
  dotRow: { display: "flex", alignItems: "center", gap: 5 },
  dot: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },
  nodeLabel: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textHi, textAlign: "center", lineHeight: 1.2 },
  nodeSub: { fontFamily: fontMono, fontSize: 9, color: ({ t }) => t.textFaint, letterSpacing: "0.03em" },
  legend: { display: "flex", gap: 16, flexWrap: "wrap", padding: "10px 2px 0", fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint },
  legendDot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block", marginRight: 6 },
  detail: { marginTop: 12, padding: "14px 16px", backgroundColor: ({ t }) => t.panel, border: ({ t }) => `1px solid ${t.line}`, borderRadius: 8 },
  detailTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13.5, marginBottom: 8, color: ({ t }) => t.textHi },
  detailGrid: { display: "flex", flexWrap: "wrap", gap: "10px 22px", marginBottom: 8 },
  detailGridItem: { flex: "1 1 140px" },
  kvLabel: { fontFamily: fontMono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em", color: ({ t }) => t.textFaint, display: "block" },
  kvValue: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textHi, wordBreak: "break-word" },
  note: { fontSize: 12.5, fontStyle: "italic", color: ({ t }) => t.textLo },
  archivedTag: {
    marginLeft: 8,
    padding: "1px 6px",
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 4,
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: ({ t }) => t.textFaint
  },
  logsWrap: { marginTop: 10, paddingTop: 10, borderTop: ({ t }) => `1px dashed ${t.lineSoft}` },
  ioSection: { marginTop: 10, paddingTop: 10, borderTop: ({ t }) => `1px dashed ${t.lineSoft}` },
  ioTitle: {
    fontFamily: fontMono,
    fontSize: 9.5,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: ({ t }) => t.textFaint,
    marginBottom: 6
  },
  ioRow: {
    display: "flex",
    gap: 12,
    padding: "4px 0",
    borderBottom: ({ t }) => `1px dashed ${t.lineSoft}`,
    "&:last-child": { borderBottom: "none" }
  },
  ioName: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.sky, flexShrink: 0, minWidth: 130 },
  ioValue: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textHi, wordBreak: "break-word", whiteSpace: "pre-wrap" },
  pipelineDetail: { marginTop: 12, padding: "14px 16px", backgroundColor: ({ t }) => t.panel, border: ({ t }) => `1px solid ${t.line}`, borderRadius: 8 },
  pipelineDetailHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  dialogTitle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontFamily: fontMono,
    fontSize: 13,
    color: ({ t }) => t.textHi,
    backgroundColor: ({ t }) => t.panelAlt,
    borderBottom: ({ t }) => `1px solid ${t.line}`
  },
  dialogCloseBtn: { background: "none", border: "none", cursor: "pointer", color: ({ t }) => t.textLo, display: "flex" },
  yamlPre: {
    margin: 0,
    padding: 16,
    fontFamily: fontMono,
    fontSize: 11.5,
    lineHeight: 1.6,
    color: ({ t }) => t.textHi,
    backgroundColor: ({ t }) => t.panel,
    whiteSpace: "pre",
    overflow: "auto"
  }
}));
function phaseColor(t, phase) {
  switch (phase) {
    case "succeeded":
      return { bg: t.goodSoft, border: t.good, fg: t.good };
    case "failed":
      return { bg: t.badSoft, border: t.bad, fg: t.bad };
    case "running":
      return { bg: t.amberSoft, border: t.amber, fg: t.amberInk };
    case "skipped":
      return { bg: t.panelAlt, border: t.line, fg: t.textFaint };
    case "pending":
    default:
      return { bg: t.panelAlt, border: t.line, fg: t.textFaint };
  }
}
function PhaseIcon({ phase }) {
  if (phase === "succeeded") return /* @__PURE__ */ jsx(CheckIcon, { style: { fontSize: 12 } });
  if (phase === "failed") return /* @__PURE__ */ jsx(ErrorOutlineIcon, { style: { fontSize: 12 } });
  if (phase === "skipped") return /* @__PURE__ */ jsx(RemoveIcon, { style: { fontSize: 12 } });
  return null;
}
function taskResultText(openTaskRun, openTaskPhase) {
  if (openTaskRun) {
    if (openTaskRun.phase === "running") return "in progress\u2026";
    return openTaskRun.reason ?? openTaskRun.phase;
  }
  if (openTaskPhase === "skipped") return "skipped (this task's `when` condition wasn't met)";
  return "not started yet";
}
const IO_VALUE_MAX = 240;
function truncateIoValue(value) {
  return value.length > IO_VALUE_MAX ? `${value.slice(0, IO_VALUE_MAX)}\u2026` : value;
}
function taskDuration(startTime, completionTime) {
  if (!startTime) return "\u2014";
  const start = new Date(startTime).getTime();
  const end = completionTime ? new Date(completionTime).getTime() : Date.now();
  const secs = Math.max(0, Math.round((end - start) / 1e3));
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  const text = mins > 0 ? `${mins}m ${rem}s` : `${rem}s`;
  return completionTime ? text : `${text} so far`;
}
function PipelineDag({ run, expandSignal }) {
  const t = useHangarTokens();
  const classes = usePipelineDagStyles({ t });
  const { layout, pos, width, height, finallyDividerX } = useMemo(() => layoutPixels(run), [run]);
  const [zoom, setZoom] = useState(1);
  const [collapsed, setCollapsed] = useState(true);
  const [pipelineIoOpen, setPipelineIoOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState(void 0);
  const [hoverTaskId, setHoverTaskId] = useState(void 0);
  const scrollRef = useRef(null);
  useEffect(() => {
    if (expandSignal !== void 0) setCollapsed(false);
  }, [expandSignal]);
  const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +z.toFixed(2)));
  const fit = () => {
    const containerWidth = scrollRef.current?.clientWidth ?? width;
    setZoom(clampZoom(Math.min(1, containerWidth / width)));
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ left: 0, top: 0 }));
  };
  const center = () => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({
        left: (el.scrollWidth - el.clientWidth) / 2,
        top: (el.scrollHeight - el.clientHeight) / 2
      });
    });
  };
  const finallyElbowX = useMemo(() => {
    const xs = layout.edges.filter((e) => e.finally).map((e) => pos.get(e.from)?.x).filter((x) => x !== void 0);
    return xs.length ? Math.max(...xs) + NODE_W / 2 + ELBOW_GAP : void 0;
  }, [layout, pos]);
  const openTask = layout.nodes.find((n) => n.id === openTaskId);
  const openTaskRun = openTaskId ? run.taskRunsByPipelineTask[openTaskId] : void 0;
  const openTaskDef = openTaskId ? [...run.tasks, ...run.finallyTasks].find((td) => td.name === openTaskId) : void 0;
  const [yamlOpen, setYamlOpen] = useState(false);
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsxs("span", { className: classes.headTitle, children: [
        run.pipelineName ?? "pipeline",
        " \xB7",
        " ",
        /* @__PURE__ */ jsx("span", { className: classes.headTitleValue, children: run.name }),
        run.archive && /* @__PURE__ */ jsx("span", { className: classes.archivedTag, title: "Finished more than an hour ago: read from Tekton Results, the 30-day run archive", children: "archived" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.controls, children: [
        /* @__PURE__ */ jsx("button", { type: "button", className: classes.utilBtn, onClick: () => setYamlOpen(true), children: "YAML" }),
        /* @__PURE__ */ jsx("button", { type: "button", className: classes.utilBtn, onClick: fit, children: "Fit" }),
        /* @__PURE__ */ jsx("button", { type: "button", className: classes.utilBtn, onClick: center, children: "Center" }),
        /* @__PURE__ */ jsxs("div", { className: classes.zoomCtl, children: [
          /* @__PURE__ */ jsx("button", { type: "button", className: classes.zoomBtn, onClick: () => setZoom((z) => clampZoom(z - ZOOM_STEP)), children: "\u2212" }),
          /* @__PURE__ */ jsxs("span", { className: classes.zoomLabel, children: [
            Math.round(zoom * 100),
            "%"
          ] }),
          /* @__PURE__ */ jsx("button", { type: "button", className: classes.zoomBtn, onClick: () => setZoom((z) => clampZoom(z + ZOOM_STEP)), children: "+" })
        ] }),
        /* @__PURE__ */ jsxs("button", { type: "button", className: classes.utilBtn, onClick: () => setCollapsed((v) => !v), children: [
          collapsed ? /* @__PURE__ */ jsx(ExpandMoreIcon, { style: { fontSize: 14 } }) : /* @__PURE__ */ jsx(ExpandLessIcon, { style: { fontSize: 14 } }),
          collapsed ? "Show" : "Hide"
        ] })
      ] })
    ] }),
    !collapsed && /* @__PURE__ */ jsxs("div", { className: classes.body, children: [
      /* @__PURE__ */ jsx("div", { className: classes.scroll, ref: scrollRef, children: /* @__PURE__ */ jsx("div", { className: classes.sizer, style: { width: width * zoom, height: height * zoom }, children: /* @__PURE__ */ jsxs("div", { className: classes.inner, style: { width, height, transform: `scale(${zoom})` }, children: [
        /* @__PURE__ */ jsx("svg", { width, height, style: { position: "absolute", top: 0, left: 0, overflow: "visible" }, children: layout.edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const sx = a.x + NODE_W / 2;
          const tx = b.x - NODE_W / 2;
          let d;
          if (e.finally && finallyElbowX !== void 0) {
            const mx = (finallyElbowX + tx) / 2;
            d = `M ${sx} ${a.y} L ${finallyElbowX} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${tx} ${b.y}`;
          } else {
            const mx = (sx + tx) / 2;
            d = `M ${sx} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${tx} ${b.y}`;
          }
          return /* @__PURE__ */ jsx(
            "path",
            {
              d,
              fill: "none",
              stroke: t.line,
              strokeWidth: 1.5,
              strokeDasharray: e.finally ? "3 3" : void 0
            },
            `${e.from}-${e.to}-${i}`
          );
        }) }),
        finallyDividerX !== void 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("div", { className: classes.finallyDivider, style: { left: finallyDividerX } }),
          /* @__PURE__ */ jsx("span", { className: classes.finallyTag, style: { left: finallyDividerX + 8 }, children: "finally" })
        ] }),
        layout.nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const color = phaseColor(t, n.phase);
          const hoverTaskRun = hoverTaskId === n.id ? run.taskRunsByPipelineTask[n.id] : void 0;
          return /* @__PURE__ */ jsxs(Fragment$1, { children: [
            /* @__PURE__ */ jsxs(
              "button",
              {
                type: "button",
                className: `${classes.node} ${openTaskId === n.id ? classes.nodeSelected : ""} ${n.phase === "running" ? classes.nodeRunning : ""}`,
                style: { left: p.x, top: p.y, borderColor: color.border },
                onClick: () => setOpenTaskId((prev) => prev === n.id ? void 0 : n.id),
                onMouseEnter: () => setHoverTaskId(n.id),
                onMouseLeave: () => setHoverTaskId(void 0),
                children: [
                  /* @__PURE__ */ jsxs("span", { className: classes.dotRow, children: [
                    /* @__PURE__ */ jsx("span", { className: classes.dot, style: { backgroundColor: color.fg } }),
                    /* @__PURE__ */ jsx("span", { className: classes.nodeLabel, children: n.label })
                  ] }),
                  /* @__PURE__ */ jsxs("span", { className: classes.nodeSub, style: { color: color.fg }, children: [
                    n.sub ?? n.id,
                    " ",
                    /* @__PURE__ */ jsx(PhaseIcon, { phase: n.phase })
                  ] })
                ]
              }
            ),
            hoverTaskRun && hoverTaskRun.steps.length > 0 && /* @__PURE__ */ jsxs(
              "div",
              {
                className: classes.hoverCard,
                style: {
                  left: p.x,
                  top: p.y - NODE_H / 2 - 8,
                  transform: `translate(-50%, -100%) scale(${1 / zoom})`,
                  transformOrigin: "bottom center"
                },
                children: [
                  /* @__PURE__ */ jsx("div", { className: classes.hoverTitle, children: "Steps" }),
                  hoverTaskRun.steps.map((step) => /* @__PURE__ */ jsxs("div", { className: classes.hoverRow, children: [
                    /* @__PURE__ */ jsx("span", { className: classes.hoverStep, children: step.name }),
                    /* @__PURE__ */ jsx("span", { className: classes.hoverDuration, children: step.state === "waiting" ? "queued" : stepDuration(step) ?? "\u2014" })
                  ] }, step.container))
                ]
              }
            )
          ] }, n.id);
        })
      ] }) }) }),
      /* @__PURE__ */ jsxs("div", { className: classes.legend, children: [
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx("span", { className: classes.legendDot, style: { backgroundColor: t.good } }),
          "succeeded"
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx("span", { className: classes.legendDot, style: { backgroundColor: t.amber } }),
          "running"
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx("span", { className: classes.legendDot, style: { backgroundColor: t.bad } }),
          "failed"
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx("span", { className: classes.legendDot, style: { backgroundColor: t.textFaint, opacity: 0.5 } }),
          "pending / skipped"
        ] })
      ] }),
      (run.params.length > 0 || run.results.length > 0) && /* @__PURE__ */ jsxs("div", { className: classes.pipelineDetail, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.pipelineDetailHead, children: [
          /* @__PURE__ */ jsx(Typography, { className: classes.detailTitle, style: { marginBottom: 0 }, children: "Pipeline" }),
          /* @__PURE__ */ jsxs("button", { type: "button", className: classes.utilBtn, onClick: () => setPipelineIoOpen((v) => !v), children: [
            pipelineIoOpen ? /* @__PURE__ */ jsx(ExpandLessIcon, { style: { fontSize: 14 } }) : /* @__PURE__ */ jsx(ExpandMoreIcon, { style: { fontSize: 14 } }),
            pipelineIoOpen ? "Hide inputs & results" : "Show inputs & results"
          ] })
        ] }),
        pipelineIoOpen && /* @__PURE__ */ jsxs(Fragment, { children: [
          run.params.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.ioSection, children: [
            /* @__PURE__ */ jsx("div", { className: classes.ioTitle, children: "Input parameters" }),
            run.params.map((p) => /* @__PURE__ */ jsxs("div", { className: classes.ioRow, children: [
              /* @__PURE__ */ jsx("span", { className: classes.ioName, children: p.name }),
              /* @__PURE__ */ jsx("span", { className: classes.ioValue, title: p.value, children: truncateIoValue(p.value) })
            ] }, p.name))
          ] }),
          run.results.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.ioSection, children: [
            /* @__PURE__ */ jsx("div", { className: classes.ioTitle, children: "Results" }),
            run.results.map((r) => /* @__PURE__ */ jsxs("div", { className: classes.ioRow, children: [
              /* @__PURE__ */ jsx("span", { className: classes.ioName, children: r.name }),
              /* @__PURE__ */ jsx("span", { className: classes.ioValue, title: r.value, children: truncateIoValue(r.value) })
            ] }, r.name))
          ] })
        ] })
      ] }),
      openTask && /* @__PURE__ */ jsxs("div", { className: classes.detail, children: [
        /* @__PURE__ */ jsx(Typography, { className: classes.detailTitle, children: openTask.label }),
        /* @__PURE__ */ jsxs("div", { className: classes.detailGrid, children: [
          /* @__PURE__ */ jsxs("div", { className: classes.detailGridItem, children: [
            /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Duration" }),
            /* @__PURE__ */ jsx("span", { className: classes.kvValue, children: openTaskRun ? taskDuration(openTaskRun.startTime, openTaskRun.completionTime) : "\u2014" })
          ] }),
          openTaskDef?.taskRefName && openTaskDef.taskRefName !== openTask.label && /* @__PURE__ */ jsxs("div", { className: classes.detailGridItem, children: [
            /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Task" }),
            /* @__PURE__ */ jsx("span", { className: classes.kvValue, children: openTaskDef.taskRefName })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: classes.detailGridItem, children: [
            /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Result" }),
            /* @__PURE__ */ jsx("span", { className: classes.kvValue, title: openTaskRun?.message, children: taskResultText(openTaskRun, openTask.phase) })
          ] })
        ] }),
        openTaskRun?.startTime && /* @__PURE__ */ jsxs(Typography, { className: classes.note, style: { marginBottom: 0 }, children: [
          "Started ",
          relativeTime(openTaskRun.startTime),
          " \xB7 ",
          formatDateTime(openTaskRun.startTime)
        ] }),
        openTaskRun && openTaskRun.params.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.ioSection, children: [
          /* @__PURE__ */ jsx("div", { className: classes.ioTitle, children: "Input parameters" }),
          openTaskRun.params.map((p) => /* @__PURE__ */ jsxs("div", { className: classes.ioRow, children: [
            /* @__PURE__ */ jsx("span", { className: classes.ioName, children: p.name }),
            /* @__PURE__ */ jsx("span", { className: classes.ioValue, title: p.value, children: truncateIoValue(p.value) })
          ] }, p.name))
        ] }),
        openTaskRun && openTaskRun.results.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.ioSection, children: [
          /* @__PURE__ */ jsx("div", { className: classes.ioTitle, children: "Results" }),
          openTaskRun.results.map((r) => /* @__PURE__ */ jsxs("div", { className: classes.ioRow, children: [
            /* @__PURE__ */ jsx("span", { className: classes.ioName, children: r.name }),
            /* @__PURE__ */ jsx("span", { className: classes.ioValue, title: r.value, children: truncateIoValue(r.value) })
          ] }, r.name))
        ] }),
        openTaskRun?.podName && openTaskRun.steps.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.logsWrap, children: [
          /* @__PURE__ */ jsx("div", { className: classes.ioTitle, children: "Logs" }),
          /* @__PURE__ */ jsx(
            TaskRunLogConsole,
            {
              cluster: run.cluster,
              namespace: openTaskRun.namespace,
              podName: openTaskRun.podName,
              steps: openTaskRun.steps,
              archive: run.archive ? { ...run.archive, taskRun: openTaskRun.name } : void 0
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs(Dialog, { open: yamlOpen, onClose: () => setYamlOpen(false), maxWidth: "md", fullWidth: true, children: [
      /* @__PURE__ */ jsxs(DialogTitle, { className: classes.dialogTitle, disableTypography: true, children: [
        /* @__PURE__ */ jsxs("span", { children: [
          run.name,
          ".yaml"
        ] }),
        /* @__PURE__ */ jsx("button", { type: "button", className: classes.dialogCloseBtn, onClick: () => setYamlOpen(false), children: /* @__PURE__ */ jsx(CloseIcon, { style: { fontSize: 18 } }) })
      ] }),
      /* @__PURE__ */ jsx(DialogContent, { style: { padding: 0 }, children: /* @__PURE__ */ jsx("pre", { className: classes.yamlPre, children: dump(run.raw) }) })
    ] })
  ] });
}

export { COL_GAP, NODE_H, NODE_W, PAD, PipelineDag, ROW_GAP, usePipelineDagStyles };
//# sourceMappingURL=PipelineDag.esm.js.map
