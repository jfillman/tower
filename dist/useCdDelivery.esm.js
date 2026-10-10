import { parseGitopsPrTitle } from './useReleaseContext.esm.js';

const STEP_LABEL = {
  created: "PR created",
  guardrails: "Guardrails checked",
  merged: "PR merged",
  // Renamed from "Sync triggered" (2026-09-16 feedback round 3) now that
  // this stage's own detail panel shows real ArgoCD sync activity (out-of-
  // sync resources), not just a single "triggered" instant.
  synced: "Application sync",
  progressing: "Rollout starts",
  healthy: "Rollout completes"
};
function envMatch(pr, env) {
  return parseGitopsPrTitle(pr.title)?.targetEnv.toLowerCase() === env.toLowerCase();
}
const ALL_STEP_KEYS = ["created", "guardrails", "merged", "synced", "progressing", "healthy"];
const DIRECT_COMMIT_STEP_KEYS = ["synced", "progressing", "healthy"];
function progressingAt(argoStale, healthStatus, healthSince, rolloutStarted, operationStartedAt) {
  if (argoStale) return void 0;
  if (healthStatus === "Progressing") return healthSince;
  if (rolloutStarted) return operationStartedAt;
  return void 0;
}
function buildStepsCore(keys, {
  merged,
  argo,
  createdAt,
  mergedAt,
  rolloutStillActive,
  rolloutFailed,
  guardrailsState,
  guardrailsCompletedAt
}) {
  const argoStale = Boolean(
    mergedAt && argo?.operationStartedAt && new Date(argo.operationStartedAt).getTime() < new Date(mergedAt).getTime()
  );
  const operationRunning = argo?.operationPhase === "Running";
  const healthSinceMs = argo?.healthSince ? new Date(argo.healthSince).getTime() : void 0;
  const operationStartedMs = argo?.operationStartedAt ? new Date(argo.operationStartedAt).getTime() : void 0;
  const healthyThisOperation = argo?.healthStatus === "Healthy" && healthSinceMs !== void 0 && operationStartedMs !== void 0 && healthSinceMs >= operationStartedMs;
  const appliedDespiteRunning = Boolean(rolloutStillActive) || argo?.healthStatus === "Progressing" || healthyThisOperation;
  const synced = !argoStale && argo?.syncStatus === "Synced" && (!operationRunning || appliedDespiteRunning);
  const healthStatus = argo?.healthStatus;
  const healthy = !argoStale && !rolloutStillActive && healthStatus === "Healthy" && (!operationRunning || healthyThisOperation);
  const degraded = !argoStale && (rolloutFailed || !operationRunning && healthStatus === "Degraded");
  const syncOperationFailed = !argoStale && (argo?.operationPhase === "Error" || argo?.operationPhase === "Failed" || Boolean(rolloutFailed));
  const rolloutStarted = merged && !argoStale && (healthy || synced && !rolloutStillActive && healthStatus !== "Progressing");
  const guardrailsPassed = merged || guardrailsState === "success";
  const guardrailsFailing = !merged && guardrailsState === "failure";
  const satisfied = {
    created: true,
    guardrails: guardrailsPassed,
    merged,
    synced: merged && synced,
    progressing: rolloutStarted,
    healthy: merged && healthy
  };
  let syncedAt;
  if (!argoStale) {
    if (!operationRunning) syncedAt = argo?.operationFinishedAt;
    else if (synced) {
      syncedAt = healthSinceMs !== void 0 && operationStartedMs !== void 0 && healthSinceMs >= operationStartedMs ? argo?.healthSince : argo?.operationStartedAt;
    }
  }
  const at = {
    created: createdAt,
    // The real "guardrails finished checking at X" instant - the backend's
    // own aggregate across every required check run's completed_at (see
    // PrCiStatus.completedAt), undefined until none are still pending.
    guardrails: guardrailsCompletedAt,
    merged: mergedAt,
    // When the sync operation actually FINISHED, not when it started
    // (2026-09-16: "the timestamp for the 'Application Sync' stage should
    // be when the argo app finishes syncing all its resources") - blank
    // while still genuinely running, same "no timestamp until it's really
    // done" posture as guardrails/healthy below, rather than the started-at
    // instant this used to show.
    // While the operation is still 'Running' only because a PostSync hook is
    // waiting on the canary (see appliedDespiteRunning), there's no
    // operationFinishedAt yet - the app's own Progressing transition is the
    // closest real "the apply finished" instant.
    synced: syncedAt,
    progressing: progressingAt(argoStale, healthStatus, argo?.healthSince, rolloutStarted, argo?.operationStartedAt),
    healthy: healthy ? argo?.healthSince : void 0
  };
  let gapAssigned = false;
  return keys.map((key) => {
    if (satisfied[key]) return { key, label: STEP_LABEL[key], status: "good", at: at[key] };
    if (!gapAssigned) {
      gapAssigned = true;
      const isFailing = key === "guardrails" && guardrailsFailing || key === "synced" && syncOperationFailed || degraded && (key === "progressing" || key === "healthy");
      return { key, label: STEP_LABEL[key], status: isFailing ? "bad" : "current", at: at[key] };
    }
    return { key, label: STEP_LABEL[key], status: "pending" };
  });
}
function buildSteps(pr, argo, rolloutStillActive, rolloutFailed) {
  return buildStepsCore(ALL_STEP_KEYS, {
    merged: pr.state === "merged",
    argo,
    createdAt: pr.createdAt,
    mergedAt: pr.mergedAt,
    rolloutStillActive,
    rolloutFailed,
    guardrailsState: pr.ci?.state,
    guardrailsCompletedAt: pr.ci?.completedAt
  });
}
function buildCommitSteps(argo, commitDate, rolloutStillActive, rolloutFailed) {
  return buildStepsCore(DIRECT_COMMIT_STEP_KEYS, { merged: true, argo, mergedAt: commitDate, rolloutStillActive, rolloutFailed });
}
function supersededStepAt(key, pr) {
  if (key === "created") return pr.createdAt;
  if (key === "merged") return pr.mergedAt;
  return void 0;
}
function buildSupersededSteps(pr) {
  return ALL_STEP_KEYS.map((key) => ({
    key,
    label: STEP_LABEL[key],
    status: "good",
    at: supersededStepAt(key, pr)
  }));
}
function buildSupersededCommitSteps() {
  return DIRECT_COMMIT_STEP_KEYS.map((key) => ({ key, label: STEP_LABEL[key], status: "good" }));
}
function buildCdEnvDelivery(env, gitopsPrs, argo, deployHistory, rolloutStillActive, rolloutFailed) {
  const envPrs = [...gitopsPrs].filter((pr) => envMatch(pr, env)).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  if (envPrs.length === 0) {
    const history = deployHistory ?? [];
    const latest = history[history.length - 1];
    if (!latest) return { env };
    const steps = buildCommitSteps(argo, latest.date, rolloutStillActive, rolloutFailed);
    const fullyHealthy = steps.every((s) => s.status === "good");
    const previousEntry = history[history.length - 2];
    if (fullyHealthy) {
      return { env, previous: { commit: latest, steps } };
    }
    return {
      env,
      current: { commit: latest, steps },
      previous: previousEntry ? { commit: previousEntry, steps: buildSupersededCommitSteps() } : void 0
    };
  }
  const openPr = envPrs.find((pr) => pr.state === "open");
  const mergedPrs = envPrs.filter((pr) => pr.state === "merged").sort((a, b) => new Date(b.mergedAt ?? b.updatedAt).getTime() - new Date(a.mergedAt ?? a.updatedAt).getTime());
  const deployedPr = mergedPrs[0];
  const olderMergedPr = mergedPrs[1];
  if (openPr) {
    return {
      env,
      current: { pr: openPr, steps: buildSteps(openPr, void 0) },
      previous: deployedPr ? { pr: deployedPr, steps: buildSteps(deployedPr, argo, rolloutStillActive, rolloutFailed) } : void 0
    };
  }
  if (!deployedPr) return { env };
  const deployedSteps = buildSteps(deployedPr, argo, rolloutStillActive, rolloutFailed);
  const deployedFullyHealthy = deployedSteps.every((s) => s.status === "good");
  if (deployedFullyHealthy) {
    return { env, previous: { pr: deployedPr, steps: deployedSteps } };
  }
  return {
    env,
    current: { pr: deployedPr, steps: deployedSteps },
    previous: olderMergedPr ? { pr: olderMergedPr, steps: buildSupersededSteps(olderMergedPr) } : void 0
  };
}

export { buildCdEnvDelivery };
//# sourceMappingURL=useCdDelivery.esm.js.map
