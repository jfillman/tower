import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import MemoryIcon from '@material-ui/icons/Memory';
import SpeedIcon from '@material-ui/icons/Speed';
import ArrowDownwardIcon from '@material-ui/icons/ArrowDownward';
import ArrowUpwardIcon from '@material-ui/icons/ArrowUpward';
import StorageIcon from '@material-ui/icons/Storage';
import { fontMono, fontDisplay, useHangarTokens } from '../../brand/tokens.esm.js';
import { preventFocusScroll } from '../../preventFocusScroll.esm.js';
import { usePrometheusRangeQuery } from '../../usePrometheusQuery.esm.js';
import { cpuUsageQuery, memoryUsageQuery, networkRxQuery, networkTxQuery, diskReadQuery, diskWriteQuery, formatCores, formatBytesPerSec } from './metricsQueries.esm.js';

const RANGE_SECONDS = 15 * 60;
const STEP_SECONDS = 30;
const POLL_MS = 2e4;
function sumSeriesAtEachPoint(series) {
  const byTime = /* @__PURE__ */ new Map();
  series.forEach(
    (s) => s.points.forEach((p) => {
      byTime.set(p.time, (byTime.get(p.time) ?? 0) + (Number.isFinite(p.value) ? p.value : 0));
    })
  );
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));
}
const useStyles = makeStyles(() => ({
  panel: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 10,
    padding: "14px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, color: ({ t }) => t.textHi },
  liveToggle: {
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: "3px 9px",
    borderRadius: 12,
    border: ({ t }) => `1px solid ${t.line}`,
    background: "none",
    color: ({ t }) => t.textFaint,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 5
  },
  liveToggleActive: { color: ({ t }) => t.amberInk, borderColor: ({ t }) => t.amberLine, backgroundColor: ({ t }) => t.amberSoft },
  liveDot: { width: 6, height: 6, borderRadius: "50%", backgroundColor: ({ t }) => t.amber, animation: "$pulse 1.6s ease-in-out infinite" },
  "@keyframes pulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.4 } },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 },
  tile: {
    padding: "10px 12px",
    borderRadius: 8,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.panelAlt,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0
  },
  tileHead: { display: "flex", alignItems: "center", gap: 6, color: ({ t }) => t.textFaint },
  tileIcon: { display: "flex", fontSize: 15 },
  tileLabel: { fontFamily: fontMono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" },
  tileValue: { fontFamily: fontMono, fontWeight: 700, fontSize: 18, color: ({ t }) => t.textHi },
  tileNote: { fontSize: 10.5, fontStyle: "italic", color: ({ t }) => t.textFaint },
  note: { fontSize: 12, fontStyle: "italic", color: ({ t }) => t.textLo }
}));
function Sparkline({ points, color, t }) {
  const width = 130;
  const height = 30;
  if (points.length < 2) return /* @__PURE__ */ jsx("svg", { width, height });
  const values = points.map((p) => p.value);
  const max = Math.max(...values, 1e-4);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);
  const path = points.map((p, i) => {
    const x = i * stepX;
    const y = height - (p.value - min) / span * height;
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const areaPath = `${path} L ${width} ${height} L 0 ${height} Z`;
  return /* @__PURE__ */ jsxs("svg", { width, height, viewBox: `0 0 ${width} ${height}`, style: { display: "block" }, children: [
    /* @__PURE__ */ jsx("path", { d: areaPath, fill: color, opacity: 0.14, stroke: "none" }),
    /* @__PURE__ */ jsx("path", { d: path, fill: "none", stroke: color, strokeWidth: 1.5 }),
    /* @__PURE__ */ jsx("circle", { cx: width, cy: height - (values[values.length - 1] - min) / span * height, r: 2.2, fill: color }),
    /* @__PURE__ */ jsx("text", { x: 0, y: height + 9, fontFamily: fontMono, fontSize: 8, fill: t.textFaint, children: "15m" })
  ] });
}
function MetricTile({
  icon,
  label,
  query,
  cluster,
  format,
  color,
  refreshNonce,
  classes,
  t
}) {
  const { loading, error, series } = usePrometheusRangeQuery(
    cluster,
    query,
    RANGE_SECONDS,
    STEP_SECONDS,
    refreshNonce
  );
  const points = sumSeriesAtEachPoint(series);
  const current = points.length > 0 ? points[points.length - 1].value : void 0;
  let body;
  if (!query) {
    body = /* @__PURE__ */ jsx(Typography, { className: classes.tileNote, children: "no pods" });
  } else if (loading && points.length === 0) {
    body = /* @__PURE__ */ jsx(Typography, { className: classes.tileNote, children: "loading\u2026" });
  } else if (error) {
    body = /* @__PURE__ */ jsx(Typography, { className: classes.tileNote, children: "unavailable" });
  } else {
    body = /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("span", { className: classes.tileValue, children: current !== void 0 ? format(current) : "\u2014" }),
      /* @__PURE__ */ jsx(Sparkline, { points, color, t })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: classes.tile, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.tileHead, children: [
      /* @__PURE__ */ jsx("span", { className: classes.tileIcon, children: icon }),
      /* @__PURE__ */ jsx("span", { className: classes.tileLabel, children: label })
    ] }),
    body
  ] });
}
function MetricsPanel({
  cluster,
  namespace,
  podNames,
  title = "Performance"
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [live, setLive] = useState(false);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!live) return void 0;
    const id = setInterval(() => setNonce((n) => n + 1), POLL_MS);
    return () => clearInterval(id);
  }, [live]);
  if (podNames.length === 0) {
    return /* @__PURE__ */ jsxs("div", { className: classes.panel, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.title, children: title }),
      /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "No running pods to measure." })
    ] });
  }
  const cpuQuery = cpuUsageQuery(namespace, podNames);
  const memQuery = memoryUsageQuery(namespace, podNames);
  const rxQuery = networkRxQuery(namespace, podNames);
  const txQuery = networkTxQuery(namespace, podNames);
  const readQuery = diskReadQuery(namespace, podNames);
  const writeQuery = diskWriteQuery(namespace, podNames);
  return /* @__PURE__ */ jsxs("div", { className: classes.panel, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsxs(Typography, { className: classes.title, children: [
        title,
        " ",
        /* @__PURE__ */ jsxs("span", { style: { fontWeight: 400, color: t.textFaint }, children: [
          "\xB7 ",
          podNames.length,
          " pod",
          podNames.length === 1 ? "" : "s"
        ] })
      ] }),
      /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          className: `${classes.liveToggle} ${live ? classes.liveToggleActive : ""}`,
          onMouseDown: preventFocusScroll,
          onClick: () => setLive((v) => !v),
          children: [
            live && /* @__PURE__ */ jsx("span", { className: classes.liveDot }),
            live ? "live \xB7 20s" : "live off"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.grid, children: [
      /* @__PURE__ */ jsx(MetricTile, { icon: /* @__PURE__ */ jsx(SpeedIcon, { fontSize: "inherit" }), label: "CPU", query: cpuQuery, cluster, format: formatCores, color: t.sky, refreshNonce: nonce, classes, t }),
      /* @__PURE__ */ jsx(MetricTile, { icon: /* @__PURE__ */ jsx(MemoryIcon, { fontSize: "inherit" }), label: "Memory", query: memQuery, cluster, format: (v) => formatBytesPerSec(v).replace("/s", ""), color: t.amber, refreshNonce: nonce, classes, t }),
      /* @__PURE__ */ jsx(MetricTile, { icon: /* @__PURE__ */ jsx(ArrowDownwardIcon, { fontSize: "inherit" }), label: "Network in", query: rxQuery, cluster, format: formatBytesPerSec, color: t.good, refreshNonce: nonce, classes, t }),
      /* @__PURE__ */ jsx(MetricTile, { icon: /* @__PURE__ */ jsx(ArrowUpwardIcon, { fontSize: "inherit" }), label: "Network out", query: txQuery, cluster, format: formatBytesPerSec, color: t.good, refreshNonce: nonce, classes, t }),
      /* @__PURE__ */ jsx(MetricTile, { icon: /* @__PURE__ */ jsx(StorageIcon, { fontSize: "inherit" }), label: "Disk read", query: readQuery, cluster, format: formatBytesPerSec, color: t.textLo, refreshNonce: nonce, classes, t }),
      /* @__PURE__ */ jsx(MetricTile, { icon: /* @__PURE__ */ jsx(StorageIcon, { fontSize: "inherit" }), label: "Disk write", query: writeQuery, cluster, format: formatBytesPerSec, color: t.textLo, refreshNonce: nonce, classes, t })
    ] })
  ] });
}

export { MetricsPanel };
//# sourceMappingURL=MetricsPanel.esm.js.map
