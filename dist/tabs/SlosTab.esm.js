import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Tooltip from '@material-ui/core/Tooltip';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontMono, fontDisplay, useHangarTokens } from '../brand/tokens.esm.js';
import { RefreshButton } from '../RefreshButton.esm.js';
import { TowerEmptyState } from '../TowerEmptyState.esm.js';
import { useSlos } from '../useSlos.esm.js';
import { usePrometheusInstantQuery } from '../usePrometheusQuery.esm.js';

const useStyles = makeStyles(() => ({
  eyebrow: {
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: "0.06em",
    color: ({ t }) => t.textFaint,
    textTransform: "uppercase",
    marginBottom: 14
  },
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 14, flexWrap: "wrap" },
  envGroup: { marginBottom: 26 },
  envGroupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "7px 14px",
    borderRadius: 6,
    borderLeft: "4px solid",
    marginBottom: 12
  },
  envGroupDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  envGroupName: {
    fontFamily: fontMono,
    fontWeight: 700,
    fontSize: 13,
    textTransform: "lowercase",
    letterSpacing: "0.02em"
  },
  envGroupCount: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint, marginLeft: "auto" },
  grid: { display: "flex", flexDirection: "column", gap: 14 },
  card: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: "14px 18px"
  },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  name: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi },
  sub: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, marginTop: 2 },
  explainer: { fontSize: 13, lineHeight: 1.5, color: ({ t }) => t.textLo, margin: "2px 0 14px" },
  windowsCaption: { fontSize: 11.5, lineHeight: 1.4, color: ({ t }) => t.textFaint, margin: "2px 0 6px" },
  chip: {
    display: "inline-flex",
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: "2px 8px",
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.skyLine}`,
    backgroundColor: ({ t }) => t.skySoft,
    color: ({ t }) => t.sky
  },
  headRight: { display: "flex", alignItems: "center", gap: 8 },
  verdictChip: {
    display: "inline-flex",
    fontFamily: fontMono,
    fontSize: 10.5,
    fontWeight: 700,
    padding: "3px 9px",
    borderRadius: 3,
    border: "1px solid"
  },
  statsRow: { display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 12 },
  stat: { minWidth: 140 },
  statLabel: { fontFamily: fontMono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: ({ t }) => t.textFaint, marginBottom: 4 },
  statValue: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 22 },
  statNote: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint, marginTop: 2 },
  budgetTrack: { height: 8, borderRadius: 4, backgroundColor: ({ t }) => t.panelAlt, overflow: "hidden", marginTop: 6 },
  budgetFill: { height: "100%", borderRadius: 4 },
  // alignItems left at its 'stretch' default (not 'flex-end') - .windowBar
  // needs to actually receive this container's 60px height so its own
  // flex:1 child can resolve a real pixel height for the bar-fill's
  // percentage height to size against. 'flex-end' here would size every
  // .windowBar to its own content height instead (near-zero), silently
  // collapsing every bar to nothing regardless of real data - confirmed
  // live 2026-09-13 on checkout-api-liveness-latency: real Prometheus data
  // was arriving (verified via the actual network response), the chart
  // area was just empty.
  windows: { display: "flex", gap: 6, height: 60, marginTop: 4, marginBottom: 4 },
  windowBar: { display: "flex", flexDirection: "column", alignItems: "center", flex: "1 1 0", gap: 4 },
  windowBarFill: { width: "100%", maxWidth: 22, borderRadius: "2px 2px 0 0" },
  windowLabel: { fontFamily: fontMono, fontSize: 9, color: ({ t }) => t.textFaint },
  detailsToggle: { background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.sky, marginTop: 4 },
  query: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint, backgroundColor: ({ t }) => t.panelAlt, padding: "6px 8px", borderRadius: 4, marginTop: 8, overflowX: "auto", whiteSpace: "pre" },
  note: { fontSize: 12, fontStyle: "italic", color: ({ t }) => t.textLo }
}));
const WINDOWS = ["5m", "30m", "1h", "2h", "6h", "1d", "3d", "30d"];
const ENV_GROUP_PALETTE = [
  { light: { fg: "#6E5FA8", bg: "#EAE6F6" }, dark: { fg: "#B3A6E0", bg: "#292140" } },
  // violet
  { light: { fg: "#B0466E", bg: "#F7E3EC" }, dark: { fg: "#E08FB0", bg: "#3A1B29" } },
  // rose
  { light: { fg: "#1E7F91", bg: "#DCEEF1" }, dark: { fg: "#6FC7D6", bg: "#16323A" } },
  // teal
  { light: { fg: "#7A7A1F", bg: "#F1F1D6" }, dark: { fg: "#C9C96B", bg: "#2E2E12" } },
  // olive
  { light: { fg: "#4C5FA6", bg: "#E4E7F7" }, dark: { fg: "#96A8E3", bg: "#1C2140" } },
  // indigo
  { light: { fg: "#B25A2E", bg: "#F6E6DA" }, dark: { fg: "#E29A6F", bg: "#3A2416" } }
  // terracotta
];
const UNKNOWN_ENV_KEY = "(no environment)";
const UNKNOWN_ENV_ACCENT = {
  light: { fg: "#5B6570", bg: "#E8ECEF" },
  dark: { fg: "#96A2AC", bg: "#1A1F26" }
};
function envAccentFor(env, envOrder, isDark) {
  if (env === UNKNOWN_ENV_KEY) return isDark ? UNKNOWN_ENV_ACCENT.dark : UNKNOWN_ENV_ACCENT.light;
  const idx = Math.max(0, envOrder.indexOf(env));
  const palette = ENV_GROUP_PALETTE[idx % ENV_GROUP_PALETTE.length];
  return isDark ? palette.dark : palette.light;
}
function selectorFor(slo) {
  return `sloth_service="${slo.service}",sloth_slo="${slo.name}_${slo.namespace}"`;
}
function metaValue(samples, metric) {
  return samples.find((s) => s.metric.__name__ === metric)?.value;
}
function burnRateTone(t, rate) {
  if (rate === void 0) return t.textFaint;
  if (rate > 2) return t.bad;
  if (rate > 1) return t.amberInk;
  return t.good;
}
function budgetTone(t, remaining) {
  if (remaining === void 0) return t.textFaint;
  if (remaining < 0.2) return t.bad;
  if (remaining < 0.5) return t.amberInk;
  return t.good;
}
function verdictTone(t, meeting) {
  if (meeting === void 0) return { bg: t.panelAlt, border: t.line, fg: t.textFaint };
  return meeting ? { bg: t.goodSoft, border: t.good, fg: t.good } : { bg: t.badSoft, border: t.bad, fg: t.bad };
}
function humanSummary(slo, currentSli, meetingObjective, periodDays) {
  if (currentSli === void 0) return "";
  const probeMatch = slo.indicator.totalFilter.match(/probe_type="(\w+)"/);
  const subject = probeMatch ? `${slo.service}'s ${probeMatch[1].toLowerCase()} probe` : `${slo.service}'s ${slo.indicator.metric}`;
  let verb;
  if (slo.indicator.type === "latency" && slo.indicator.latencyThreshold) {
    const seconds = Number(slo.indicator.latencyThreshold);
    const thresholdText = seconds < 1 ? `${Math.round(seconds * 1e3)}ms` : `${seconds}s`;
    verb = `responded within ${thresholdText}`;
  } else {
    verb = "succeeded";
  }
  const period = periodDays !== void 0 ? ` over the last ${periodDays} days` : "";
  let verdict = "";
  if (meetingObjective === true) verdict = ` \u2014 comfortably inside the ${slo.objective}% target.`;
  else if (meetingObjective === false) {
    verdict = ` \u2014 short of the ${slo.objective}% target, so this SLO is breaching its objective and burning through its error budget.`;
  }
  return `${currentSli.toFixed(1)}% of ${subject} checks${period} ${verb}${verdict}`;
}
function windowTooltip(window, ratio, errorBudgetRatio) {
  if (ratio === void 0) return `${window}: no data for this window yet`;
  const pct = (ratio * 100).toFixed(3);
  if (errorBudgetRatio === void 0) return `${window}: ${pct}% of checks were bad in this window`;
  const budgetPct = (errorBudgetRatio * 100).toFixed(2);
  const verdict = ratio > errorBudgetRatio ? "over" : "within";
  return `${window}: ${pct}% of checks were bad in this window - ${verdict} the ${budgetPct}% budget this objective allows`;
}
function SloCard({
  slo,
  refreshNonce,
  accentColor
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [showDetails, setShowDetails] = useState(false);
  const selector = selectorFor(slo);
  const meta = usePrometheusInstantQuery(
    slo.cluster,
    // time_period (not time_period_days) - the real recording rule is named
    // slo:time_period:days (confirmed live 2026-09-14: the underscore
    // version never matched anything, silently leaving periodDays
    // undefined on every SLO card - masked on the working one since it only
    // blanks a small caption, not the core numbers).
    `{__name__=~"slo:(objective|current_burn_rate|period_burn_rate|period_error_budget_remaining|time_period):.+",${selector}}`,
    refreshNonce
  );
  const windowed = usePrometheusInstantQuery(
    slo.cluster,
    `{__name__=~"slo:sli_error:ratio_rate.+",${selector}}`,
    refreshNonce
  );
  const objectiveRatio = metaValue(meta.samples, "slo:objective:ratio");
  const currentBurnRate = metaValue(meta.samples, "slo:current_burn_rate:ratio");
  const periodBurnRate = metaValue(meta.samples, "slo:period_burn_rate:ratio");
  const budgetRemaining = metaValue(meta.samples, "slo:period_error_budget_remaining:ratio");
  const periodDays = metaValue(meta.samples, "slo:time_period:days");
  const errorBudgetRatio = objectiveRatio !== void 0 ? 1 - objectiveRatio : void 0;
  const windowValues = new Map(
    windowed.samples.map((s) => [s.metric.sloth_window, s.value])
  );
  const maxWindowValue = Math.max(1e-4, ...WINDOWS.map((w) => windowValues.get(w) ?? 0));
  const periodErrorRatio = periodBurnRate !== void 0 && errorBudgetRatio !== void 0 ? periodBurnRate * errorBudgetRatio : void 0;
  const currentSli = periodErrorRatio !== void 0 ? (1 - periodErrorRatio) * 100 : void 0;
  const meetingObjective = periodBurnRate !== void 0 ? periodBurnRate <= 1 : void 0;
  const summary = humanSummary(slo, currentSli, meetingObjective, periodDays);
  const loading = meta.loading || windowed.loading;
  const anyError = meta.error ?? windowed.error;
  const noDataYet = !loading && !anyError && meta.samples.length === 0;
  return /* @__PURE__ */ jsxs("div", { className: classes.card, style: { borderLeftColor: accentColor }, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx(Typography, { className: classes.name, children: slo.name }),
        /* @__PURE__ */ jsxs(Typography, { className: classes.sub, children: [
          "service=",
          slo.service,
          " \xB7 ",
          slo.cluster,
          slo.environmentRefName ? ` \xB7 ${slo.environmentRefName}` : ""
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.headRight, children: [
        meetingObjective !== void 0 && /* @__PURE__ */ jsx(
          "span",
          {
            className: classes.verdictChip,
            style: {
              backgroundColor: verdictTone(t, meetingObjective).bg,
              borderColor: verdictTone(t, meetingObjective).border,
              color: verdictTone(t, meetingObjective).fg
            },
            children: meetingObjective ? "meeting objective" : "breaching objective"
          }
        ),
        /* @__PURE__ */ jsx("span", { className: classes.chip, children: slo.indicator.type })
      ] })
    ] }),
    loading && meta.samples.length === 0 && /* @__PURE__ */ jsx(Progress, {}),
    anyError && /* @__PURE__ */ jsxs(Typography, { className: classes.note, children: [
      "Couldn't query Prometheus: ",
      anyError
    ] }),
    noDataYet && /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "No burn-rate data yet - Sloth's generated recording rules may not have loaded into Prometheus yet (this can lag several minutes after an SLO is first created)." }),
    !noDataYet && !anyError && /* @__PURE__ */ jsxs(Fragment, { children: [
      summary && /* @__PURE__ */ jsx(Typography, { className: classes.explainer, children: summary }),
      /* @__PURE__ */ jsxs("div", { className: classes.statsRow, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.stat, children: [
          /* @__PURE__ */ jsx("div", { className: classes.statLabel, children: "Current SLI" }),
          /* @__PURE__ */ jsx("div", { className: classes.statValue, style: { color: verdictTone(t, meetingObjective).fg }, children: currentSli !== void 0 ? `${currentSli.toFixed(3)}%` : "\u2014" }),
          /* @__PURE__ */ jsx("div", { className: classes.statNote, children: periodDays !== void 0 ? `over the last ${periodDays}d` : " " })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.stat, children: [
          /* @__PURE__ */ jsx("div", { className: classes.statLabel, children: "Objective" }),
          /* @__PURE__ */ jsxs("div", { className: classes.statValue, style: { color: t.textHi }, children: [
            slo.objective,
            "%"
          ] }),
          periodDays !== void 0 && /* @__PURE__ */ jsxs("div", { className: classes.statNote, children: [
            periodDays,
            "d compliance window"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.stat, children: [
          /* @__PURE__ */ jsx("div", { className: classes.statLabel, children: "Current burn rate" }),
          /* @__PURE__ */ jsx("div", { className: classes.statValue, style: { color: burnRateTone(t, currentBurnRate) }, children: currentBurnRate !== void 0 ? `${currentBurnRate.toFixed(2)}\xD7` : "\u2014" }),
          /* @__PURE__ */ jsx("div", { className: classes.statNote, children: periodBurnRate !== void 0 ? `${periodBurnRate.toFixed(2)}\xD7 over full period` : " " })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.stat, style: { flex: "1 1 220px" }, children: [
          /* @__PURE__ */ jsx("div", { className: classes.statLabel, children: "Error budget remaining" }),
          /* @__PURE__ */ jsx("div", { className: classes.statValue, style: { color: budgetTone(t, budgetRemaining) }, children: budgetRemaining !== void 0 ? `${(budgetRemaining * 100).toFixed(1)}%` : "\u2014" }),
          /* @__PURE__ */ jsx("div", { className: classes.budgetTrack, children: /* @__PURE__ */ jsx(
            "div",
            {
              className: classes.budgetFill,
              style: {
                width: `${Math.max(0, Math.min(100, (budgetRemaining ?? 0) * 100))}%`,
                backgroundColor: budgetTone(t, budgetRemaining)
              }
            }
          ) })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: classes.statLabel, children: "SLI error ratio by window" }),
      /* @__PURE__ */ jsx(Typography, { className: classes.windowsCaption, children: "Each bar is the share of checks that were bad within that trailing window alone (not the 30-day figure above) - red means that window's own error rate already exceeds the budget. Hover a bar for the exact number." }),
      /* @__PURE__ */ jsx("div", { className: classes.windows, children: WINDOWS.map((w) => {
        const v = windowValues.get(w);
        const heightPct = v !== void 0 ? Math.max(2, v / maxWindowValue * 100) : 0;
        const overBudget = errorBudgetRatio !== void 0 && v !== void 0 && v > errorBudgetRatio;
        let barColor = t.sky;
        if (v === void 0) barColor = t.lineSoft;
        else if (overBudget) barColor = t.bad;
        return /* @__PURE__ */ jsx(Tooltip, { title: windowTooltip(w, v, errorBudgetRatio), arrow: true, children: /* @__PURE__ */ jsxs("div", { className: classes.windowBar, children: [
          /* @__PURE__ */ jsx("div", { style: { flex: 1, display: "flex", alignItems: "flex-end", width: "100%", justifyContent: "center" }, children: /* @__PURE__ */ jsx(
            "div",
            {
              className: classes.windowBarFill,
              style: {
                height: `${heightPct}%`,
                backgroundColor: barColor
              }
            }
          ) }),
          /* @__PURE__ */ jsx("span", { className: classes.windowLabel, children: w })
        ] }) }, w);
      }) }),
      /* @__PURE__ */ jsxs("button", { type: "button", className: classes.detailsToggle, onClick: () => setShowDetails((s) => !s), children: [
        showDetails ? "hide" : "show",
        " indicator definition"
      ] }),
      showDetails && /* @__PURE__ */ jsxs("div", { className: classes.query, children: [
        "metric: ",
        slo.indicator.metric,
        "\n",
        "totalFilter: ",
        slo.indicator.totalFilter,
        slo.indicator.errorFilter ? `
errorFilter: ${slo.indicator.errorFilter}` : "",
        slo.indicator.latencyThreshold ? `
latencyThreshold: ${slo.indicator.latencyThreshold}s` : ""
      ] })
    ] })
  ] });
}
function SlosTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const isDark = useTheme().palette.type === "dark";
  const { slos, loading, refreshing, error } = useSlos();
  const [refreshNonce, setRefreshNonce] = useState(0);
  if (loading) return /* @__PURE__ */ jsx(Progress, {});
  if (error) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(error) });
  if (slos.length === 0) {
    return /* @__PURE__ */ jsx(
      TowerEmptyState,
      {
        title: "No SLOs declared",
        description: "Add an `slos:` entry to this app's gitops values.yaml (airframe's slos.catalog.idp.io XRD) to get burn-rate views here. There is currently no in-Tower way to author one - see this app's Config tab for what is and isn't editable there yet."
      }
    );
  }
  const envOrder = Array.from(new Set(slos.map((s) => s.env ?? UNKNOWN_ENV_KEY))).sort();
  const groups = envOrder.map((env) => ({
    env,
    slos: slos.filter((s) => (s.env ?? UNKNOWN_ENV_KEY) === env)
  }));
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: classes.toolbar, children: [
      /* @__PURE__ */ jsxs(Typography, { className: classes.eyebrow, children: [
        slos.length,
        " SLO",
        slos.length === 1 ? "" : "s",
        " across ",
        envOrder.length,
        " environment",
        envOrder.length === 1 ? "" : "s",
        refreshing ? " \xB7 refreshing\u2026" : ""
      ] }),
      /* @__PURE__ */ jsx(RefreshButton, { onClick: () => setRefreshNonce((n) => n + 1) })
    ] }),
    groups.map((group) => {
      const accent = envAccentFor(group.env, envOrder, isDark);
      return /* @__PURE__ */ jsxs("div", { className: classes.envGroup, children: [
        /* @__PURE__ */ jsxs(
          "div",
          {
            className: classes.envGroupHeader,
            style: { borderLeftColor: accent.fg, backgroundColor: accent.bg },
            children: [
              /* @__PURE__ */ jsx("span", { className: classes.envGroupDot, style: { backgroundColor: accent.fg } }),
              /* @__PURE__ */ jsx("span", { className: classes.envGroupName, style: { color: accent.fg }, children: group.env }),
              /* @__PURE__ */ jsxs("span", { className: classes.envGroupCount, children: [
                group.slos.length,
                " SLO",
                group.slos.length === 1 ? "" : "s"
              ] })
            ]
          }
        ),
        /* @__PURE__ */ jsx("div", { className: classes.grid, children: group.slos.map((slo) => /* @__PURE__ */ jsx(
          SloCard,
          {
            slo,
            refreshNonce,
            accentColor: accent.fg
          },
          `${slo.cluster}/${slo.namespace}/${slo.name}`
        )) })
      ] }, group.env);
    })
  ] });
}

export { SlosTab };
//# sourceMappingURL=SlosTab.esm.js.map
