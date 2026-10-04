import { jsxs, jsx } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, fontDisplay, useHangarTokens } from '../brand/tokens.esm.js';
import { preventFocusScroll } from '../preventFocusScroll.esm.js';
import { SegmentBar } from './ProvisioningStrip.esm.js';
import { fmtDuration } from './shared.esm.js';

const SCALE_SEC = 180;
const useStyles = makeStyles(() => ({
  root: { display: "flex", flexDirection: "column", gap: 14 },
  pills: { display: "flex", gap: 8, flexWrap: "wrap" },
  pill: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    padding: "5px 12px",
    borderRadius: 16,
    fontSize: 13,
    cursor: "pointer",
    backgroundColor: ({ t }) => t.panel,
    color: ({ t }) => t.textHi,
    border: ({ t }) => `1px solid ${t.line}`
  },
  pillOn: { borderColor: ({ t }) => t.amber },
  mono: {
    fontFamily: fontMono,
    fontSize: 12,
    fontVariantNumeric: "tabular-nums"
  },
  panel: {
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    backgroundColor: ({ t }) => t.panel,
    padding: 16,
    minWidth: 0
  },
  title: {
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 22,
    color: ({ t }) => t.textHi
  },
  crumb: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textFaint },
  kv: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 14,
    margin: "14px 0"
  },
  k: {
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: ({ t }) => t.textFaint
  },
  v: {
    fontFamily: fontDisplay,
    fontWeight: 500,
    fontSize: 20,
    color: ({ t }) => t.textHi,
    fontVariantNumeric: "tabular-nums"
  },
  head: {
    fontFamily: fontMono,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: ({ t }) => t.textFaint,
    marginBottom: 12
  },
  segs: { display: "flex", gap: 4, height: 10 },
  seg: {
    flex: 1,
    borderRadius: 1,
    overflow: "hidden",
    backgroundColor: ({ t }) => t.line
  },
  list: { listStyle: "none", margin: 0, padding: 0 },
  li: {
    display: "grid",
    gridTemplateColumns: "22px minmax(0, 1fr) 150px 112px",
    columnGap: 12,
    position: "relative",
    paddingBottom: 14,
    alignItems: "start",
    "&::before": {
      content: '""',
      position: "absolute",
      left: 10,
      top: 22,
      bottom: 0,
      width: 2,
      backgroundColor: ({ t }) => t.line
    },
    "&:last-child::before": { display: "none" },
    "@media (max-width: 700px)": {
      gridTemplateColumns: "22px minmax(0, 1fr) auto"
    }
  },
  liDone: { "&::before": { backgroundColor: ({ t }) => t.good } },
  name: {
    fontWeight: 600,
    fontSize: 14,
    lineHeight: "22px",
    color: ({ t }) => t.textHi,
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap"
  },
  nameMuted: { color: ({ t }) => t.textFaint, fontWeight: 500 },
  nameRun: { color: ({ t }) => t.sky },
  nameFail: { color: ({ t }) => t.bad },
  desc: { fontSize: 12.5, color: ({ t }) => t.textLo, lineHeight: 1.4 },
  detail: { fontSize: 12.5, color: ({ t }) => t.amber, marginTop: 2 },
  links: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 },
  action: {
    marginTop: 6,
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: ({ t }) => t.sky,
    background: "none",
    border: "1px solid currentColor",
    borderRadius: 3,
    padding: "2px 8px",
    cursor: "pointer",
    "&:disabled": { opacity: 0.6, cursor: "default" }
  },
  link: {
    fontFamily: fontMono,
    fontSize: 11.5,
    color: ({ t }) => t.sky,
    textDecoration: "none",
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 3,
    padding: "2px 7px",
    "&:hover": { borderColor: ({ t }) => t.sky }
  },
  created: { width: "100%", borderCollapse: "collapse", fontSize: 12.5 },
  createdRow: {
    borderTop: ({ t }) => `1px solid ${t.line}`,
    "& td": { padding: "5px 8px 5px 0", color: ({ t }) => t.textLo, verticalAlign: "middle" },
    "& td:first-child": { fontFamily: fontMono, fontSize: 11.5, whiteSpace: "nowrap", color: ({ t }) => t.textFaint }
  },
  dot: { display: "inline-block", width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  linkState: { color: ({ t }) => t.textFaint, marginLeft: 6 },
  tag: {
    fontFamily: fontMono,
    fontSize: 10,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: ({ t }) => t.textFaint,
    border: ({ t }) => `1px solid ${t.line}`,
    padding: "2px 5px",
    borderRadius: 3
  },
  bars: {
    position: "relative",
    height: 20,
    marginTop: 2,
    "@media (max-width: 700px)": { gridColumn: "2 / 4", order: 5 }
  },
  typical: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 6,
    border: ({ t }) => `1px dashed ${t.textFaint}`,
    borderRadius: 1
  },
  actual: {
    position: "absolute",
    top: 0,
    left: 0,
    height: 11,
    borderRadius: 2
  },
  time: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    lineHeight: 1.3,
    paddingTop: 2,
    fontFamily: fontMono,
    fontSize: 12,
    color: ({ t }) => t.textLo,
    fontVariantNumeric: "tabular-nums"
  },
  timeSub: { fontSize: 11, color: ({ t }) => t.textFaint },
  timeSlow: { color: ({ t }) => t.amber },
  legend: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    fontSize: 12,
    color: ({ t }) => t.textFaint,
    marginTop: 14
  },
  swatch: {
    display: "inline-block",
    width: 18,
    height: 8,
    borderRadius: 2,
    marginRight: 6,
    verticalAlign: "middle"
  },
  empty: {
    border: ({ t }) => `1px dashed ${t.line}`,
    borderRadius: 5,
    padding: 24,
    textAlign: "center",
    color: ({ t }) => t.textLo,
    fontSize: 13
  }
}));
const createdLabel = (ready) => {
  if (ready === void 0) return "not tracked";
  return ready ? "ready" : "waiting";
};
const createdColor = (ready, t) => {
  if (ready === void 0) return t.line;
  return ready ? t.good : t.sky;
};
function StepIcon({ state, t }) {
  if (state === "done") {
    return /* @__PURE__ */ jsxs("svg", { width: "20", height: "20", viewBox: "0 0 20 20", role: "img", "aria-label": "done", children: [
      /* @__PURE__ */ jsx("circle", { cx: "10", cy: "10", r: "9", fill: t.good }),
      /* @__PURE__ */ jsx(
        "path",
        {
          d: "M6 10.3l2.8 2.7L14 7.6",
          stroke: t.panel,
          strokeWidth: "2",
          fill: "none",
          strokeLinecap: "round",
          strokeLinejoin: "round"
        }
      )
    ] });
  }
  if (state === "fail") {
    return /* @__PURE__ */ jsxs("svg", { width: "20", height: "20", viewBox: "0 0 20 20", role: "img", "aria-label": "failed", children: [
      /* @__PURE__ */ jsx("circle", { cx: "10", cy: "10", r: "9", fill: t.bad }),
      /* @__PURE__ */ jsx("path", { d: "M7 7l6 6M13 7l-6 6", stroke: t.panel, strokeWidth: "2", strokeLinecap: "round" })
    ] });
  }
  if (state === "run") {
    return /* @__PURE__ */ jsxs("svg", { width: "20", height: "20", viewBox: "0 0 20 20", role: "img", "aria-label": "in progress", children: [
      /* @__PURE__ */ jsx("circle", { cx: "10", cy: "10", r: "8", fill: "none", stroke: t.line, strokeWidth: "2.5" }),
      /* @__PURE__ */ jsx(
        "circle",
        {
          cx: "10",
          cy: "10",
          r: "8",
          fill: "none",
          stroke: t.sky,
          strokeWidth: "2.5",
          strokeDasharray: "14 40",
          strokeLinecap: "round",
          children: /* @__PURE__ */ jsx(
            "animateTransform",
            {
              attributeName: "transform",
              type: "rotate",
              from: "0 10 10",
              to: "360 10 10",
              dur: "1s",
              repeatCount: "indefinite"
            }
          )
        }
      )
    ] });
  }
  return /* @__PURE__ */ jsx("svg", { width: "20", height: "20", viewBox: "0 0 20 20", role: "img", "aria-label": "waiting", children: /* @__PURE__ */ jsx("circle", { cx: "10", cy: "10", r: "8", fill: "none", stroke: t.line, strokeWidth: "2" }) });
}
function RefreshCatalogAction({
  onRefresh,
  className
}) {
  const [state, setState] = useState("idle");
  const label = { idle: "Refresh catalog now", busy: "Asking\u2026", sent: "Requested, checking\u2026", error: "Could not refresh" }[state];
  return /* @__PURE__ */ jsx(
    "button",
    {
      type: "button",
      className,
      disabled: state === "busy" || state === "sent",
      onMouseDown: preventFocusScroll,
      onClick: async () => {
        setState("busy");
        try {
          await onRefresh();
          setState("sent");
          setTimeout(() => setState("idle"), 2e4);
        } catch {
          setState("error");
          setTimeout(() => setState("idle"), 5e3);
        }
      },
      children: label
    }
  );
}
function Step({
  step,
  classes,
  t,
  onRefreshCatalog
}) {
  const pct = (sec) => `${Math.min(100, sec / SCALE_SEC * 100).toFixed(1)}%`;
  const slow = step.state === "done" && step.seconds !== void 0 && step.seconds > step.typicalSec * 1.1 + 1;
  let fill = t.good;
  if (step.state === "run") fill = t.sky;
  else if (step.state === "fail") fill = t.bad;
  else if (slow) fill = t.amber;
  const delta = step.seconds !== void 0 ? Math.round(step.seconds - step.typicalSec) : 0;
  let nameCls = classes.name;
  if (step.state === "pend") nameCls += ` ${classes.nameMuted}`;
  else if (step.state === "run") nameCls += ` ${classes.nameRun}`;
  else if (step.state === "fail") nameCls += ` ${classes.nameFail}`;
  return /* @__PURE__ */ jsxs("li", { className: `${classes.li} ${step.state === "done" ? classes.liDone : ""}`, children: [
    /* @__PURE__ */ jsx("span", { children: /* @__PURE__ */ jsx(StepIcon, { state: step.state, t }) }),
    /* @__PURE__ */ jsxs("div", { style: { minWidth: 0 }, children: [
      /* @__PURE__ */ jsxs("div", { className: nameCls, children: [
        step.title,
        step.parallel && /* @__PURE__ */ jsx("span", { className: classes.tag, children: "parallel" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: classes.desc, children: step.desc }),
      step.detail && /* @__PURE__ */ jsx("div", { className: classes.detail, children: step.detail }),
      step.id === "catalog" && step.state === "run" && onRefreshCatalog && /* @__PURE__ */ jsx(RefreshCatalogAction, { onRefresh: onRefreshCatalog, className: classes.action }),
      step.links && step.links.length > 0 && /* @__PURE__ */ jsx("div", { className: classes.links, children: step.links.map((l) => /* @__PURE__ */ jsxs("a", { className: classes.link, href: l.url, target: "_blank", rel: "noopener noreferrer", children: [
        l.label,
        l.state && /* @__PURE__ */ jsx("span", { className: classes.linkState, children: l.state })
      ] }, l.url)) })
    ] }),
    /* @__PURE__ */ jsxs(
      "div",
      {
        className: classes.bars,
        role: "img",
        "aria-label": `This run ${step.seconds ?? 0} seconds, typical ${step.typicalSec} seconds`,
        children: [
          /* @__PURE__ */ jsx("i", { className: classes.typical, style: { width: pct(step.typicalSec) } }),
          step.seconds !== void 0 && step.seconds > 0 && step.state !== "pend" && /* @__PURE__ */ jsx("b", { className: classes.actual, style: { width: pct(step.seconds), backgroundColor: fill } })
        ]
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: classes.time, children: [
      /* @__PURE__ */ jsx("span", { children: step.seconds !== void 0 && step.state !== "pend" ? fmtDuration(step.seconds) : `~${fmtDuration(step.typicalSec)}` }),
      step.state === "done" && step.seconds !== void 0 && /* @__PURE__ */ jsxs("span", { className: `${classes.timeSub} ${slow ? classes.timeSlow : ""}`, children: [
        "typical ",
        fmtDuration(step.typicalSec),
        " \xB7 ",
        delta > 0 ? "+" : "\u2212",
        fmtDuration(Math.abs(delta))
      ] }),
      step.state === "run" && /* @__PURE__ */ jsxs("span", { className: classes.timeSub, children: [
        "typical ",
        fmtDuration(step.typicalSec)
      ] })
    ] })
  ] });
}
function ProvisioningView({
  items,
  selected,
  onSelect,
  error,
  loading,
  onRefreshCatalog
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  if (error) {
    return /* @__PURE__ */ jsxs("div", { className: classes.empty, children: [
      "Provisioning status could not be read from the dev cluster: ",
      error
    ] });
  }
  if (items.length === 0) {
    return /* @__PURE__ */ jsx("div", { className: classes.empty, children: loading ? "Reading provisioning status\u2026" : "Nothing is provisioning. A new service appears here as soon as you create it." });
  }
  const inFlight = items.filter((i) => !i.derived.stalled);
  const stalled = items.filter((i) => i.derived.stalled);
  const item = items.find((i) => i.inputs.xr.name === selected) ?? inFlight[0] ?? items[0];
  const { derived, inputs } = item;
  const pill = (i) => /* @__PURE__ */ jsxs(
    "button",
    {
      type: "button",
      "aria-pressed": i === item,
      className: `${classes.pill} ${i === item ? classes.pillOn : ""}`,
      onClick: () => onSelect(i.inputs.xr.name),
      children: [
        /* @__PURE__ */ jsx("b", { children: i.inputs.xr.name }),
        /* @__PURE__ */ jsxs("span", { className: classes.mono, children: [
          i.derived.percent,
          "%"
        ] })
      ]
    },
    i.inputs.xr.name
  );
  return /* @__PURE__ */ jsxs("div", { className: classes.root, children: [
    /* @__PURE__ */ jsx("div", { className: classes.pills, children: inFlight.map((i) => pill(i)) }),
    stalled.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("div", { className: classes.head, children: "Stalled \xB7 built hours ago but not deployed: no rollout on the dev cluster, or a cloud deploy that never ran or never finished. It either deploys elsewhere or the deploy is stuck" }),
      /* @__PURE__ */ jsx("div", { className: classes.pills, children: stalled.map((i) => pill(i)) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.panel, children: [
      /* @__PURE__ */ jsx("div", { className: classes.title, children: inputs.xr.name }),
      /* @__PURE__ */ jsxs("div", { className: classes.crumb, children: [
        inputs.xr.kind,
        " \xB7 ",
        inputs.xr.cluster
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: classes.k, children: "Progress" }),
          /* @__PURE__ */ jsxs("div", { className: classes.v, children: [
            derived.percent,
            "%"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: classes.k, children: "Elapsed" }),
          /* @__PURE__ */ jsx("div", { className: classes.v, children: fmtDuration(derived.elapsedSec) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: classes.k, children: "Remaining" }),
          /* @__PURE__ */ jsx("div", { className: classes.v, children: derived.complete ? "Ready" : fmtDuration(derived.etaSec) })
        ] })
      ] }),
      /* @__PURE__ */ jsx(SegmentBar, { item, classes, t })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.panel, children: [
      /* @__PURE__ */ jsx("div", { className: classes.head, children: "Steps" }),
      /* @__PURE__ */ jsx("ol", { className: classes.list, children: derived.steps.map((s) => /* @__PURE__ */ jsx(Step, { step: s, classes, t, onRefreshCatalog }, s.id)) }),
      /* @__PURE__ */ jsxs("div", { className: classes.legend, children: [
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx("i", { className: classes.swatch, style: { backgroundColor: t.good } }),
          "This run"
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx("i", { className: classes.swatch, style: { backgroundColor: t.amber } }),
          "Over typical"
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx("i", { className: classes.swatch, style: { border: `1px dashed ${t.textFaint}`, height: 5 } }),
          "Typical (estimate)"
        ] })
      ] })
    ] }),
    inputs.created && inputs.created.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.panel, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
        "What gets created \xB7 ",
        inputs.created.filter((c) => c.ready).length,
        " of ",
        inputs.created.length,
        " ready"
      ] }),
      /* @__PURE__ */ jsx("table", { className: classes.created, children: /* @__PURE__ */ jsx("tbody", { children: inputs.created.map((c) => /* @__PURE__ */ jsxs("tr", { className: classes.createdRow, children: [
        /* @__PURE__ */ jsx("td", { children: c.kind }),
        /* @__PURE__ */ jsx("td", { children: c.name }),
        /* @__PURE__ */ jsxs("td", { children: [
          /* @__PURE__ */ jsx(
            "i",
            {
              className: classes.dot,
              style: { backgroundColor: createdColor(c.ready, t) },
              role: "img",
              "aria-label": createdLabel(c.ready)
            }
          ),
          createdLabel(c.ready)
        ] })
      ] }, `${c.kind}/${c.name}`)) }) })
    ] })
  ] });
}

export { ProvisioningView };
//# sourceMappingURL=ProvisioningView.esm.js.map
