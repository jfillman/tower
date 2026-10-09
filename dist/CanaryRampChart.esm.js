import { jsx, jsxs } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { formatDateTime } from './shared/format.esm.js';
import { preventFocusScroll } from './preventFocusScroll.esm.js';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { useAnalysisRuns } from './useAnalysisRuns.esm.js';

const STEP_COL = 64;
const STEP_GAP = 2;
const STEP_LINE = 14;
const STEP_PITCH = STEP_COL + STEP_GAP + STEP_LINE + STEP_GAP;
const CHART_GUTTER = 32;
const CHART_TRAIL = 14;
const CHART_HEIGHT = 130;
function stepCenterX(i) {
  return CHART_GUTTER + STEP_PITCH * i + STEP_COL / 2;
}
function contentWidth(stepCount) {
  return CHART_GUTTER + STEP_PITCH * Math.max(0, stepCount - 1) + STEP_COL;
}
const useStyles = makeStyles(() => ({
  wrap: { padding: "14px 16px", border: ({ t }) => `1px solid ${t.line}`, borderRadius: 8, backgroundColor: ({ t }) => t.panelAlt },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 },
  headTitle: { fontFamily: fontMono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: ({ t }) => t.textFaint },
  headTitleValue: { color: ({ t }) => t.textLo, textTransform: "none" },
  // Chart+ramp on the left (its own horizontal scroll for a long step list),
  // background analysis pinned on the right, never scrolled out of view with
  // it - a background AnalysisTemplate runs for the whole canary revision,
  // not at any one step position, so it doesn't belong inside the step ramp
  // itself (2026-09-12: "that should be present on the canary rollout step
  // diagram... maybe as a detached item on the right side?").
  // flexWrap (2026-09-16 bug: "the background analysis section covers the
  // graph and other steps when the browser window shrinks") - `scroll`
  // already handles a too-wide STEP LIST via its own overflowX, but at a
  // narrow enough container width there isn't room for both a legible chart
  // AND a fixed-240px side panel on the same row at all; without wrapping,
  // backgroundAnalysis (flex-shrink: 0) held its width and visually
  // overlapped the chart instead of the two ever properly sharing the row.
  // Wrapping drops it to its own full-width row below the chart instead -
  // never overlapping, whatever the container width.
  mainRow: { display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" },
  scroll: { overflowX: "auto", flex: "1 1 380px", minWidth: 0 },
  // flex-grow: 0 (2026-09-17 bug: "the background analysis section seems to
  // take precedence... causing the steps section to use a scrollbar" -
  // equal flex-grow: 1 on both this and `scroll` meant any extra row width
  // split evenly between them, so this panel (whose content is a fixed-size
  // card, never wider than it needs) kept claiming a share of space the step
  // ramp actually needed, pushing it into overflowX before it had to be).
  // Fixed at its own basis and free to shrink on a narrow row (unchanged
  // from before - see the flexWrap comment above); `scroll` alone now
  // absorbs any extra width the row has.
  // Wider (2026-09-24: "the background analysis panel... is a little squashed") -
  // the card holds a full PromQL query and measurement rows, which need real
  // horizontal room; the step ramp (`scroll`) scrolls sideways if it must.
  backgroundAnalysis: { flex: "1 1 380px", minWidth: 320 },
  backgroundAnalysisTitle: {
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: ({ t }) => t.textFaint,
    marginBottom: 6
  },
  chartBox: { paddingBottom: 6 },
  ramp: { display: "flex", alignItems: "flex-start", gap: STEP_GAP, paddingLeft: CHART_GUTTER, paddingBottom: 4 },
  step: { flex: `0 0 ${STEP_COL}px`, width: STEP_COL, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, position: "relative" },
  stepClickable: { cursor: "pointer" },
  node: { width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid", fontSize: 12, backgroundColor: ({ t }) => t.panel },
  nodeCurrent: { animation: "$pulse 1.6s ease-in-out infinite" },
  "@keyframes pulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.55 } },
  // Live-canary activity on the weight chart itself (2026-09-23: "a little
  // more alive/active during a rollout") - the current step's dot pulses, a
  // halo ripples out from it, and the "x% now" label pulses amber. Only ever
  // applied to the step that stepState() says is 'current'.
  "@keyframes halo": { "0%": { opacity: 0.7, transform: "scale(0.8)" }, "100%": { opacity: 0, transform: "scale(2.2)" } },
  chartDotLive: { animation: "$pulse 1.2s ease-in-out infinite" },
  chartHalo: { transformBox: "fill-box", transformOrigin: "center", animation: "$halo 1.6s ease-out infinite" },
  nowLabelLive: { animation: "$pulse 1.2s ease-in-out infinite" },
  line: { flex: `0 0 ${STEP_LINE}px`, height: 2, marginTop: STEP_COL / 2 },
  label: { fontFamily: fontMono, fontSize: 9, color: ({ t }) => t.textFaint, textAlign: "center", lineHeight: 1.3 },
  labelValue: { display: "block", color: ({ t }) => t.textHi, fontSize: 10 },
  legend: { display: "flex", gap: 16, flexWrap: "wrap", padding: "8px 2px 0", fontFamily: fontMono, fontSize: 10, color: ({ t }) => t.textFaint },
  legendDot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block", marginRight: 5 },
  analysisCard: { marginTop: 12, padding: "12px 14px", border: ({ t }) => `1px solid ${t.line}`, borderRadius: 8, backgroundColor: ({ t }) => t.panel },
  analysisHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  // The AnalysisRun/metric's own real message (2026-09-18: "canary error
  // messages need to surface better") - distinct from `note` (this
  // platform's generic "nothing to show" italic caption elsewhere in this
  // file) since this is an actual reported fact, not an absence.
  analysisMessage: { fontSize: 11.5, lineHeight: 1.5, marginBottom: 8, padding: "6px 8px", borderRadius: 6 },
  metricMessage: { fontFamily: fontMono, fontSize: 10, marginTop: 4 },
  analysisName: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, color: ({ t }) => t.textHi },
  badge: { fontFamily: fontMono, fontSize: 10, padding: "2px 8px", borderRadius: 10, border: "1px solid" },
  query: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint, backgroundColor: ({ t }) => t.panelAlt, padding: "6px 8px", borderRadius: 4, marginBottom: 10, overflowX: "auto", whiteSpace: "pre" },
  measureRow: { display: "flex", gap: 14, alignItems: "center", fontFamily: fontMono, fontSize: 11, padding: "4px 0", borderBottom: ({ t }) => `1px dashed ${t.lineSoft}` },
  measureRowLast: { borderBottom: "none" },
  measureTime: { color: ({ t }) => t.textFaint, width: 172, flexShrink: 0, whiteSpace: "nowrap" },
  measureVal: { color: ({ t }) => t.textHi },
  cond: { fontFamily: fontMono, fontSize: 10, color: ({ t }) => t.textFaint, marginTop: 8 },
  note: { fontSize: 12, fontStyle: "italic", color: ({ t }) => t.textLo, padding: "4px 0" }
}));
function stepLabelParts(s) {
  if (s.kind === "setWeight") {
    return { icon: "\u25CF", text: `${s.weight}%`, caption: s.implied ? "full promotion" : "weight" };
  }
  if (s.kind === "pause") return { icon: "\u23F1", text: s.pauseDuration ?? "manual", caption: "pause" };
  return { icon: "\u{1F9EA}", text: (s.analysisTemplates ?? []).join(", ") || "analysis", caption: "analysis" };
}
function phaseColor(t, state) {
  if (state === "done") return t.good;
  if (state === "current") return t.amber;
  if (state === "bad") return t.bad;
  return t.textFaint;
}
function stepState(index, currentStepIndex, run) {
  if (currentStepIndex === void 0) return "pending";
  if (run?.phase === "Failed" || run?.phase === "Error") return "bad";
  if (index < currentStepIndex) return "done";
  if (index === currentStepIndex) return run?.phase === "Successful" ? "done" : "current";
  return "pending";
}
function analysisTone(t, phase) {
  if (phase === "Successful") return { color: t.good, soft: t.goodSoft };
  if (phase === "Failed" || phase === "Error") return { color: t.bad, soft: t.badSoft };
  return { color: t.amberInk, soft: t.amberSoft };
}
function AnalysisCard({ templateName, run, classes, t }) {
  const { color: toneColor, soft: toneSoft } = analysisTone(t, run.phase);
  return /* @__PURE__ */ jsxs("div", { className: classes.analysisCard, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.analysisHead, children: [
      /* @__PURE__ */ jsx("span", { className: classes.analysisName, children: templateName }),
      /* @__PURE__ */ jsx("span", { className: classes.badge, style: { borderColor: toneColor, backgroundColor: toneSoft, color: toneColor }, children: run.phase ?? "Unknown" })
    ] }),
    run.message && /* @__PURE__ */ jsx(Typography, { className: classes.analysisMessage, style: { backgroundColor: toneSoft, color: toneColor }, children: run.message }),
    run.metrics.length === 0 && /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "No metric results recorded yet." }),
    run.metrics.map((m) => /* @__PURE__ */ jsxs("div", { style: { marginBottom: 8 }, children: [
      m.query && /* @__PURE__ */ jsx("div", { className: classes.query, children: m.query }),
      m.measurements.map((meas, i) => /* @__PURE__ */ jsxs("div", { className: `${classes.measureRow} ${i === m.measurements.length - 1 ? classes.measureRowLast : ""}`, children: [
        /* @__PURE__ */ jsx("span", { className: classes.measureTime, children: meas.at ? formatDateTime(meas.at) : "\u2014" }),
        /* @__PURE__ */ jsxs("span", { className: classes.measureVal, children: [
          m.name,
          " = ",
          meas.value
        ] })
      ] }, i)),
      m.successCondition && /* @__PURE__ */ jsxs("div", { className: classes.cond, children: [
        "success condition: ",
        m.successCondition
      ] }),
      m.message && /* @__PURE__ */ jsx("div", { className: classes.metricMessage, style: { color: analysisTone(t, m.phase).color }, children: m.message })
    ] }, m.name))
  ] });
}
function CanaryRampChart({
  cluster,
  namespace,
  rolloutName,
  podHash,
  progress
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [collapsedSteps, setCollapsedSteps] = useState(/* @__PURE__ */ new Set());
  const analysisRuns = useAnalysisRuns({ cluster, namespace, rolloutName, podHash });
  const steps = progress.steps;
  const currentStepIndex = progress.currentStepIndex;
  const currentWeight = progress.currentWeight;
  const analysisStepIndices = steps.map((s, i) => ({ s, i })).filter((x) => x.s.kind === "analysis").map((x) => x.i);
  const labelledStepRuns = analysisRuns.runs.filter((r) => r.rolloutType === "Step" && r.stepIndex !== void 0);
  const sortedRuns = analysisRuns.runs.filter((r) => r.rolloutType !== "Background" && r.name !== progress.currentBackgroundAnalysisRunName).sort((a, b) => new Date(a.startedAt ?? 0).getTime() - new Date(b.startedAt ?? 0).getTime());
  const runByStepIndex = /* @__PURE__ */ new Map();
  if (labelledStepRuns.length > 0) {
    [...labelledStepRuns].sort((a, b) => new Date(a.startedAt ?? 0).getTime() - new Date(b.startedAt ?? 0).getTime()).forEach((r) => runByStepIndex.set(r.stepIndex, r));
  } else {
    analysisStepIndices.forEach((stepIndex, k) => {
      if (sortedRuns[k]) runByStepIndex.set(stepIndex, sortedRuns[k]);
    });
  }
  if (steps.length === 0) {
    return /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "This rollout declares no canary steps." });
  }
  const width = contentWidth(steps.length) + CHART_TRAIL;
  const padT = 10;
  const padB = 20;
  const yFor = (pct) => padT + (100 - pct) / 100 * (CHART_HEIGHT - padT - padB);
  let lastWeight = 0;
  const series = steps.map((s) => {
    if (s.kind === "setWeight" && s.weight !== void 0) lastWeight = s.weight;
    return lastWeight;
  });
  const boundary = currentStepIndex ?? 0;
  let donePath = "";
  let pendingPath = "";
  series.forEach((v, i) => {
    const x = stepCenterX(i);
    const y = yFor(v);
    if (i <= boundary) {
      donePath += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
      if (i === boundary) pendingPath += `M ${x} ${y}`;
    } else {
      pendingPath += ` L ${x} ${y}`;
    }
  });
  const ticks = [0, 25, 50, 75, 100];
  const backgroundTemplates = progress.backgroundAnalysisTemplates ?? [];
  const backgroundRun = analysisRuns.runs.find((r) => r.rolloutType === "Background") ?? (progress.currentBackgroundAnalysisRunName ? analysisRuns.runs.find((r) => r.name === progress.currentBackgroundAnalysisRunName) : void 0);
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsxs("span", { className: classes.headTitle, children: [
        "Canary rollout \xB7 ",
        /* @__PURE__ */ jsx("span", { className: classes.headTitleValue, children: rolloutName }),
        currentWeight !== void 0 && /* @__PURE__ */ jsxs("span", { className: classes.headTitleValue, children: [
          " \xB7 weight ",
          currentWeight,
          "%"
        ] })
      ] }),
      currentStepIndex !== void 0 && /* @__PURE__ */ jsxs("span", { className: classes.headTitle, children: [
        "step ",
        Math.min(currentStepIndex + 1, steps.length),
        " / ",
        steps.length
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.mainRow, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.scroll, children: [
        /* @__PURE__ */ jsx("div", { className: classes.chartBox, children: /* @__PURE__ */ jsxs("svg", { style: { display: "block", width, height: CHART_HEIGHT }, width, height: CHART_HEIGHT, viewBox: `0 0 ${width} ${CHART_HEIGHT}`, children: [
          ticks.map((tick) => /* @__PURE__ */ jsxs("g", { children: [
            /* @__PURE__ */ jsx("line", { x1: CHART_GUTTER, y1: yFor(tick), x2: width - CHART_TRAIL, y2: yFor(tick), stroke: t.lineSoft, strokeWidth: 1 }),
            /* @__PURE__ */ jsxs("text", { x: CHART_GUTTER - 6, y: yFor(tick) + 3, textAnchor: "end", fontFamily: fontMono, fontSize: 9, fill: t.textFaint, children: [
              tick,
              "%"
            ] })
          ] }, tick)),
          /* @__PURE__ */ jsx("path", { d: pendingPath, fill: "none", stroke: t.textFaint, strokeWidth: 1.5, strokeDasharray: "4 4", opacity: 0.55 }),
          /* @__PURE__ */ jsx("path", { d: donePath, fill: "none", stroke: t.sky, strokeWidth: 2 }),
          steps.map((s, i) => {
            const run = runByStepIndex.get(i);
            const state = stepState(i, currentStepIndex, run);
            const color = phaseColor(t, state);
            const x = stepCenterX(i);
            const y = yFor(series[i]);
            const filled = state === "done" || state === "current" || state === "bad";
            const live = state === "current";
            const halo = live ? /* @__PURE__ */ jsx("circle", { cx: x, cy: y, r: 7, fill: "none", stroke: color, strokeWidth: 1.5, className: classes.chartHalo }) : null;
            const backing = (shape, r) => {
              if (!live) return null;
              if (shape === "diamond") {
                return /* @__PURE__ */ jsx("rect", { x: x - 5, y: y - 5, width: 10, height: 10, fill: t.panel, transform: `rotate(45 ${x} ${y})` });
              }
              return /* @__PURE__ */ jsx("circle", { cx: x, cy: y, r: r + 0.75, fill: t.panel });
            };
            if (s.kind === "analysis") {
              return /* @__PURE__ */ jsxs("g", { children: [
                halo,
                backing("diamond", 5),
                /* @__PURE__ */ jsx("rect", { className: live ? classes.chartDotLive : void 0, x: x - 5, y: y - 5, width: 10, height: 10, fill: filled ? color : t.panel, stroke: color, strokeWidth: 1.5, transform: `rotate(45 ${x} ${y})` })
              ] }, i);
            }
            if (s.kind === "pause") {
              return /* @__PURE__ */ jsxs("g", { children: [
                halo,
                backing("dot", 4),
                /* @__PURE__ */ jsx("circle", { className: live ? classes.chartDotLive : void 0, cx: x, cy: y, r: 4, fill: t.panel, stroke: color, strokeWidth: 1.5 })
              ] }, i);
            }
            return /* @__PURE__ */ jsxs("g", { children: [
              halo,
              backing("dot", 5),
              /* @__PURE__ */ jsx(
                "circle",
                {
                  className: live ? classes.chartDotLive : void 0,
                  cx: x,
                  cy: y,
                  r: 5,
                  fill: filled ? color : t.panel,
                  stroke: color,
                  strokeWidth: 1.5,
                  strokeDasharray: s.implied ? "2 2" : void 0
                }
              )
            ] }, i);
          }),
          currentStepIndex !== void 0 && currentStepIndex < steps.length && currentWeight !== void 0 && /* @__PURE__ */ jsxs("text", { x: stepCenterX(currentStepIndex), y: yFor(series[currentStepIndex]) - 14, textAnchor: "middle", fontFamily: fontMono, fontWeight: 600, fontSize: 11, fill: t.amberInk, className: currentWeight < 100 ? classes.nowLabelLive : void 0, children: [
            currentWeight,
            "% now"
          ] })
        ] }) }),
        /* @__PURE__ */ jsx("div", { className: classes.ramp, children: steps.map((s, i) => {
          const run = runByStepIndex.get(i);
          const state = stepState(i, currentStepIndex, run);
          const color = phaseColor(t, state);
          const parts = stepLabelParts(s);
          const clickable = s.kind === "analysis" && Boolean(run);
          const toggle = () => setCollapsedSteps((prev) => {
            const next = new Set(prev);
            if (next.has(i)) next.delete(i);
            else next.add(i);
            return next;
          });
          return /* @__PURE__ */ jsxs("div", { style: { display: "contents" }, children: [
            /* @__PURE__ */ jsxs(
              "div",
              {
                className: `${classes.step} ${clickable ? classes.stepClickable : ""}`,
                role: clickable ? "button" : void 0,
                tabIndex: clickable ? 0 : void 0,
                onClick: clickable ? toggle : void 0,
                onKeyDown: clickable ? (ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    toggle();
                  }
                } : void 0,
                children: [
                  /* @__PURE__ */ jsx(
                    "div",
                    {
                      className: `${classes.node} ${state === "current" ? classes.nodeCurrent : ""}`,
                      style: {
                        borderColor: color,
                        borderStyle: s.implied ? "dashed" : "solid",
                        color,
                        backgroundColor: state === "pending" ? t.panelAlt : t.panel
                      },
                      children: parts.icon
                    }
                  ),
                  /* @__PURE__ */ jsxs("span", { className: classes.label, children: [
                    /* @__PURE__ */ jsx("span", { className: classes.labelValue, children: parts.text }),
                    parts.caption
                  ] })
                ]
              }
            ),
            i < steps.length - 1 && /* @__PURE__ */ jsx("div", { className: classes.line, style: { backgroundColor: i < boundary ? t.good : t.line } })
          ] }, i);
        }) })
      ] }),
      backgroundTemplates.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.backgroundAnalysis, children: [
        /* @__PURE__ */ jsx("div", { className: classes.backgroundAnalysisTitle, children: "Background analysis" }),
        backgroundRun ? /* @__PURE__ */ jsx(AnalysisCard, { templateName: backgroundTemplates.join(", "), run: backgroundRun, classes, t }) : /* @__PURE__ */ jsxs(Typography, { className: classes.note, children: [
          backgroundTemplates.join(", "),
          " - not currently running."
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.legend, children: [
      /* @__PURE__ */ jsxs("span", { children: [
        /* @__PURE__ */ jsx("i", { className: classes.legendDot, style: { backgroundColor: t.good } }),
        "completed"
      ] }),
      /* @__PURE__ */ jsxs("span", { children: [
        /* @__PURE__ */ jsx("i", { className: classes.legendDot, style: { backgroundColor: t.amber } }),
        "current"
      ] }),
      /* @__PURE__ */ jsxs("span", { children: [
        /* @__PURE__ */ jsx("i", { className: classes.legendDot, style: { backgroundColor: t.bad } }),
        "failed"
      ] }),
      /* @__PURE__ */ jsxs("span", { children: [
        /* @__PURE__ */ jsx("i", { className: classes.legendDot, style: { backgroundColor: t.textFaint, opacity: 0.5 } }),
        "pending"
      ] })
    ] }),
    analysisStepIndices.length > 0 && /* @__PURE__ */ jsxs("div", { style: { marginTop: 12 }, children: [
      /* @__PURE__ */ jsx("div", { className: classes.backgroundAnalysisTitle, children: "Analysis checks" }),
      analysisStepIndices.map((i) => {
        const run = runByStepIndex.get(i);
        const name = (steps[i].analysisTemplates ?? []).join(", ") || "analysis";
        const label = `Step ${i + 1} \xB7 ${name}`;
        if (!run) {
          return /* @__PURE__ */ jsxs(Typography, { className: classes.note, children: [
            label,
            " - not started yet."
          ] }, i);
        }
        const collapsed = collapsedSteps.has(i);
        return /* @__PURE__ */ jsxs("div", { style: { marginBottom: 8 }, children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onMouseDown: preventFocusScroll,
              onClick: () => setCollapsedSteps((prev) => {
                const next = new Set(prev);
                if (next.has(i)) next.delete(i);
                else next.add(i);
                return next;
              }),
              style: { background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: fontMono, fontSize: 11, color: t.textLo },
              children: [
                collapsed ? "\u25B8" : "\u25BE",
                " ",
                label,
                " \xB7 ",
                run.phase ?? "Unknown"
              ]
            }
          ),
          !collapsed && /* @__PURE__ */ jsx(AnalysisCard, { templateName: name, run, classes, t })
        ] }, i);
      })
    ] }),
    analysisStepIndices.length > 0 && analysisRuns.runs.length === 0 && !analysisRuns.loading && !analysisRuns.error && /* @__PURE__ */ jsxs(Typography, { className: classes.note, children: [
      "No AnalysisRuns found for this rollout",
      podHash ? ` (pod hash ${podHash})` : "",
      " yet."
    ] }),
    analysisRuns.error && /* @__PURE__ */ jsxs(Typography, { className: classes.note, children: [
      "Couldn't load analysis results: ",
      analysisRuns.error
    ] })
  ] });
}

export { CanaryRampChart };
//# sourceMappingURL=CanaryRampChart.esm.js.map
