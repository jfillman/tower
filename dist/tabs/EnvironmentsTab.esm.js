import { jsx, jsxs } from 'react/jsx-runtime';
import { useMemo } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontMono, fontDisplay, useHangarTokens } from '../brand/tokens.esm.js';
import { buildEnvironmentRows } from '../environmentRows.esm.js';
import { relativeTime, formatDateTime } from '../shared/format.esm.js';
import { useReleaseContext } from '../useReleaseContext.esm.js';

const HEALTH_LABEL = {
  healthy: "Healthy",
  progressing: "Progressing",
  paused: "Paused",
  degraded: "Degraded",
  unknown: "Unknown"
};
const useStyles = makeStyles(() => ({
  wrap: { padding: "20px 24px 40px", maxWidth: 1180 },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 20, color: ({ t }) => t.textHi },
  sub: { fontSize: 13, color: ({ t }) => t.textLo, marginTop: 2, marginBottom: 12 },
  note: {
    fontSize: 12.5,
    color: ({ t }) => t.textLo,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    borderRadius: 6,
    padding: "9px 12px",
    marginBottom: 14
  },
  empty: {
    border: ({ t }) => `1px dashed ${t.line}`,
    borderRadius: 6,
    padding: 24,
    color: ({ t }) => t.textLo,
    textAlign: "center"
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
  th: {
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: ({ t }) => t.textFaint,
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: ({ t }) => `1px solid ${t.line}`
  },
  td: {
    padding: "11px 10px",
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    color: ({ t }) => t.textHi,
    verticalAlign: "middle"
  },
  name: { fontFamily: fontDisplay, fontWeight: 600, fontSize: 15 },
  mono: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo },
  muted: { color: ({ t }) => t.textFaint },
  chip: {
    display: "inline-block",
    fontFamily: fontMono,
    fontSize: 11,
    padding: "3px 7px",
    borderRadius: 4,
    border: "1px solid"
  },
  ground: { color: ({ t }) => t.sky, borderColor: ({ t }) => t.skyLine },
  flight: { color: ({ t }) => t.amber, borderColor: ({ t }) => t.amberLine },
  health: { display: "inline-flex", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, display: "inline-block" }
}));
function dotColor(h, t) {
  switch (h) {
    case "healthy":
      return t.good;
    case "degraded":
      return t.bad;
    case "progressing":
      return t.sky;
    case "paused":
      return t.amber;
    default:
      return t.textFaint;
  }
}
function EnvironmentsTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { environments, pipelineOrder, loading, error } = useReleaseContext();
  const rows = useMemo(
    () => buildEnvironmentRows(environments, { lower: pipelineOrder.lower, upper: pipelineOrder.upper }),
    [environments, pipelineOrder.lower, pipelineOrder.upper]
  );
  if (loading && rows.length === 0) return /* @__PURE__ */ jsx(Progress, {});
  if (error && rows.length === 0) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(String(error)) });
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Environments" }),
    /* @__PURE__ */ jsx("div", { className: classes.sub, children: "Every environment of this service, in promotion order." }),
    /* @__PURE__ */ jsx("div", { className: classes.note, children: "Read-only for now. Change the list and its order in the Glidepath tab; Flight environment values are in App Configuration. Editing from here comes next." }),
    rows.length === 0 ? /* @__PURE__ */ jsx("div", { className: classes.empty, children: "No environments yet. They appear here once the service declares or deploys to one." }) : /* @__PURE__ */ jsxs("table", { className: classes.table, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", { children: ["Environment", "Tier", "Target", "Where", "Health", "Live image", "Deployed"].map((h) => /* @__PURE__ */ jsx("th", { className: classes.th, children: h }, h)) }) }),
      /* @__PURE__ */ jsx("tbody", { children: rows.map((r) => /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("td", { className: `${classes.td} ${classes.name}`, children: r.name }),
        /* @__PURE__ */ jsx("td", { className: classes.td, children: /* @__PURE__ */ jsx("span", { className: `${classes.chip} ${r.tier === "flight" ? classes.flight : classes.ground}`, children: r.tier === "flight" ? "Flight" : "Ground" }) }),
        /* @__PURE__ */ jsx("td", { className: classes.td, children: r.target }),
        /* @__PURE__ */ jsx("td", { className: `${classes.td} ${classes.mono}`, children: r.where }),
        /* @__PURE__ */ jsx("td", { className: classes.td, children: /* @__PURE__ */ jsxs("span", { className: classes.health, children: [
          /* @__PURE__ */ jsx("i", { className: classes.dot, style: { backgroundColor: dotColor(r.health, t) }, "aria-hidden": "true" }),
          HEALTH_LABEL[r.health]
        ] }) }),
        /* @__PURE__ */ jsx("td", { className: `${classes.td} ${classes.mono}`, children: r.deployed ? r.image : /* @__PURE__ */ jsx("span", { className: classes.muted, children: "not deployed yet" }) }),
        /* @__PURE__ */ jsx("td", { className: classes.td, title: r.deployedAt ? formatDateTime(r.deployedAt) : void 0, children: r.deployedAt ? relativeTime(r.deployedAt) : /* @__PURE__ */ jsx("span", { className: classes.muted, children: "\u2014" }) })
      ] }, r.name)) })
    ] })
  ] });
}

export { EnvironmentsTab };
//# sourceMappingURL=EnvironmentsTab.esm.js.map
