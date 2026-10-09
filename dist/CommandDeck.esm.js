import { jsx, jsxs } from 'react/jsx-runtime';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { STALE_THRESHOLD_MS, relativeTime } from './shared/format.esm.js';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { PrButton } from './PrButton.esm.js';
import { gitopsPrForEnv } from './useReleaseContext.esm.js';
import { health } from './types.esm.js';

const useStyles = makeStyles(() => ({
  deck: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6,
    boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
    marginBottom: 20,
    overflow: "hidden"
  },
  deckInner: { padding: "14px 20px 16px" },
  envRow: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontFamily: fontMono,
    fontSize: 11,
    padding: "4px 10px",
    borderRadius: 100,
    border: "1px solid",
    cursor: "pointer"
  },
  dot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0 },
  previewChip: { borderStyle: "dashed" },
  tasks: { marginTop: 14, display: "flex", flexDirection: "column", gap: 6 },
  task: { display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 5, flexWrap: "wrap" },
  taskIcon: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: 14,
    fontWeight: 700,
    border: "2px solid",
    backgroundColor: ({ t }) => t.panel
  },
  taskBody: { flex: "1 1 240px", minWidth: 0 },
  taskEyebrow: { fontFamily: fontMono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" },
  taskHeadline: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, color: ({ t }) => t.textHi },
  taskDetail: { fontSize: 11.5, color: ({ t }) => t.textLo, marginTop: 1 },
  taskAction: {
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.textHi,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 4,
    padding: "5px 10px",
    background: "none",
    cursor: "pointer",
    whiteSpace: "nowrap",
    "&:hover": { borderColor: ({ t }) => t.amberLine, color: ({ t }) => t.amberInk }
  },
  statsRow: { marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 },
  stat: {
    backgroundColor: ({ t }) => t.panelAlt,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    borderRadius: 5,
    padding: "10px 14px"
  },
  statVal: { fontFamily: fontMono, fontSize: 22, fontWeight: 600, color: ({ t }) => t.textHi },
  statValSm: { fontSize: 14 },
  statLabel: { fontSize: 11, color: ({ t }) => t.textFaint, marginTop: 2 }
}));
const STATUS_COLOR = {
  healthy: "good",
  progressing: "amber",
  paused: "sky",
  degraded: "bad",
  unknown: "textFaint"
};
const STATUS_SOFT = {
  healthy: "goodSoft",
  progressing: "amberSoft",
  paused: "skySoft",
  degraded: "badSoft",
  unknown: "panelAlt"
};
function toneColors(t, tone) {
  switch (tone) {
    case "bad":
      return { bg: t.badSoft, border: t.bad, fg: t.bad };
    case "warn":
      return { bg: t.amberSoft, border: t.amberLine, fg: t.amberInk };
    case "good":
      return { bg: t.goodSoft, border: t.good, fg: t.good };
    case "neutral":
    default:
      return { bg: t.panelAlt, border: t.line, fg: t.textFaint };
  }
}
function computeTaskQueue(environments, gitopsPrs, sourcePrs, goToMatrix, goToPullRequests, goToTopology) {
  if (environments.length === 0) {
    return [
      { tone: "neutral", icon: "\u25CB", eyebrow: "Nothing yet", headline: "No environments deployed yet" }
    ];
  }
  const tasks = [];
  const degraded = environments.find((e) => health(e) === "degraded");
  if (degraded) {
    tasks.push({
      tone: "bad",
      icon: "!",
      eyebrow: "Needs attention",
      headline: `${degraded.env} is degraded`,
      detail: `${degraded.availableReplicas ?? 0}/${degraded.desiredReplicas ?? "?"} replicas available`,
      action: { label: "Inspect in Topology \u2192", onClick: goToTopology }
    });
  }
  const pendingByAge = environments.map((e) => ({ env: e, pr: gitopsPrForEnv(gitopsPrs, e.env) })).filter((x) => Boolean(x.pr) && x.pr.state === "open").sort((a, b) => new Date(a.pr.updatedAt).getTime() - new Date(b.pr.updatedAt).getTime())[0];
  if (pendingByAge) {
    tasks.push({
      tone: "warn",
      icon: "\u21E2",
      eyebrow: "Pending promotion",
      headline: `PR #${pendingByAge.pr.number} awaiting merge to promote to ${pendingByAge.env.env}`,
      detail: `updated ${relativeTime(pendingByAge.pr.updatedAt)}`,
      pr: pendingByAge.pr,
      action: { label: "Review in Matrix \u2192", onClick: goToMatrix }
    });
  }
  const drifted = environments.filter((e) => e.drift);
  if (drifted.length > 0 && tasks.length < 3) {
    tasks.push({
      tone: "warn",
      icon: "\u2260",
      eyebrow: "Image drift",
      headline: `${drifted.length} environment${drifted.length === 1 ? "" : "s"} running a different image than the rest`,
      detail: drifted.map((e) => e.env).join(", "),
      action: { label: "Review in Matrix \u2192", onClick: goToMatrix }
    });
  }
  const openSourcePrs = sourcePrs.filter((pr) => pr.state === "open");
  if (openSourcePrs.length > 0 && tasks.length < 3) {
    tasks.push({
      tone: "neutral",
      icon: "\u25C7",
      eyebrow: "Awaiting triage",
      headline: `${openSourcePrs.length} open source PR${openSourcePrs.length === 1 ? "" : "s"} not yet promoted anywhere`,
      detail: openSourcePrs.slice(0, 3).map((pr) => `#${pr.number} ${pr.title}`).join(" \xB7 "),
      action: { label: "View PRs \u2192", onClick: goToPullRequests }
    });
  }
  const progressing = environments.filter((e) => health(e) === "progressing");
  if (progressing.length > 0 && tasks.length < 3) {
    tasks.push({
      tone: "warn",
      icon: "\u21BB",
      eyebrow: "In progress",
      headline: `${progressing.map((e) => e.env).join(", ")} still scaling up`
    });
  }
  if (tasks.length === 0) {
    tasks.push({ tone: "good", icon: "\u2713", eyebrow: "All clear", headline: "Every environment healthy, nothing pending" });
  }
  return tasks.slice(0, 3);
}
function verifiedSupplyChainCount(environments, provenanceByImage) {
  let verified = 0;
  let total = 0;
  environments.forEach((env) => {
    if (!env.image) return;
    const state = provenanceByImage[env.image];
    if (!state || state.loading || !state.data) return;
    total += 1;
    const slsa = state.data.attestations.find((a) => a.predicateType === "https://slsa.dev/provenance/v0.2");
    const anyVerified = state.data.attestations.some((a) => a.verified);
    if (anyVerified && slsa?.verified) verified += 1;
  });
  return { verified, total };
}
function releasesThisWeek(deployHistory) {
  if (!deployHistory) return 0;
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1e3;
  return Object.values(deployHistory).flat().filter((entry) => new Date(entry.date).getTime() >= cutoff).length;
}
function CommandDeck({
  environments,
  previewCount,
  gitopsPrs,
  sourcePrs,
  deployHistory,
  provenanceByImage,
  onSelectTab
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [, setSearchParams] = useSearchParams();
  const goToTowerTab = (tab) => () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  };
  const goToMatrix = () => onSelectTab("matrix");
  const goToEnvTopology = (env) => () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", "topology");
      next.set("env", env);
      return next;
    });
  };
  const tasks = computeTaskQueue(
    environments,
    gitopsPrs,
    sourcePrs,
    goToMatrix,
    goToTowerTab("pull-requests"),
    goToTowerTab("topology")
  );
  const openPromotions = gitopsPrs.filter((pr) => pr.state === "open").length;
  const openSourcePrCount = sourcePrs.filter((pr) => pr.state === "open").length;
  const releasesWeek = releasesThisWeek(deployHistory);
  const { verified, total } = verifiedSupplyChainCount(environments, provenanceByImage);
  return /* @__PURE__ */ jsx("div", { className: classes.deck, children: /* @__PURE__ */ jsxs("div", { className: classes.deckInner, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.envRow, children: [
      environments.map((env) => {
        const h = health(env);
        const stale = env.deployedAt && Date.now() - new Date(env.deployedAt).getTime() > STALE_THRESHOLD_MS;
        return /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            className: classes.chip,
            style: { backgroundColor: t[STATUS_SOFT[h]], borderColor: t[STATUS_COLOR[h]], color: t[STATUS_COLOR[h]] },
            onClick: goToEnvTopology(env.env),
            title: `View ${env.env} in Topology${stale ? ` - deployed ${relativeTime(env.deployedAt)}` : ""}`,
            children: [
              /* @__PURE__ */ jsx("span", { className: classes.dot, style: { backgroundColor: t[STATUS_COLOR[h]] } }),
              env.env,
              env.drift && /* @__PURE__ */ jsx("span", { title: "Running a different image than the majority", children: "\u26A0" })
            ]
          },
          env.key
        );
      }),
      previewCount > 0 && /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          className: `${classes.chip} ${classes.previewChip}`,
          style: { backgroundColor: t.skySoft, borderColor: t.skyLine, color: t.sky },
          onClick: () => onSelectTab("preview"),
          title: "View preview environments",
          children: [
            /* @__PURE__ */ jsx("span", { className: classes.dot, style: { backgroundColor: t.sky } }),
            previewCount,
            " preview"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsx("div", { className: classes.tasks, children: tasks.map((task, i) => {
      const colors = toneColors(t, task.tone);
      return /* @__PURE__ */ jsxs("div", { className: classes.task, style: { backgroundColor: colors.bg }, children: [
        /* @__PURE__ */ jsx("span", { className: classes.taskIcon, style: { borderColor: colors.border, color: colors.fg }, children: task.icon }),
        /* @__PURE__ */ jsxs("div", { className: classes.taskBody, children: [
          /* @__PURE__ */ jsx(Typography, { className: classes.taskEyebrow, style: { color: colors.fg }, children: task.eyebrow }),
          /* @__PURE__ */ jsx(Typography, { className: classes.taskHeadline, children: task.headline }),
          task.detail && /* @__PURE__ */ jsx(Typography, { className: classes.taskDetail, children: task.detail })
        ] }),
        task.pr && /* @__PURE__ */ jsx(PrButton, { pr: task.pr, showTarget: true }),
        task.action && /* @__PURE__ */ jsx("button", { type: "button", className: classes.taskAction, onClick: task.action.onClick, children: task.action.label })
      ] }, i);
    }) }),
    /* @__PURE__ */ jsxs("div", { className: classes.statsRow, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.stat, children: [
        /* @__PURE__ */ jsx("div", { className: classes.statVal, children: releasesWeek }),
        /* @__PURE__ */ jsx("div", { className: classes.statLabel, children: "releases this week" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.stat, children: [
        /* @__PURE__ */ jsx("div", { className: classes.statVal, children: openSourcePrCount }),
        /* @__PURE__ */ jsx("div", { className: classes.statLabel, children: "open source PRs" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.stat, children: [
        /* @__PURE__ */ jsx("div", { className: classes.statVal, children: openPromotions }),
        /* @__PURE__ */ jsxs("div", { className: classes.statLabel, children: [
          "pending promotion",
          openPromotions === 1 ? "" : "s"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.stat, children: [
        /* @__PURE__ */ jsx("div", { className: `${classes.statVal} ${classes.statValSm}`, children: total > 0 ? `${verified}/${total} verified` : "checking\u2026" }),
        /* @__PURE__ */ jsx("div", { className: classes.statLabel, children: "cosign \xB7 SLSA \xB7 Rekor" })
      ] })
    ] })
  ] }) });
}

export { CommandDeck };
//# sourceMappingURL=CommandDeck.esm.js.map
