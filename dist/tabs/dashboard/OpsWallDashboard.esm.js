import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useMemo } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { Progress } from '@backstage/core-components';
import { fontMono, fontDisplay, useHangarTokens } from '../../brand/tokens.esm.js';
import { relativeTime } from '../../shared/format.esm.js';
import { useFleetRoster } from '../../useFleetRoster.esm.js';
import { useFleetEnvironments } from '../../useFleetEnvironments.esm.js';
import { useFleetSlos } from '../../useFleetSlos.esm.js';
import { health, isRolloutActive, imageTag } from '../../types.esm.js';
import { worstStatus, latestEnv, healthColor, healthLabel } from './dashboardStyles.esm.js';

const useStyles = makeStyles(() => ({
  kpis: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
    marginBottom: 24
  },
  kpi: {
    border: ({ t }) => `1px solid ${t.line}`,
    borderTop: "3px solid",
    borderRadius: 6,
    padding: "20px 22px",
    backgroundColor: ({ t }) => t.panel
  },
  kpiLabel: {
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: ({ t }) => t.textFaint,
    marginBottom: 8
  },
  kpiValue: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 56, lineHeight: 1 },
  kpiSub: { fontSize: 12.5, color: ({ t }) => t.textLo, marginTop: 8 },
  table: {
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6,
    backgroundColor: ({ t }) => t.panel,
    overflow: "hidden"
  },
  row: {
    display: "grid",
    gridTemplateColumns: "2fr 1.6fr 1.1fr 1fr 1.3fr",
    alignItems: "center",
    gap: 12,
    padding: "10px 20px",
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    "&:last-child": { borderBottom: "none" }
  },
  head: {
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: ({ t }) => t.textFaint,
    backgroundColor: ({ t }) => t.panelAlt
  },
  appName: { fontFamily: fontDisplay, fontWeight: 600, fontSize: 14.5, color: ({ t }) => t.textHi },
  status: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: ({ t }) => t.textLo },
  statusDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  mono: { fontFamily: fontMono, fontSize: 12.5, color: ({ t }) => t.textLo },
  ownerCell: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textFaint, textAlign: "right" },
  empty: { padding: 48, textAlign: "center", color: ({ t }) => t.textLo, fontSize: 13 }
}));
function OpsWallDashboard() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const roster = useFleetRoster();
  const { apps, loading: appsLoading, probes } = useFleetEnvironments(roster.entities);
  const allEnvs = useMemo(() => apps.flatMap((a) => a.environments), [apps]);
  const totalEnvs = allEnvs.length;
  const degradedEnvs = allEnvs.filter((e) => health(e) === "degraded").length;
  const activeRollouts = allEnvs.filter(isRolloutActive).length;
  const clusters = useMemo(() => [...new Set(allEnvs.map((e) => e.cluster))], [allEnvs]);
  const { summary: sloSummary, probes: sloProbes } = useFleetSlos(clusters);
  const loading = roster.loading || appsLoading;
  const rows = useMemo(
    () => [...apps].sort((a, b) => a.appName.localeCompare(b.appName)),
    [apps]
  );
  return /* @__PURE__ */ jsxs("div", { children: [
    probes,
    sloProbes,
    loading ? /* @__PURE__ */ jsx(Progress, {}) : apps.length === 0 ? /* @__PURE__ */ jsx("div", { className: classes.empty, children: "No NodeJSApplication / SpringBootApplication / PythonApplication / GoApplication services found in the catalog." }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: classes.kpis, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.kpi, style: { borderTopColor: t.sky }, children: [
          /* @__PURE__ */ jsx("div", { className: classes.kpiLabel, children: "Services monitored" }),
          /* @__PURE__ */ jsx("div", { className: classes.kpiValue, style: { color: t.sky }, children: apps.length }),
          /* @__PURE__ */ jsxs("div", { className: classes.kpiSub, children: [
            "across ",
            clusters.length || 1,
            " cluster",
            clusters.length === 1 ? "" : "s"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.kpi, style: { borderTopColor: degradedEnvs > 0 ? t.bad : t.good }, children: [
          /* @__PURE__ */ jsx("div", { className: classes.kpiLabel, children: "Environments degraded" }),
          /* @__PURE__ */ jsx("div", { className: classes.kpiValue, style: { color: degradedEnvs > 0 ? t.bad : t.good }, children: degradedEnvs }),
          /* @__PURE__ */ jsxs("div", { className: classes.kpiSub, children: [
            "of ",
            totalEnvs,
            " total environments"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.kpi, style: { borderTopColor: t.amber }, children: [
          /* @__PURE__ */ jsx("div", { className: classes.kpiLabel, children: "Active rollouts" }),
          /* @__PURE__ */ jsx("div", { className: classes.kpiValue, style: { color: t.amber }, children: activeRollouts }),
          /* @__PURE__ */ jsx("div", { className: classes.kpiSub, children: "promoting right now" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.kpi, style: { borderTopColor: t.good }, children: [
          /* @__PURE__ */ jsx("div", { className: classes.kpiLabel, children: "SLO compliance" }),
          /* @__PURE__ */ jsx("div", { className: classes.kpiValue, style: { color: t.good }, children: sloSummary.total ? `${Math.round(sloSummary.meetingObjective / sloSummary.total * 100)}%` : "\u2014" }),
          /* @__PURE__ */ jsx("div", { className: classes.kpiSub, children: sloSummary.total ? `${sloSummary.meetingObjective}/${sloSummary.total} SLOs${sloSummary.errorBudgetRemainingPct !== void 0 ? ` \xB7 ${Math.round(sloSummary.errorBudgetRemainingPct)}% budget remaining` : ""}` : "no SLOs found" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.table, children: [
        /* @__PURE__ */ jsxs("div", { className: `${classes.row} ${classes.head}`, children: [
          /* @__PURE__ */ jsx("span", { children: "Service" }),
          /* @__PURE__ */ jsx("span", { children: "Status" }),
          /* @__PURE__ */ jsx("span", { children: "Tag" }),
          /* @__PURE__ */ jsx("span", { children: "Updated" }),
          /* @__PURE__ */ jsx("span", { style: { textAlign: "right" }, children: "Owner" })
        ] }),
        rows.map((app) => {
          const worst = worstStatus(app.environments.map(health));
          const latest = latestEnv(app);
          return /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
            /* @__PURE__ */ jsx(Typography, { className: classes.appName, children: app.appName }),
            /* @__PURE__ */ jsxs("span", { className: classes.status, children: [
              /* @__PURE__ */ jsx("span", { className: classes.statusDot, style: { backgroundColor: healthColor(t, worst) } }),
              latest ? `${latest.env} ${healthLabel(worst)}` : "not yet deployed"
            ] }),
            /* @__PURE__ */ jsx("span", { className: classes.mono, children: latest?.image ? imageTag(latest.image) : "\u2014" }),
            /* @__PURE__ */ jsx("span", { className: classes.mono, children: latest?.deployedAt ? relativeTime(latest.deployedAt) : "\u2014" }),
            /* @__PURE__ */ jsx("span", { className: classes.ownerCell, children: app.owner ? `@${app.owner}` : "" })
          ] }, app.entityRef);
        })
      ] })
    ] })
  ] });
}

export { OpsWallDashboard };
//# sourceMappingURL=OpsWallDashboard.esm.js.map
