import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { formatDateTime, STALE_THRESHOLD_MS, relativeTime } from './shared/format.esm.js';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { imageTag, extractShortShaFromImageTag } from './types.esm.js';
import { useRepoHead } from './useReleaseData.esm.js';
import { gitopsPrForEnvAndImage } from './useReleaseContext.esm.js';

const TIMELINE_TAG_PALETTE_LIGHT = [
  "#3366CC",
  "#DC3912",
  "#109618",
  "#FF9900",
  "#990099",
  "#0099C6",
  "#DD4477",
  "#66AA00",
  "#B82E2E",
  "#316395"
];
const TIMELINE_TAG_PALETTE_DARK = [
  "#7FA8FF",
  "#FF8A80",
  "#69F0AE",
  "#FFC46B",
  "#E191E1",
  "#6FE3FF",
  "#FF8FC2",
  "#B2E673",
  "#FF9E9E",
  "#8FB8E0"
];
function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = hash * 31 + value.charCodeAt(i) >>> 0;
  }
  return hash;
}
function colorForTag(tag, isDark) {
  const palette = isDark ? TIMELINE_TAG_PALETTE_DARK : TIMELINE_TAG_PALETTE_LIGHT;
  return palette[hashString(tag) % palette.length];
}
function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "\u2014";
  const mins = Math.floor(ms / 6e4);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
const useStyles = makeStyles(() => ({
  card: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    padding: "16px 20px",
    marginBottom: 20
  },
  headRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi },
  range: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint },
  row: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 },
  // 2026-09-15 feedback: env names are always lowercase at the Kubernetes
  // level (DNS-1123) - capitalizing/uppercasing them for display (this and
  // leadEnv below) invented a form the real resource doesn't have.
  rowLabel: { width: 84, flexShrink: 0, fontFamily: fontMono, fontSize: 11, textTransform: "lowercase", color: ({ t }) => t.textLo },
  track: {
    position: "relative",
    flex: 1,
    height: 20,
    borderRadius: 3,
    backgroundColor: ({ t }) => t.panelAlt
  },
  seg: {
    position: "absolute",
    top: 0,
    height: "100%",
    borderRadius: 3,
    display: "flex",
    alignItems: "center",
    paddingLeft: 6,
    fontFamily: fontMono,
    fontSize: 9.5,
    overflow: "hidden",
    whiteSpace: "nowrap",
    border: "1px solid transparent"
  },
  segStale: {
    borderStyle: "dashed"
  },
  emptyTrack: {
    fontFamily: fontMono,
    fontSize: 10.5,
    fontStyle: "italic",
    color: ({ t }) => t.textFaint,
    display: "flex",
    alignItems: "center",
    height: "100%",
    paddingLeft: 8
  },
  legend: { display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12 },
  legendItem: { display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: ({ t }) => t.textFaint },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  swatchStale: { backgroundColor: "transparent", border: "2px dashed" },
  note: { fontSize: 12.5, fontStyle: "italic", color: ({ t }) => t.textLo },
  leadGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 },
  leadCard: {
    backgroundColor: ({ t }) => t.panelAlt,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    borderRadius: 5,
    padding: "12px 14px"
  },
  leadEnv: { fontFamily: fontMono, fontSize: 10.5, textTransform: "lowercase", letterSpacing: "0.04em", color: ({ t }) => t.textFaint, marginBottom: 6 },
  leadValue: { fontFamily: fontMono, fontSize: 22, fontWeight: 600 },
  leadCaption: { fontSize: 11, color: ({ t }) => t.textFaint, marginTop: 4 }
}));
function ReleaseTimelinePanel({
  environments,
  history
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  const recentHistory = {};
  environments.forEach((e) => {
    recentHistory[e.env] = (history[e.env] ?? []).slice(-10);
  });
  const withHistory = environments.filter((e) => (recentHistory[e.env]?.length ?? 0) > 0);
  if (environments.length === 0) return null;
  const now = Date.now();
  const rangeStart = withHistory.length > 0 ? Math.min(...withHistory.map((e) => new Date(recentHistory[e.env][0].date).getTime())) : now - 60 * 60 * 1e3;
  const rangeMs = Math.max(now - rangeStart, 60 * 60 * 1e3);
  const pct = (ms) => `${Math.min(100, Math.max(0, ms / rangeMs * 100))}%`;
  const legendTags = [];
  const seenTags = /* @__PURE__ */ new Set();
  withHistory.flatMap((env) => recentHistory[env.env]).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach((entry) => {
    if (!seenTags.has(entry.imageTag)) {
      seenTags.add(entry.imageTag);
      legendTags.push(entry.imageTag);
    }
  });
  return /* @__PURE__ */ jsxs("div", { className: classes.card, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.headRow, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Release timeline" }),
      /* @__PURE__ */ jsx("span", { className: classes.range, children: withHistory.length > 0 ? `${formatDateTime(new Date(rangeStart).toISOString())} \u2013 ${formatDateTime(new Date(now).toISOString())}` : "no promotions recorded" })
    ] }),
    environments.map((env) => {
      const entries = recentHistory[env.env] ?? [];
      if (entries.length === 0) {
        return /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
          /* @__PURE__ */ jsx("span", { className: classes.rowLabel, children: env.env }),
          /* @__PURE__ */ jsx("div", { className: classes.track, children: /* @__PURE__ */ jsx("span", { className: classes.emptyTrack, children: "no promotions recorded yet" }) })
        ] }, env.env);
      }
      return /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
        /* @__PURE__ */ jsx("span", { className: classes.rowLabel, children: env.env }),
        /* @__PURE__ */ jsx("div", { className: classes.track, children: entries.map((entry, i) => {
          const startMs = new Date(entry.date).getTime() - rangeStart;
          const endMs = i + 1 < entries.length ? new Date(entries[i + 1].date).getTime() - rangeStart : now - rangeStart;
          const isLast = i === entries.length - 1;
          const stale = isLast && now - new Date(entry.date).getTime() > STALE_THRESHOLD_MS;
          const color = colorForTag(entry.imageTag, isDark);
          return /* @__PURE__ */ jsx(
            "div",
            {
              className: `${classes.seg} ${stale ? classes.segStale : ""}`,
              title: `${imageTag(entry.imageTag)} \xB7 deployed ${formatDateTime(entry.date)}${stale ? ` \xB7 running ${relativeTime(entry.date)}` : ""}`,
              style: {
                left: pct(startMs),
                width: pct(endMs - startMs),
                backgroundColor: color,
                borderColor: stale ? t.amber : "transparent"
              },
              children: imageTag(entry.imageTag)
            },
            entry.sha
          );
        }) })
      ] }, env.env);
    }),
    /* @__PURE__ */ jsxs("div", { className: classes.legend, children: [
      legendTags.map((tag) => /* @__PURE__ */ jsxs("div", { className: classes.legendItem, children: [
        /* @__PURE__ */ jsx("span", { className: classes.swatch, style: { backgroundColor: colorForTag(tag, isDark) } }),
        imageTag(tag)
      ] }, tag)),
      /* @__PURE__ */ jsxs("div", { className: classes.legendItem, children: [
        /* @__PURE__ */ jsx("span", { className: `${classes.swatch} ${classes.swatchStale}`, style: { borderColor: t.amber } }),
        "stale (running >3 days)"
      ] })
    ] }),
    /* @__PURE__ */ jsx(Typography, { className: classes.note, style: { marginTop: 10 }, children: "Showing up to the last 10 tracked promotions per environment, not a fixed date window - an environment that promotes rarely may show a much longer span than one that promotes often." })
  ] });
}
function LeadTimeCard({
  env,
  deployEntry,
  repoRef,
  gitopsPrs,
  classes
}) {
  const shortSha = deployEntry ? extractShortShaFromImageTag(deployEntry.imageTag) : void 0;
  const commit = useRepoHead(
    repoRef && shortSha ? { owner: repoRef.owner, repo: repoRef.repo, ref: shortSha } : void 0
  );
  if (!deployEntry) {
    return /* @__PURE__ */ jsxs("div", { className: classes.leadCard, children: [
      /* @__PURE__ */ jsx("div", { className: classes.leadEnv, children: env }),
      /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "No recorded promotion yet." })
    ] });
  }
  const leadMs = commit.data ? new Date(deployEntry.date).getTime() - new Date(commit.data.pushedAt ?? deployEntry.date).getTime() : void 0;
  const mergedPr = gitopsPrForEnvAndImage(gitopsPrs, env, imageTag(deployEntry.imageTag));
  const mergeToDeployMs = mergedPr?.state === "merged" && mergedPr.mergedAt ? new Date(deployEntry.date).getTime() - new Date(mergedPr.mergedAt).getTime() : void 0;
  return /* @__PURE__ */ jsxs("div", { className: classes.leadCard, children: [
    /* @__PURE__ */ jsx("div", { className: classes.leadEnv, children: env }),
    leadMs !== void 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { className: classes.leadValue, children: formatDuration(leadMs) }),
      /* @__PURE__ */ jsxs("div", { className: classes.leadCaption, children: [
        shortSha,
        " \u2192 deployed ",
        relativeTime(deployEntry.date)
      ] })
    ] }),
    mergeToDeployMs !== void 0 && /* @__PURE__ */ jsxs("div", { className: classes.leadCaption, children: [
      "PR #",
      mergedPr.number,
      " merge \u2192 deploy: ",
      formatDuration(mergeToDeployMs)
    ] })
  ] });
}
function LeadTimePanel({
  environments,
  history,
  repoRef,
  gitopsPrs = []
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  if (environments.length === 0) {
    return /* @__PURE__ */ jsxs("div", { className: classes.card, children: [
      /* @__PURE__ */ jsx("div", { className: classes.headRow, children: /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Lead time \u2014 commit to deploy" }) }),
      /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "No environments to measure yet." })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: classes.card, children: [
    /* @__PURE__ */ jsx("div", { className: classes.headRow, children: /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Lead time \u2014 commit to deploy" }) }),
    /* @__PURE__ */ jsx("div", { className: classes.leadGrid, children: environments.map((env) => {
      const entries = history[env.env] ?? [];
      return /* @__PURE__ */ jsx(
        LeadTimeCard,
        {
          env: env.env,
          deployEntry: entries.length > 0 ? entries[entries.length - 1] : void 0,
          repoRef,
          gitopsPrs,
          classes
        },
        env.env
      );
    }) })
  ] });
}

export { LeadTimePanel, ReleaseTimelinePanel, formatDuration };
//# sourceMappingURL=TimelinePanel.esm.js.map
