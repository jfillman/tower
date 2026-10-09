import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useMemo } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { Progress } from '@backstage/core-components';
import { fontMono, fontDisplay, useHangarTokens } from '../../brand/tokens.esm.js';
import { relativeTime } from '../../shared/format.esm.js';
import { useFleetRoster } from '../../useFleetRoster.esm.js';
import { useFleetEnvironments, fleetEnvColumns } from '../../useFleetEnvironments.esm.js';
import { useFleetSlos } from '../../useFleetSlos.esm.js';
import { health, isRolloutActive, imageTag } from '../../types.esm.js';
import { tileStatus, worstStatus, latestEnv, healthLabel, healthColor } from './dashboardStyles.esm.js';

const useStyles = makeStyles(() => ({
  kpis: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 22
  },
  kpi: {
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6,
    padding: "14px 18px",
    backgroundColor: ({ t }) => t.panel
  },
  kpiLabel: {
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: ({ t }) => t.textFaint,
    marginBottom: 6
  },
  kpiValue: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 32, color: ({ t }) => t.textHi, lineHeight: 1 },
  kpiSub: { fontSize: 11.5, color: ({ t }) => t.textLo, marginTop: 4 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 16
  },
  tile: {
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6,
    padding: "16px 18px",
    backgroundColor: ({ t }) => t.panel,
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  tileHead: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, minWidth: 0 },
  appName: {
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 16,
    color: ({ t }) => t.textHi,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  owner: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint, flexShrink: 0 },
  stage: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  dot: { width: 12, height: 12, borderRadius: "50%" },
  stageLabel: { fontFamily: fontMono, fontSize: 9, color: ({ t }) => t.textFaint, textTransform: "uppercase" },
  statusLine: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: ({ t }) => t.textLo },
  statusDot: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },
  foot: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTop: ({ t }) => `1px solid ${t.lineSoft}`
  },
  tag: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textLo },
  empty: { padding: 48, textAlign: "center", color: ({ t }) => t.textLo, fontSize: 13 }
}));
function FleetGridDashboard() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const roster = useFleetRoster();
  const { apps, loading: appsLoading, probes } = useFleetEnvironments(roster.entities);
  const columns = useMemo(() => fleetEnvColumns(apps), [apps]);
  const allEnvs = useMemo(() => apps.flatMap((a) => a.environments), [apps]);
  const totalEnvs = allEnvs.length;
  const healthyEnvs = allEnvs.filter((e) => health(e) === "healthy").length;
  const activeRollouts = allEnvs.filter(isRolloutActive).length;
  const clusters = useMemo(() => [...new Set(allEnvs.map((e) => e.cluster))], [allEnvs]);
  const { summary: sloSummary, probes: sloProbes } = useFleetSlos(clusters);
  const loading = roster.loading || appsLoading;
  return /* @__PURE__ */ jsxs("div", { children: [
    probes,
    sloProbes,
    loading && /* @__PURE__ */ jsx(Progress, {}),
    !loading && apps.length === 0 && /* @__PURE__ */ jsx("div", { className: classes.empty, children: "No NodeJSApplication / SpringBootApplication / PythonApplication / GoApplication services found in the catalog." }),
    !loading && apps.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: classes.kpis, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.kpi, children: [
          /* @__PURE__ */ jsx("div", { className: classes.kpiLabel, children: "Services monitored" }),
          /* @__PURE__ */ jsx("div", { className: classes.kpiValue, children: apps.length })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.kpi, children: [
          /* @__PURE__ */ jsx("div", { className: classes.kpiLabel, children: "Environments healthy" }),
          /* @__PURE__ */ jsxs("div", { className: classes.kpiValue, style: { color: healthyEnvs === totalEnvs ? t.good : t.amber }, children: [
            totalEnvs ? Math.round(healthyEnvs / totalEnvs * 100) : 0,
            "%"
          ] }),
          /* @__PURE__ */ jsxs("div", { className: classes.kpiSub, children: [
            healthyEnvs,
            " / ",
            totalEnvs,
            " environments"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.kpi, children: [
          /* @__PURE__ */ jsx("div", { className: classes.kpiLabel, children: "Active rollouts" }),
          /* @__PURE__ */ jsx("div", { className: classes.kpiValue, children: activeRollouts }),
          /* @__PURE__ */ jsx("div", { className: classes.kpiSub, children: "promoting right now" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.kpi, children: [
          /* @__PURE__ */ jsx("div", { className: classes.kpiLabel, children: "SLO compliance" }),
          /* @__PURE__ */ jsx("div", { className: classes.kpiValue, children: sloSummary.total ? `${Math.round(sloSummary.meetingObjective / sloSummary.total * 100)}%` : "\u2014" }),
          /* @__PURE__ */ jsx("div", { className: classes.kpiSub, children: sloSummary.total ? `${sloSummary.meetingObjective}/${sloSummary.total} SLOs meeting objective${sloSummary.errorBudgetRemainingPct !== void 0 ? ` \xB7 ${Math.round(sloSummary.errorBudgetRemainingPct)}% error budget remaining` : ""}` : "no SLOs found" })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: classes.grid, children: apps.map((app) => {
        const statuses = columns.map((col) => tileStatus(app, col));
        const worst = worstStatus(statuses);
        const latest = latestEnv(app);
        return /* @__PURE__ */ jsxs("div", { className: classes.tile, children: [
          /* @__PURE__ */ jsxs("div", { className: classes.tileHead, children: [
            /* @__PURE__ */ jsx(Typography, { className: classes.appName, title: app.appName, children: app.appName }),
            app.owner && /* @__PURE__ */ jsxs(Typography, { className: classes.owner, children: [
              "@",
              app.owner
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { style: { display: "grid", gridTemplateColumns: `repeat(${columns.length || 1}, 1fr)`, gap: 4 }, children: columns.map((col) => {
            const status = tileStatus(app, col);
            return /* @__PURE__ */ jsxs("div", { className: classes.stage, children: [
              /* @__PURE__ */ jsx(
                "span",
                {
                  className: classes.dot,
                  style: { backgroundColor: healthColor(t, status) },
                  title: `${col}: ${healthLabel(status)}`
                }
              ),
              /* @__PURE__ */ jsx("span", { className: classes.stageLabel, children: col })
            ] }, col);
          }) }),
          /* @__PURE__ */ jsxs("div", { className: classes.statusLine, children: [
            /* @__PURE__ */ jsx("span", { className: classes.statusDot, style: { backgroundColor: healthColor(t, worst) } }),
            worst === "none" ? "not yet deployed" : `${latest ? `${latest.env} ` : ""}${healthLabel(worst)}`
          ] }),
          /* @__PURE__ */ jsxs("div", { className: classes.foot, children: [
            /* @__PURE__ */ jsx("span", { className: classes.tag, children: latest?.image ? imageTag(latest.image) : "\u2014" }),
            /* @__PURE__ */ jsx("span", { className: classes.tag, children: latest?.deployedAt ? relativeTime(latest.deployedAt) : "\u2014" })
          ] })
        ] }, app.entityRef);
      }) })
    ] })
  ] });
}

export { FleetGridDashboard };
//# sourceMappingURL=FleetGridDashboard.esm.js.map
