import { jsxs, jsx } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { fontMono, fontDisplay, useHangarTokens } from '../../brand/tokens.esm.js';
import { podIssues, warningGroups } from '../../deployment/problems.esm.js';
import { relativeTime } from '../../shared/format.esm.js';
import { NamespaceEvents } from '../../NamespaceEvents.esm.js';
import { useState } from 'react';

function stepByKey(steps, key) {
  return steps?.find((s) => s.key === key);
}
const BLOCKING_WARNINGS = /* @__PURE__ */ new Set(["FailedCreate", "FailedScheduling", "FailedMount", "FailedAttachVolume", "InvalidImageName", "ErrImagePull"]);
const BLOCKING_RECENT_MS = 10 * 60 * 1e3;
function diagnose(env, currentSteps, issues = [], warnings = [], now = Date.now()) {
  const guardrails = stepByKey(currentSteps, "guardrails");
  if (guardrails?.status === "bad") {
    return {
      tone: "bad",
      title: "A required guardrail failed",
      body: "At least one release guardrail on this PR did not pass - see the Release gates panel below for which one and its report. This blocks the merge, so nothing has synced to this environment for this release yet."
    };
  }
  if (env.rolloutPhase === "Degraded") {
    return {
      tone: "bad",
      title: "The canary rollout failed",
      body: env.rolloutMessage ? `Argo Rollouts reports this Rollout as Degraded: ${env.rolloutMessage} ArgoCD's own sync status above may still read as still-applying while this settles - that's a separate, secondary symptom, not a different problem.` : "Argo Rollouts reports this Rollout as Degraded - the canary did not complete (e.g. a failed analysis run, or a step that never recovered). ArgoCD's own sync status above may still read as still-applying while this settles - that's a separate, secondary symptom, not a different problem. Check the Rollout starts stage below for the step graph and pod logs."
    };
  }
  if (issues.length > 0 && env.rolloutPhase !== "Healthy") {
    const total = issues.reduce((n, i) => n + i.pods.length, 0);
    return {
      tone: "bad",
      title: issues.length === 1 ? issues[0].title : `${issues.length} problems are keeping this environment's pods from running`,
      body: `${total === 1 ? "1 pod is affected" : `${total} pods are affected`}. What Kubernetes reports, and what to try first, is listed below.`
    };
  }
  const blocking = warnings.filter((w) => BLOCKING_WARNINGS.has(w.reason) && now - w.lastSeen < BLOCKING_RECENT_MS);
  if (issues.length === 0 && blocking.length > 0 && env.rolloutPhase !== "Healthy") {
    return {
      tone: "bad",
      title: `Kubernetes is warning: ${blocking[0].reason}`,
      body: `${blocking[0].object}: ${blocking[0].message} ${blocking[0].hint ?? ""}`.trim()
    };
  }
  const progressing = stepByKey(currentSteps, "progressing");
  const healthy = stepByKey(currentSteps, "healthy");
  if (progressing?.status === "bad" || healthy?.status === "bad") {
    return {
      tone: "bad",
      title: `ArgoCD reports this environment as ${env.argoHealthStatus ?? "Degraded"}`,
      body: env.argoOperationMessage ? `Last operation: ${env.argoOperationMessage}` : "This started after the current sync operation finished, so it is a real problem, not a normal mid-apply dip. Try Refresh to re-check live state, or Sync to re-apply."
    };
  }
  const weight = env.workload?.kind === "Rollout" ? env.workload.canaryProgress?.currentWeight : void 0;
  const stepIndex = env.workload?.kind === "Rollout" ? env.workload.canaryProgress?.currentStepIndex : void 0;
  const totalSteps = env.workload?.kind === "Rollout" ? env.workload.canaryProgress?.steps.length : void 0;
  if (weight !== void 0 && weight < 100) {
    const stepText = stepIndex !== void 0 && totalSteps ? `step ${Math.min(stepIndex + 1, totalSteps)} of ${totalSteps}, ` : "";
    return {
      tone: "info",
      live: true,
      title: `Canary rollout in progress - ${stepText}${weight}% traffic`,
      body: `The Rollout controller is mid-canary at ${weight}% traffic. ArgoCD reports Synced/Progressing${env.argoOperationPhase === "Running" ? " (and its sync operation stays open until the PostSync hook runs after the canary finishes)" : ""} because of this, not because anything failed. No action needed unless this has sat here far longer than the step's own pause/analysis window.`
    };
  }
  if (env.argoOperationPhase === "Running" && stepByKey(currentSteps, "synced")?.status !== "good") {
    return {
      tone: "info",
      live: true,
      title: "A sync is currently being applied",
      body: "ArgoCD is actively applying this environment's manifests right now - sync/health status below may still read as the previous release's until this finishes."
    };
  }
  if (env.argoSyncStatus === "OutOfSync") {
    if (env.argoSyncPolicy?.automated) {
      return {
        tone: "info",
        title: "Out of sync, but automated sync is on",
        body: "ArgoCD should self-heal this shortly on its own poll cycle. If it stays out of sync for more than a few minutes, check the last operation result in the ArgoCD application panel below."
      };
    }
    return {
      tone: "bad",
      title: "Cluster state does not match what git declares",
      body: "Automated sync is off for this environment, so ArgoCD will not apply this on its own - use Sync above to apply it manually."
    };
  }
  if (env.argoHealthStatus === void 0 && env.argoSyncStatus === void 0) {
    return {
      tone: "info",
      title: "Couldn't reach ArgoCD for this environment",
      body: "Sync/health facts elsewhere on this page may be stale rather than wrong - try Refresh, and if this persists it may be an RBAC or connectivity issue rather than a release problem."
    };
  }
  const failedHooks = (env.argoResources ?? []).filter(
    (r) => r.kind === "Job" && r.name.includes("platform-outcome") && (r.health === "Degraded" || r.health === "Missing")
  );
  if (failedHooks.length > 0) {
    const hook = failedHooks[0];
    return {
      tone: "bad",
      title: `${hook.name} failed`,
      body: hook.message ?? `ArgoCD reports this release-outcome hook as ${hook.health}. The Application's own aggregate sync/health can still read fine if a later sync has since succeeded - see its log in the Application sync (or Rollout completes) stage detail for what happened.`
    };
  }
  if (env.argoHealthStatus === "Healthy" && env.argoSyncStatus === "Synced") {
    return {
      tone: "ok",
      title: "Synced and healthy",
      body: "ArgoCD reports this environment matches git and every managed resource is healthy. Nothing needs attention right now."
    };
  }
  return {
    tone: "info",
    title: `Sync: ${env.argoSyncStatus ?? "unknown"} \xB7 Health: ${env.argoHealthStatus ?? "unknown"}`,
    body: "No specific issue matched the rules above - see the ArgoCD application panel below for the full facts."
  };
}
function toneColors(t, tone, live = false) {
  if (live && tone === "info") return { border: t.amberLine, bg: t.amberSoft, fg: t.amberInk, icon: "i" };
  switch (tone) {
    case "ok":
      return { border: "#2c4a37", bg: t.goodSoft, fg: t.good, icon: "\u2713" };
    case "bad":
      return { border: t.bad, bg: t.badSoft, fg: t.bad, icon: "!" };
    case "info":
    default:
      return { border: t.skyLine, bg: t.skySoft, fg: t.sky, icon: "i" };
  }
}
const useStyles = makeStyles(() => ({
  "@keyframes livePulse": { "0%, 100%": { opacity: 1 }, "50%": { opacity: 0.55 } },
  livePulse: { animation: "$livePulse 1.6s ease-in-out infinite" },
  banner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "14px 18px",
    borderRadius: 10,
    border: ({ t, tone, live }) => `1px solid ${toneColors(t, tone, live).border}`,
    backgroundColor: ({ t, tone, live }) => toneColors(t, tone, live).bg
  },
  icon: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: 12,
    color: ({ t }) => t.bg,
    backgroundColor: ({ t, tone, live }) => toneColors(t, tone, live).fg
  },
  title: {
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 13,
    marginBottom: 3,
    color: ({ t, tone, live }) => toneColors(t, tone, live).fg
  },
  body: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo, lineHeight: 1.55 }
}));
const useDetailStyles = makeStyles(() => ({
  details: { marginTop: 10, display: "flex", flexDirection: "column", gap: 12 },
  head: { fontFamily: fontMono, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: ({ t }) => t.textLo, marginBottom: 4 },
  issue: { borderLeft: ({ t }) => `2px solid ${t.bad}`, paddingLeft: 10 },
  issueTitle: { fontWeight: 600, fontSize: 13, color: ({ t }) => t.textHi },
  mono: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo, lineHeight: 1.5, wordBreak: "break-word" },
  hint: { fontSize: 12.5, color: ({ t }) => t.textHi, marginTop: 2 },
  warn: { display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, fontSize: 12, padding: "3px 0" },
  link: { background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.sky, "&:hover": { textDecoration: "underline" } }
}));
function ProblemDetails({ env, issues, warnings }) {
  const t = useHangarTokens();
  const classes = useDetailStyles({ t });
  const [all, setAll] = useState(false);
  const [showAllWarnings, setShowAllWarnings] = useState(false);
  const shownWarnings = showAllWarnings ? warnings : warnings.slice(0, 5);
  return /* @__PURE__ */ jsxs("div", { className: classes.details, "aria-label": "What Kubernetes reports", children: [
    issues.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("div", { className: classes.head, children: "Problems with the pods" }),
      issues.map((i) => /* @__PURE__ */ jsxs("div", { className: classes.issue, style: { marginBottom: 8 }, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.issueTitle, children: [
          i.title,
          " ",
          /* @__PURE__ */ jsxs("span", { className: classes.mono, children: [
            "(",
            i.pods.length,
            " pod",
            i.pods.length === 1 ? "" : "s",
            ": ",
            i.pods.slice(0, 2).join(", "),
            i.pods.length > 2 ? ", \u2026" : "",
            ")"
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: classes.mono, children: i.detail }),
        /* @__PURE__ */ jsx("div", { className: classes.hint, children: i.hint })
      ] }, i.key))
    ] }),
    warnings.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("div", { className: classes.head, children: "Warnings in the last 30 minutes" }),
      shownWarnings.map((w) => /* @__PURE__ */ jsxs("div", { className: classes.warn, children: [
        /* @__PURE__ */ jsxs("span", { className: classes.mono, children: [
          w.reason,
          w.count > 1 ? ` \xD7${w.count}` : "",
          /* @__PURE__ */ jsx("br", {}),
          relativeTime(new Date(w.lastSeen).toISOString())
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx("span", { className: classes.mono, children: w.object }),
          ": ",
          w.message,
          w.hint && /* @__PURE__ */ jsx("div", { className: classes.hint, children: w.hint })
        ] })
      ] }, `${w.reason}-${w.message}`)),
      warnings.length > 5 && /* @__PURE__ */ jsx("button", { type: "button", className: classes.link, onClick: () => setShowAllWarnings((v) => !v), children: showAllWarnings ? "Show fewer warnings" : `Show ${warnings.length - 5} more` })
    ] }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("button", { type: "button", className: classes.link, onClick: () => setAll((v) => !v), "aria-expanded": all, children: all ? "Hide all events" : `Show all events in ${env.namespace}` }),
      all && /* @__PURE__ */ jsx(NamespaceEvents, { cluster: env.cluster, namespace: env.namespace })
    ] })
  ] });
}
function TroubleshootBanner({
  env,
  currentSteps,
  pods,
  events
}) {
  const t = useHangarTokens();
  const now = Date.now();
  const issues = podIssues(pods ?? [], now);
  const warnings = warningGroups(events ?? [], now);
  const diagnosis = diagnose(env, currentSteps, issues, warnings, now);
  const classes = useStyles({ t, tone: diagnosis.tone, live: Boolean(diagnosis.live) });
  const icon = toneColors(t, diagnosis.tone, diagnosis.live).icon;
  const showDetails = issues.length > 0 || diagnosis.tone !== "ok" && warnings.length > 0;
  return /* @__PURE__ */ jsxs("div", { className: classes.banner, children: [
    /* @__PURE__ */ jsx("span", { className: classes.icon, children: icon }),
    /* @__PURE__ */ jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [
      /* @__PURE__ */ jsx(Typography, { className: `${classes.title} ${diagnosis.live ? classes.livePulse : ""}`, children: diagnosis.title }),
      /* @__PURE__ */ jsx(Typography, { className: classes.body, children: diagnosis.body }),
      showDetails && /* @__PURE__ */ jsx(ProblemDetails, { env, issues, warnings })
    ] })
  ] });
}

export { TroubleshootBanner, diagnose };
//# sourceMappingURL=TroubleshootBanner.esm.js.map
