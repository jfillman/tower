import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import SecurityIcon from '@material-ui/icons/Security';
import SyncIcon from '@material-ui/icons/Sync';
import TrendingUpIcon from '@material-ui/icons/TrendingUp';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import { formatDateTime, relativeTime } from '../../shared/format.esm.js';
import { fontMono, fontDisplay, useHangarTokens } from '../../brand/tokens.esm.js';
import { useSignalRailStyles, GitPrIcon, GateLedger } from '../../SignalRail.esm.js';
import { CanaryRampChart } from '../../CanaryRampChart.esm.js';
import { RolloutTopologyDag } from '../../RolloutTopologyDag.esm.js';
import { RolloutControls } from './RolloutControls.esm.js';
import { imageTag } from '../../types.esm.js';
import { StatusChip, TextLink, Button } from '../../ui/index.esm.js';

function rolloutControlsFor(env) {
  if (env.workload?.kind !== "Rollout" || !env.argoAppName || !env.cluster || !env.namespace) return null;
  return /* @__PURE__ */ jsx(RolloutControls, { cluster: env.cluster, argoAppName: env.argoAppName, namespace: env.namespace, rolloutName: env.workload.name });
}
const PR_BODY_TRUNCATE = 700;
const useStyles = makeStyles(() => ({
  head: { display: "flex", alignItems: "center", gap: 9 },
  headIcon: { display: "flex", color: ({ t }) => t.sky, flexShrink: 0 },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14.5, color: ({ t }) => t.textHi },
  note: { fontSize: 12.5, fontStyle: "italic", color: ({ t }) => t.textLo },
  meta: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint },
  prLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 13.5,
    color: ({ t }) => t.sky,
    textDecoration: "none",
    "&:hover": { textDecoration: "underline" }
  },
  body: { fontSize: 12.5, color: ({ t }) => t.textLo, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  chipPos: { alignSelf: "flex-start" },
  "@keyframes livePulse": { "0%, 100%": { opacity: 1 }, "50%": { opacity: 0.5 } },
  // Amber + pulsing while the canary is live (2026-09-23 feedback).
  resourceList: { display: "flex", flexDirection: "column", gap: 5, marginTop: 2 },
  resourceRow: { display: "flex", alignItems: "center", gap: 9, padding: "6px 10px", borderRadius: 6, backgroundColor: ({ t }) => t.panelAlt, fontFamily: fontMono, fontSize: 11.5 },
  resourceRowPinned: { border: ({ t }) => `1px solid ${t.skyLine}` },
  resourceDot: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },
  resourceKind: { color: ({ t }) => t.sky, fontWeight: 600, minWidth: 80, flexShrink: 0 },
  resourceName: { color: ({ t }) => t.textHi, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  resourceStatus: { color: ({ t }) => t.textFaint, flexShrink: 0 },
  resourceTag: { color: ({ t }) => t.amberInk, fontWeight: 700, flexShrink: 0 }
}));
function guardrailsFallbackNote(delivery) {
  if (delivery.pr?.state === "merged") {
    return "This PR has merged and is not the most recently merged release for this environment, so Tower no longer refreshes its check results - see the PR itself on GitHub for its check history.";
  }
  if (delivery.commit) {
    return "Ground-tier environments deploy by direct commit - no release-gate PR to check.";
  }
  return "Waiting on the release PR to open.";
}
function timeText(at) {
  return at ? `${relativeTime(at)} \xB7 ${formatDateTime(at)}` : "pending";
}
function mergeCommitUrl(pr) {
  if (!pr.mergeCommitSha) return void 0;
  return pr.url.replace(/\/pull\/\d+$/, `/commit/${pr.mergeCommitSha}`);
}
function reviewLabel(review) {
  if (!review || review.state === "pending") return void 0;
  return review.state === "approved" ? "approved" : "changes requested";
}
function CreatedBody({
  delivery,
  step,
  classes
}) {
  if (delivery.pr) {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("a", { className: classes.prLink, href: delivery.pr.url, target: "_blank", rel: "noopener noreferrer", children: [
        /* @__PURE__ */ jsx(GitPrIcon, { fontSize: 15 }),
        "PR #",
        delivery.pr.number,
        ": ",
        delivery.pr.title
      ] }),
      /* @__PURE__ */ jsxs(Typography, { className: classes.meta, children: [
        delivery.pr.author && `opened by ${delivery.pr.author} \xB7 `,
        timeText(step?.at)
      ] }),
      delivery.pr.body ? /* @__PURE__ */ jsx(Typography, { className: classes.body, children: delivery.pr.body.length > PR_BODY_TRUNCATE ? `${delivery.pr.body.slice(0, PR_BODY_TRUNCATE)}\u2026` : delivery.pr.body }) : /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "This PR has no description." })
    ] });
  }
  if (delivery.commit) {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "Ground-tier environments promote by pushing a commit straight to the gitops branch - there's no PR to show for this delivery." }),
      /* @__PURE__ */ jsxs(Typography, { className: classes.meta, children: [
        delivery.commit.sha.slice(0, 7),
        " \xB7 ",
        formatDateTime(delivery.commit.date),
        " \xB7 ",
        delivery.commit.imageTag
      ] })
    ] });
  }
  return /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "No delivery recorded yet." });
}
function MergedBody({
  delivery,
  step,
  gateCi,
  classes,
  onSelectStage
}) {
  if (delivery.pr?.state === "merged") {
    const commitUrl = mergeCommitUrl(delivery.pr);
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs(TextLink, { href: delivery.pr.url, children: [
        /* @__PURE__ */ jsx(GitPrIcon, { fontSize: 15 }),
        "PR #",
        delivery.pr.number,
        " \u2197"
      ] }),
      /* @__PURE__ */ jsxs(Typography, { className: classes.meta, children: [
        timeText(step?.at),
        delivery.pr.author && ` \xB7 opened by ${delivery.pr.author}`
      ] }),
      commitUrl && /* @__PURE__ */ jsxs(Typography, { className: classes.meta, children: [
        "merge commit",
        " ",
        /* @__PURE__ */ jsxs(TextLink, { href: commitUrl, children: [
          delivery.pr.mergeCommitSha.slice(0, 7),
          " \u2197"
        ] })
      ] }),
      gateCi && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs(StatusChip, { tone: gateCi.state === "success" ? "ok" : "warn", className: classes.chipPos, children: [
          gateCi.passedChecks,
          "/",
          gateCi.totalChecks,
          " guardrails passed"
        ] }),
        /* @__PURE__ */ jsx(TextLink, { onClick: () => onSelectStage("guardrails"), children: "Guardrail results \u2192" })
      ] })
    ] });
  }
  if (delivery.pr) {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("a", { className: classes.prLink, href: delivery.pr.url, target: "_blank", rel: "noopener noreferrer", children: [
        /* @__PURE__ */ jsx(GitPrIcon, { fontSize: 15 }),
        "PR #",
        delivery.pr.number,
        ": ",
        delivery.pr.title
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" }, children: [
        gateCi && /* @__PURE__ */ jsxs(StatusChip, { tone: gateCi.state === "success" ? "ok" : "warn", children: [
          gateCi.passedChecks,
          "/",
          gateCi.totalChecks,
          " guardrails"
        ] }),
        reviewLabel(delivery.pr.review) && /* @__PURE__ */ jsx(StatusChip, { tone: delivery.pr.review?.state === "approved" ? "ok" : "warn", children: reviewLabel(delivery.pr.review) })
      ] }),
      /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(
        Button,
        {
          small: true,
          disabled: true,
          title: "Not yet available - merging a PR is a Tier 2 write action pending the authorization model in HANDOFF-tower-write-actions.md. Merge on GitHub directly for now.",
          children: "Merge PR"
        }
      ) })
    ] });
  }
  return /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "Not merged yet." });
}
function notStartedFor(delivery, stage, releaseTag, runningTag) {
  const idx = delivery.steps.findIndex((s) => s.key === stage);
  const step = delivery.steps[idx];
  if (!step || step.status !== "pending") return void 0;
  if (!releaseTag || releaseTag === runningTag) return void 0;
  const blocking = delivery.steps.slice(0, idx).find((s) => s.status !== "good");
  return { waitingFor: blocking?.label ?? "the earlier steps" };
}
function NotStarted({
  releaseTag,
  runningTag,
  waitingFor,
  classes,
  children
}) {
  const [open, setOpen] = useState(false);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(Typography, { className: classes.note, "data-testid": "stage-not-started", children: [
      "Not started for ",
      /* @__PURE__ */ jsx("span", { style: { fontFamily: fontMono }, children: releaseTag }),
      " yet: waiting for ",
      waitingFor,
      ".",
      runningTag ? /* @__PURE__ */ jsxs(Fragment, { children: [
        " ",
        "What is shown below is the release running now, ",
        /* @__PURE__ */ jsx("span", { style: { fontFamily: fontMono }, children: runningTag }),
        "."
      ] }) : null
    ] }),
    /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(TextLink, { expanded: open, onClick: () => setOpen((v) => !v), children: runningTag ? `Show what is running now (${runningTag})` : "Show the current Rollout" }) }),
    open && children
  ] });
}
function healthyNote(step) {
  if (step?.status === "good") return `Healthy since ${timeText(step.at)}.`;
  if (step?.status === "bad") return "ArgoCD reports this degraded - see the banner above for detail.";
  return "Not finished yet.";
}
function StageDetail({
  delivery,
  selectedKey,
  gateCi,
  argoOperationMessage,
  argoResources,
  targetImageTag,
  env,
  rolloutProgress,
  onSelectStage
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const railClasses = useSignalRailStyles({ t });
  const step = delivery.steps.find((s) => s.key === selectedKey);
  if (selectedKey === "created") {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
        /* @__PURE__ */ jsx("span", { className: classes.headIcon, children: /* @__PURE__ */ jsx(GitPrIcon, { fontSize: 18 }) }),
        /* @__PURE__ */ jsx(Typography, { className: classes.title, children: delivery.pr ? "PR created" : "Direct commit" })
      ] }),
      /* @__PURE__ */ jsx(CreatedBody, { delivery, step, classes })
    ] });
  }
  if (selectedKey === "guardrails") {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
        /* @__PURE__ */ jsx("span", { className: classes.headIcon, children: /* @__PURE__ */ jsx(SecurityIcon, { fontSize: "small" }) }),
        /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Guardrails" })
      ] }),
      /* @__PURE__ */ jsx(Typography, { className: classes.meta, children: timeText(step?.at) }),
      gateCi?.checks ? /* @__PURE__ */ jsx(GateLedger, { ci: gateCi, classes: railClasses, t }) : /* @__PURE__ */ jsx(Typography, { className: classes.note, children: guardrailsFallbackNote(delivery) })
    ] });
  }
  if (selectedKey === "merged") {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
        /* @__PURE__ */ jsx("span", { className: classes.headIcon, children: /* @__PURE__ */ jsx(GitPrIcon, { fontSize: 18 }) }),
        /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "PR merged" })
      ] }),
      /* @__PURE__ */ jsx(MergedBody, { delivery, step, gateCi, classes, onSelectStage })
    ] });
  }
  if (selectedKey === "synced") {
    const resources = argoResources ?? [];
    const rollout = resources.find((r) => r.kind === "Rollout");
    const outOfSync = resources.filter((r) => r.syncStatus && r.syncStatus !== "Synced");
    const rest = resources.filter((r) => r !== rollout && r.syncStatus && r.syncStatus !== "Synced");
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
        /* @__PURE__ */ jsx("span", { className: classes.headIcon, children: /* @__PURE__ */ jsx(SyncIcon, { fontSize: "small" }) }),
        /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Application sync" })
      ] }),
      step?.status === "bad" && /* @__PURE__ */ jsx(StatusChip, { tone: "bad", className: classes.chipPos, children: "sync operation failed" }),
      /* @__PURE__ */ jsx(Typography, { className: classes.meta, children: timeText(step?.at) }),
      targetImageTag && /* @__PURE__ */ jsxs(Typography, { className: classes.meta, children: [
        "target image: ",
        targetImageTag
      ] }),
      argoOperationMessage && /* @__PURE__ */ jsx(Typography, { className: classes.body, children: argoOperationMessage }),
      resources.length === 0 && /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "No resource tree reported yet." }),
      resources.length > 0 && outOfSync.length === 0 && /* @__PURE__ */ jsxs(Typography, { className: classes.note, children: [
        "All ",
        resources.length,
        " managed resources synced."
      ] }),
      resources.length > 0 && outOfSync.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.resourceList, children: [
        rollout && /* @__PURE__ */ jsxs("div", { className: `${classes.resourceRow} ${classes.resourceRowPinned}`, children: [
          /* @__PURE__ */ jsx(
            "span",
            {
              className: classes.resourceDot,
              style: { backgroundColor: rollout.syncStatus === "Synced" ? t.good : t.amber }
            }
          ),
          /* @__PURE__ */ jsx("span", { className: classes.resourceKind, children: rollout.kind }),
          /* @__PURE__ */ jsx("span", { className: classes.resourceName, children: rollout.name }),
          targetImageTag && /* @__PURE__ */ jsxs("span", { className: classes.resourceTag, children: [
            "\u2192 ",
            targetImageTag
          ] }),
          /* @__PURE__ */ jsx("span", { className: classes.resourceStatus, children: rollout.syncStatus ?? "Unknown" })
        ] }),
        rest.map((r, i) => /* @__PURE__ */ jsxs("div", { className: classes.resourceRow, children: [
          /* @__PURE__ */ jsx("span", { className: classes.resourceDot, style: { backgroundColor: t.amber } }),
          /* @__PURE__ */ jsx("span", { className: classes.resourceKind, children: r.kind }),
          /* @__PURE__ */ jsx("span", { className: classes.resourceName, children: r.name }),
          /* @__PURE__ */ jsx("span", { className: classes.resourceStatus, children: r.syncStatus ?? "Unknown" })
        ] }, `${r.kind}-${r.name}-${i}`)),
        /* @__PURE__ */ jsxs(Typography, { className: classes.note, children: [
          outOfSync.length,
          " of ",
          resources.length,
          " resources still out of sync - this list shrinks as ArgoCD applies them (refresh above for the latest read)."
        ] })
      ] })
    ] });
  }
  if (selectedKey === "progressing") {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
        /* @__PURE__ */ jsx("span", { className: classes.headIcon, children: /* @__PURE__ */ jsx(TrendingUpIcon, { fontSize: "small" }) }),
        /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Rollout starts" })
      ] }),
      (() => {
        const runningTag = env.image ? imageTag(env.image) : void 0;
        const waiting = notStartedFor(delivery, "progressing", targetImageTag, runningTag);
        const live = /* @__PURE__ */ jsxs(Fragment, { children: [
          rolloutControlsFor(env),
          rolloutProgress ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(
              CanaryRampChart,
              {
                cluster: env.cluster,
                namespace: env.namespace,
                rolloutName: env.workload.name,
                podHash: env.workload.currentPodHash,
                progress: rolloutProgress
              }
            ),
            /* @__PURE__ */ jsx(
              RolloutTopologyDag,
              {
                cluster: env.cluster,
                namespace: env.namespace,
                rolloutName: env.workload.name,
                stepWeight: rolloutProgress.currentWeight
              }
            )
          ] }) : /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "This environment's workload isn't a canary Rollout (or has no canary steps configured) - nothing to chart here." })
        ] });
        return waiting && targetImageTag ? /* @__PURE__ */ jsx(NotStarted, { releaseTag: targetImageTag, runningTag, waitingFor: waiting.waitingFor, classes, children: live }) : live;
      })()
    ] });
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsx("span", { className: classes.headIcon, children: /* @__PURE__ */ jsx(CheckCircleIcon, { fontSize: "small" }) }),
      /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Rollout completes" })
    ] }),
    (() => {
      const runningTag = env.image ? imageTag(env.image) : void 0;
      const waiting = notStartedFor(delivery, "healthy", targetImageTag, runningTag);
      if (waiting && targetImageTag) {
        return /* @__PURE__ */ jsx(NotStarted, { releaseTag: targetImageTag, runningTag, waitingFor: waiting.waitingFor, classes, children: rolloutControlsFor(env) });
      }
      return /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Typography, { className: classes.note, children: healthyNote(step) }),
        rolloutControlsFor(env)
      ] });
    })()
  ] });
}

export { StageDetail, notStartedFor };
//# sourceMappingURL=StageDetail.esm.js.map
