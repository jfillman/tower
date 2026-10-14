import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import { STALE_THRESHOLD_MS, relativeTime } from './shared/format.esm.js';
import { useHangarTokens } from './brand/tokens.esm.js';
import { PrButton } from './PrButton.esm.js';
import { gitopsPrForEnv } from './useReleaseContext.esm.js';
import { health } from './types.esm.js';
import { Card, StatusChip, healthTone, Callout, TextLink, Tile, Stat } from './ui/index.esm.js';
import { isSignedAndAttested } from './supplyChain.esm.js';

const useStyles = makeStyles(() => ({
  deck: { marginBottom: 20 },
  deckBody: { display: "flex", flexDirection: "column", gap: 14 },
  envRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  tasks: { display: "flex", flexDirection: "column", gap: 6 },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }
}));
const CALLOUT_TONE = { bad: "bad", warn: "warn", good: "ok", neutral: "neutral" };
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
    if (isSignedAndAttested(state.data)) verified += 1;
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
  return /* @__PURE__ */ jsx(Card, { className: classes.deck, children: /* @__PURE__ */ jsxs("div", { className: classes.deckBody, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.envRow, children: [
      environments.map((env) => {
        const h = health(env);
        const stale = env.deployedAt && Date.now() - new Date(env.deployedAt).getTime() > STALE_THRESHOLD_MS;
        return /* @__PURE__ */ jsxs(
          StatusChip,
          {
            tone: healthTone(h),
            dot: true,
            onClick: goToEnvTopology(env.env),
            title: `View ${env.env} in Topology${stale ? ` - deployed ${relativeTime(env.deployedAt)}` : ""}`,
            children: [
              env.env,
              env.drift && /* @__PURE__ */ jsx("span", { title: "Running a different image than the majority", children: "\u26A0" })
            ]
          },
          env.key
        );
      }),
      previewCount > 0 && /* @__PURE__ */ jsxs(StatusChip, { tone: "info", dot: true, onClick: () => onSelectTab("preview"), title: "View preview environments", children: [
        previewCount,
        " preview"
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: classes.tasks, children: tasks.map((task, i) => /* @__PURE__ */ jsx(
      Callout,
      {
        tone: CALLOUT_TONE[task.tone],
        icon: task.icon,
        label: task.eyebrow,
        title: task.headline,
        actions: task.pr || task.action ? /* @__PURE__ */ jsxs(Fragment, { children: [
          task.pr && /* @__PURE__ */ jsx(PrButton, { pr: task.pr, showTarget: true }),
          task.action && /* @__PURE__ */ jsx(TextLink, { onClick: task.action.onClick, children: task.action.label })
        ] }) : void 0,
        children: task.detail
      },
      i
    )) }),
    /* @__PURE__ */ jsxs("div", { className: classes.statsRow, children: [
      /* @__PURE__ */ jsx(Tile, { children: /* @__PURE__ */ jsx(Stat, { label: "Releases this week", value: releasesWeek }) }),
      /* @__PURE__ */ jsx(Tile, { children: /* @__PURE__ */ jsx(Stat, { label: "Open source PRs", value: openSourcePrCount }) }),
      /* @__PURE__ */ jsx(Tile, { children: /* @__PURE__ */ jsx(Stat, { label: `Pending promotion${openPromotions === 1 ? "" : "s"}`, value: openPromotions }) }),
      /* @__PURE__ */ jsx(Tile, { children: /* @__PURE__ */ jsx(Stat, { label: "Supply chain", value: total > 0 ? `${verified}/${total} verified` : "checking\u2026", caption: "cosign \xB7 SLSA \xB7 Rekor" }) })
    ] })
  ] }) });
}

export { CommandDeck };
//# sourceMappingURL=CommandDeck.esm.js.map
