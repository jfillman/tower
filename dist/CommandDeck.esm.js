import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import { relativeTime } from './shared/format.esm.js';
import { useHangarTokens } from './brand/tokens.esm.js';
import { PrButton } from './PrButton.esm.js';
import { parseGitopsPrTitle, gitopsPrForEnv } from './useReleaseContext.esm.js';
import { health } from './types.esm.js';
import { Stat, Callout, TextLink } from './ui/index.esm.js';
import { commitProofOf, commitProofChip } from './commitProof.esm.js';

const useStyles = makeStyles(() => ({
  tasks: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 },
  stats: { display: "inline-flex", alignItems: "flex-start", gap: 18, flexWrap: "wrap" }
}));
const CALLOUT_TONE = { bad: "bad", warn: "warn", good: "ok", neutral: "neutral" };
function proofSuffix(pr) {
  const proof = commitProofOf({ guardrails: pr.ci, guardrailsPrUrl: pr.url });
  const chip = commitProofChip(proof);
  if (!chip || proof.state === "not-recorded" || proof.state === "not-required") return "";
  const who = proof.evidence?.mergedBy ?? proof.evidence?.signer;
  return ` \xB7 commit: ${chip}${who ? ` (${who})` : ""}`;
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
      detail: `updated ${relativeTime(pendingByAge.pr.updatedAt)}${proofSuffix(pendingByAge.pr)}`,
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
function CommandDeck({
  environments,
  gitopsPrs,
  sourcePrs,
  nextTag,
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
  const tasks = computeTaskQueue(
    environments,
    gitopsPrs,
    sourcePrs,
    () => onSelectTab("matrix"),
    goToTowerTab("pull-requests"),
    goToTowerTab("topology")
  ).filter((task) => {
    if (task.tone !== "bad" && task.tone !== "warn") return false;
    return !(task.pr && nextTag && parseGitopsPrTitle(task.pr.title)?.imageTag === nextTag);
  });
  if (tasks.length === 0) return null;
  return /* @__PURE__ */ jsx("div", { className: classes.tasks, children: tasks.map((task, i) => /* @__PURE__ */ jsx(
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
  )) });
}
function ReleaseStats({ releasesThisWeek, openSourcePrs, pendingPromotions }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  return /* @__PURE__ */ jsxs("span", { className: classes.stats, "aria-label": "Release stats", children: [
    /* @__PURE__ */ jsx(Stat, { label: "Releases this week", value: releasesThisWeek }),
    /* @__PURE__ */ jsx(Stat, { label: "Open source PRs", value: openSourcePrs }),
    /* @__PURE__ */ jsx(Stat, { label: `Pending promotion${pendingPromotions === 1 ? "" : "s"}`, value: pendingPromotions, tone: pendingPromotions > 0 ? "warn" : void 0 })
  ] });
}

export { CommandDeck, ReleaseStats };
//# sourceMappingURL=CommandDeck.esm.js.map
