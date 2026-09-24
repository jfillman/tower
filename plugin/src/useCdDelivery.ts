import type { PullRequestSummary } from '../pullRequests/usePullRequests';
import { parseGitopsPrTitle } from './useReleaseContext';
import type { ArgoApplicationSummary, DeployHistoryEntry } from './types';

// The GitOps delivery pipeline for one environment: PR created -> PR merged
// -> Argo sync triggered -> App health: Progressing -> App healthy. Built
// entirely from data Tower already fetches elsewhere (gitops PRs, ArgoCD
// Application status) - no new backend route.
//
// The real constraint that shapes this whole module: ArgoCD's Application
// object only ever describes its OWN CURRENT state - `status.sync`/
// `status.health` are a snapshot, and the two timestamps it does carry
// (`operationState.startedAt`, `health.lastTransitionTime`) each answer "how
// long has the *current* state been true," not "when did an earlier,
// now-superseded release pass through this step" (confirmed live against a
// real Application - see ArgoApplicationSummary's own comment). So only the
// delivery that Argo's live status actually still describes - the most
// recently MERGED gitops PR for this env - can show real sync/health
// timestamps. A delivery that's since been superseded by a newer merge can
// only be shown as "it must have gone healthy, at some point we no longer
// know" (steps marked good, no timestamp claimed) - never a fabricated one.

export type CdStepKey = 'created' | 'guardrails' | 'merged' | 'synced' | 'progressing' | 'healthy';
export type CdStepStatus = 'good' | 'current' | 'bad' | 'pending';

export interface CdStep {
  key: CdStepKey;
  label: string;
  status: CdStepStatus;
  at?: string;
}

// A delivery is either PR-driven (Flight-tier envs go through a gitops PR
// gate) or a direct commit (Ground-tier envs promote by pushing straight to
// the gitops branch - see PromoteResult's 'direct-commit' mode, and
// buildCdEnvDelivery's own comment on why there's no PR to show for these).
// Exactly one of `pr`/`commit` is ever set.
export interface CdDelivery {
  pr?: PullRequestSummary;
  commit?: DeployHistoryEntry;
  steps: CdStep[];
}

export interface CdEnvDelivery {
  env: string;
  current?: CdDelivery;
  previous?: CdDelivery;
}

// 6-step model (2026-09-16 Deployments tab redesign, HANDOFF-tower-cicd-
// redesign.md): PR created -> Guardrails checked -> PR merged -> Sync
// triggered -> Rollout starts -> Rollout completes. `guardrails` is new
// (inserted between created/merged, see guardrailsSatisfied below);
// `progressing`/`healthy` keep their existing keys/semantics (still driven
// by ArgoCD's own Progressing/Healthy aggregate, see buildStepsCore's
// top-of-file comment) but read as "Rollout starts"/"Rollout completes" now
// that release gates and the ArgoCD sync step are visually distinct from
// the rollout itself.
const STEP_LABEL: Record<CdStepKey, string> = {
  created: 'PR created',
  guardrails: 'Guardrails checked',
  merged: 'PR merged',
  // Renamed from "Sync triggered" (2026-09-16 feedback round 3) now that
  // this stage's own detail panel shows real ArgoCD sync activity (out-of-
  // sync resources, the PreSync hook), not just a single "triggered" instant.
  synced: 'Application sync',
  progressing: 'Rollout starts',
  healthy: 'Rollout completes',
};

function envMatch(pr: PullRequestSummary, env: string): boolean {
  return parseGitopsPrTitle(pr.title)?.targetEnv.toLowerCase() === env.toLowerCase();
}

const ALL_STEP_KEYS: CdStepKey[] = ['created', 'guardrails', 'merged', 'synced', 'progressing', 'healthy'];
// A direct commit is already "on the branch" the moment it's pushed - there
// is no PR-open/PR-merged lifecycle to show a step for (2026-09-11: "the
// deploy pipeline for ground envs doesn't create a PR... probably just
// remove the first 2 stages").
const DIRECT_COMMIT_STEP_KEYS: CdStepKey[] = ['synced', 'progressing', 'healthy'];

// `argo` is only ever real for the delivery Argo's live status currently
// describes - see this file's own top comment. Callers pass `undefined` for
// a superseded delivery, which is what produces the "good, but no
// timestamp" steps below rather than a fabricated one. Shared by both the
// PR-gated (Flight-tier) and direct-commit (Ground-tier) delivery shapes -
// `merged`/`createdAt`/`mergedAt` just resolve differently for each.
//
// `mergedAt` doubles as "when did the new state land on the branch Argo
// watches" - direct-commit callers pass the commit's own date there instead
// of a PR merge time. Comparing it against argo.operationStartedAt catches a
// real race: ArgoCD's poll interval means it can take a few minutes to even
// NOTICE a new commit, so right after a merge/commit its syncStatus/
// healthStatus can still be reporting the PREVIOUS release's own "Synced" +
// "Healthy" - confirmed live 2026-09-11 (a fresh promotion to staging showed
// up as "previous" with "No active delivery," because the still-stale
// Synced+Healthy status read as this new delivery already being fully done).
// If Argo's last sync operation started before this merge/commit, its
// status can't possibly describe it yet, so synced/healthy/degraded are all
// forced false here regardless of what argo currently reports - the step
// this produces is 'current' (still in flight), never a false 'good'.
//
// `rolloutStillActive` catches a SECOND, distinct race (2026-09-11, same
// day, found live watching an actual in-flight canary): ArgoCD's
// Application-level health is an AGGREGATE across every resource it
// manages, so a clean canary that never drops any traffic can keep the
// whole Application reporting "Healthy" continuously THROUGH the entire
// rollout - `healthSince` then still names whenever that continuous streak
// actually began, which can be from a much OLDER release, long before this
// one's own PR was even opened. `argoStale` above can't catch this (the
// sync operation genuinely IS this release's - operationStartedAt is
// correctly recent), so without this, a still-canarying release read as
// already fully healthy the instant its PR merged, with a stale "healthy
// since" date attached that predates it. The Rollout's own live
// currentWeight (not Argo's aggregate) is the one signal that actually knows
// whether THIS canary has finished promoting - true canary progress caller
// passes as `rolloutStillActive: true` while currentWeight < 100.
// "Rollout starts" timestamp (2026-09-16: leaning towards "completes"
// semantics for App Sync/Rollout Starts/Rollout Completes alike). There's
// no separate "finished starting" event Argo Rollouts exposes - a rollout
// either hasn't begun or is already Progressing, no third state - so the
// closest real "this stage's transition completed" signal is
// `health.lastTransitionTime` for as long as the Application's current
// aggregate health genuinely reads 'Progressing' (i.e. exactly "since when
// has it been progressing"). ArgoCD keeps no history, though - the instant
// health flips again (to Healthy), that same field starts describing THAT
// transition instead, so once a rollout finishes there is no way to
// recover its "started progressing at" moment. Falls back to
// operationStartedAt in that case - a real, if coarser, signal ("the sync
// that triggered this began at X") rather than leaving an already-completed
// step with no timestamp at all.
function progressingAt(
  argoStale: boolean,
  healthStatus: string | undefined,
  healthSince: string | undefined,
  rolloutStarted: boolean,
  operationStartedAt: string | undefined,
): string | undefined {
  if (argoStale) return undefined;
  if (healthStatus === 'Progressing') return healthSince;
  if (rolloutStarted) return operationStartedAt;
  return undefined;
}

function buildStepsCore(
  keys: CdStepKey[],
  {
    merged,
    argo,
    createdAt,
    mergedAt,
    rolloutStillActive,
    rolloutFailed,
    guardrailsState,
    guardrailsCompletedAt,
  }: {
    merged: boolean;
    argo: ArgoApplicationSummary | undefined;
    createdAt?: string;
    mergedAt?: string;
    rolloutStillActive?: boolean;
    // The Rollout's own live status.phase === 'Degraded' (see EnvironmentSummary.rolloutPhase)
    // - a direct Kubernetes read, unlike everything else in this function
    // which comes from ArgoCD's Application object. Needed because a real
    // canary failure (a failed AnalysisRun the Rollout aborted on) doesn't
    // reliably flip ArgoCD's own operationPhase out of 'Running' - ArgoCD
    // can sit there retrying/reconciling against a Rollout that will never
    // recover on its own, which under `operationRunning`'s guard below would
    // otherwise force both `synced` and `degraded` false forever (2026-09-17
    // bug: "the 'App sync' stage stays stuck pulsing and the rollout starts
    // stage never advances" / "checkout-api-pre-prod's rollout failed with
    // no notification and the canary workflow just stalls" - confirmed live:
    // operationPhase was still reporting 'Running' long after the Rollout
    // itself had already gone Degraded). This is the same class of fix as
    // hookJobFailed below (a live resource-level signal overriding a stuck
    // operation phase), just for the Rollout's own health instead of a hook
    // Job's.
    rolloutFailed?: boolean;
    // The release PR's own aggregate GitHub Check Runs state
    // (PullRequestSummary.ci.state) - the concrete pre-merge "guardrails
    // checked" signal HANDOFF-tower-cicd-redesign.md's "Data gaps" section
    // asked for. Real while the PR is open, and now also for the single
    // most recently merged gitops PR (see pullRequests.ts's own comment) -
    // a merged PR is otherwise handled entirely through `merged` below,
    // since this platform's branch protection means a merge could only
    // happen once every required check already passed.
    guardrailsState?: 'success' | 'failure' | 'pending' | 'unknown';
    // PullRequestSummary.ci.completedAt - the real "guardrails finished
    // checking at X" instant (2026-09-16 bug report: "the guardrails
    // checked stage is missing the completion timestamp"). Same real-data-
    // only availability as guardrailsState above.
    guardrailsCompletedAt?: string;
  },
): CdStep[] {
  const argoStale = Boolean(
    mergedAt && argo?.operationStartedAt && new Date(argo.operationStartedAt).getTime() < new Date(mergedAt).getTime(),
  );
  // A sync operation that is genuinely Running right now is authoritative
  // over whatever syncStatus/healthStatus currently claim - those two
  // fields can lag a few seconds behind a just-started operation, still
  // reporting the PREVIOUS release's "Synced"/"Healthy" even though a brand
  // new sync has already begun (2026-09-12 bug: dev's active-delivery panel
  // showed "App Health: Progressing"/"App Healthy" as already satisfied,
  // with a stale 6h-old timestamp, moments after a fresh commit's sync had
  // just been triggered). Distinct from argoStale above, which only catches
  // an operationStartedAt that's OLDER than mergedAt - this catches the
  // opposite direction: a fresh operation whose health/sync fields just
  // haven't caught up to it yet. Doesn't gate `synced`'s own `at` below -
  // operationStartedAt is accurate the moment an operation begins,
  // regardless of whether it's finished.
  const operationRunning = argo?.operationPhase === 'Running';
  const synced = !argoStale && !operationRunning && argo?.syncStatus === 'Synced';
  const healthStatus = argo?.healthStatus;
  const healthy = !argoStale && !operationRunning && !rolloutStillActive && healthStatus === 'Healthy';
  // Gated by !operationRunning too - a normal rolling sync can genuinely
  // dip through a transient "Degraded" reading mid-apply (old pods
  // terminating before new ones are ready), which isn't a real failure
  // until the operation actually finishes and it's STILL not healthy.
  // Surfacing it as 'bad' while a sync is still actively running would be a
  // false failure alarm on an entirely normal in-flight deploy.
  // `rolloutFailed` bypasses the `!operationRunning` guard on purpose - see
  // its own param comment. The softer `healthStatus === 'Degraded'` reading
  // stays gated behind it (a transient mid-apply dip is still not a real
  // failure), but a live Rollout-level Degraded is real regardless of
  // whatever ArgoCD's own operation phase currently claims.
  const degraded = !argoStale && (rolloutFailed || (!operationRunning && healthStatus === 'Degraded'));
  // A sync operation that's genuinely broken - either ArgoCD itself gave up
  // on it (operationState.phase a terminal 'Error'/'Failed') OR a release-
  // outcome hook Job (platform-outcome-presync/postsync) is sitting
  // Degraded/Missing in the live resource tree right now. The second check
  // is the one that actually matters in practice (2026-09-16 bug, round 2:
  // "the 'App sync' stage is still stuck, it pulses and never sets its
  // timestamp" - operationPhase alone wasn't enough, confirmed still
  // reproducing after the first fix: a Kubernetes-level Job deadline
  // failure (activeDeadlineSeconds) doesn't reliably get reflected in
  // ArgoCD's own operationState.phase, which can sit 'Running' forever even
  // though the hook itself will never complete). Without this, `synced`
  // could never become true (the hook keeps failing) AND never get marked
  // 'bad' either, leaving `gapAssigned` stuck on it as an eternal 'current'
  // pulse with the two rollout steps behind it stuck 'pending' forever too
  // - visually indistinguishable from a live in-progress sync. `resources`
  // is the SAME live resource-tree entries StageDetail's own findHookJob
  // reads - not stale: hook-delete-policy: BeforeHookCreation means a
  // Degraded entry here reflects the MOST RECENT hook run for that
  // resource, not a leftover from some earlier, since-resolved failure.
  const hookJobFailed = (argo?.resources ?? []).some(
    r => r.kind === 'Job' && r.name.includes('platform-outcome') && (r.health === 'Degraded' || r.health === 'Missing'),
  );
  // `rolloutFailed` included here too (not just in `degraded` above) - a
  // real Rollout failure has to actually resolve the DAG's gap at `synced`
  // (the first still-unsatisfied step while operationRunning is stuck),
  // otherwise it never reaches the `degraded` check at 'progressing'/
  // 'healthy' at all - `gapAssigned` below only ever evaluates the FIRST
  // unsatisfied step. Without this, a genuinely failed rollout left `synced`
  // pulsing 'current' forever instead of surfacing as the real failure it is.
  const syncOperationFailed =
    !argoStale && (argo?.operationPhase === 'Error' || argo?.operationPhase === 'Failed' || hookJobFailed || Boolean(rolloutFailed));

  // `progressing` ("Rollout starts", see STEP_LABEL) fires the moment the
  // rollout genuinely begins - not gated on `healthy` the way the old
  // 5-step model's identically-named field was (that field meant "the
  // whole in-flight journey," a single node; the 6-step split gives
  // "starts" and "completes" their own distinct real-world instants, so
  // conflating them is exactly the bug this comment used to cause: 2026-09-16
  // report, "the rollout starts stage has the same timestamp as the rollout
  // completes stage" - both read `healthSince` because both were gated on
  // the same `healthy` boolean). Deliberately NOT gated on bare
  // `operationRunning` (only on `synced`, which already excludes it) -
  // `synced` requires the sync operation to have actually settled, so
  // "Rollout starts" only ever goes green once "Sync triggered" has too,
  // keeping the DAG's left-to-right order honest rather than letting this
  // node race ahead of an earlier one that's still mid-apply.
  // `rolloutStillActive`/`healthy` are each independently real evidence too
  // - `healthy` alone covers a fast/no-canary deploy that's already fully
  // done by the time this evaluates (it obviously started at some point).
  const rolloutStarted = merged && !argoStale && (synced || Boolean(rolloutStillActive) || healthy);
  // Once merged, guardrails must already have passed - this platform's
  // branch protection requires every required check green before a merge
  // can happen at all, so `merged` alone is authoritative there and
  // guardrailsState (which the backend stops fetching post-merge anyway,
  // see this function's own param comment) never needs consulting. Only
  // while the PR is still open does the live ci.state decide it.
  const guardrailsPassed = merged || guardrailsState === 'success';
  const guardrailsFailing = !merged && guardrailsState === 'failure';
  const satisfied: Record<CdStepKey, boolean> = {
    created: true,
    guardrails: guardrailsPassed,
    merged,
    synced: merged && synced,
    progressing: rolloutStarted,
    healthy: merged && healthy,
  };
  // Every argo-sourced date here is only real for THIS delivery once the
  // corresponding boolean above actually trusts it - `synced` was missing
  // this guard entirely (2026-09-12 bug: "the 'ArgoCD sync triggered' stage
  // has a date... over an hour older than the first 2 stages") - while
  // argoStale, operationStartedAt is last release's sync, not this one's,
  // and showed through even though the step correctly rendered as 'current'
  // rather than 'good'. healthSince has the same issue whenever argoStale,
  // operationRunning, OR rolloutStillActive overrode Argo's aggregate health
  // - see this function's own top comment (operationRunning added
  // 2026-09-12: healthSince while a fresh sync is still actively running is
  // whatever streak predates THIS operation, not a real completion time for
  // it). Blank rather than attach a real-looking but wrong (older) date to a
  // step that hasn't actually happened yet.
  const at: Record<CdStepKey, string | undefined> = {
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
    synced: argoStale || operationRunning ? undefined : argo?.operationFinishedAt,
    progressing: progressingAt(argoStale, healthStatus, argo?.healthSince, rolloutStarted, argo?.operationStartedAt),
    healthy: argoStale || operationRunning || rolloutStillActive ? undefined : argo?.healthSince,
  };

  let gapAssigned = false;
  return keys.map(key => {
    if (satisfied[key]) return { key, label: STEP_LABEL[key], status: 'good' as const, at: at[key] };
    if (!gapAssigned) {
      gapAssigned = true;
      // A real ArgoCD health of "Degraded" at the sync/progressing/healthy
      // steps means something is actually wrong (confirmed live: order-api-
      // prod is currently Progressing with a real repo-server connection
      // error) - surfaced as a failed step, not just "still waiting."
      const isFailing =
        (key === 'guardrails' && guardrailsFailing) ||
        (key === 'synced' && syncOperationFailed) ||
        (degraded && (key === 'progressing' || key === 'healthy'));
      return { key, label: STEP_LABEL[key], status: isFailing ? ('bad' as const) : ('current' as const), at: at[key] };
    }
    return { key, label: STEP_LABEL[key], status: 'pending' as const };
  });
}

function buildSteps(
  pr: PullRequestSummary,
  argo: ArgoApplicationSummary | undefined,
  rolloutStillActive?: boolean,
  rolloutFailed?: boolean,
): CdStep[] {
  return buildStepsCore(ALL_STEP_KEYS, {
    merged: pr.state === 'merged',
    argo,
    createdAt: pr.createdAt,
    mergedAt: pr.mergedAt,
    rolloutStillActive,
    rolloutFailed,
    guardrailsState: pr.ci?.state,
    guardrailsCompletedAt: pr.ci?.completedAt,
  });
}

function buildCommitSteps(
  argo: ArgoApplicationSummary | undefined,
  commitDate: string,
  rolloutStillActive?: boolean,
  rolloutFailed?: boolean,
): CdStep[] {
  return buildStepsCore(DIRECT_COMMIT_STEP_KEYS, { merged: true, argo, mergedAt: commitDate, rolloutStillActive, rolloutFailed });
}

// All-good, no-timestamp steps for a delivery Argo's live status has already
// moved past - see this file's own top comment.
function supersededStepAt(key: CdStepKey, pr: PullRequestSummary): string | undefined {
  if (key === 'created') return pr.createdAt;
  if (key === 'merged') return pr.mergedAt;
  return undefined;
}

function buildSupersededSteps(pr: PullRequestSummary): CdStep[] {
  return ALL_STEP_KEYS.map(key => ({
    key,
    label: STEP_LABEL[key],
    status: 'good' as const,
    at: supersededStepAt(key, pr),
  }));
}

function buildSupersededCommitSteps(): CdStep[] {
  return DIRECT_COMMIT_STEP_KEYS.map(key => ({ key, label: STEP_LABEL[key], status: 'good' as const }));
}

export function buildCdEnvDelivery(
  env: string,
  gitopsPrs: PullRequestSummary[],
  argo: ArgoApplicationSummary | undefined,
  // Only ever consulted when this env has no gitops PR at all - see the
  // direct-commit branch below. Passed in rather than fetched here since
  // useReleaseContext already fetches it for every env (Overview's "Recent
  // images" section).
  deployHistory?: DeployHistoryEntry[],
  // The Rollout's own live currentWeight < 100 - see buildStepsCore's own
  // comment on why Argo's aggregate health alone can't be trusted to say
  // this delivery has actually finished promoting.
  rolloutStillActive?: boolean,
  // The Rollout's own live status.phase === 'Degraded' - see
  // buildStepsCore's own comment on why this needs to be a distinct signal
  // from rolloutStillActive/Argo's aggregate health.
  rolloutFailed?: boolean,
): CdEnvDelivery {
  const envPrs = [...gitopsPrs]
    .filter(pr => envMatch(pr, env))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  // Ground-tier envs promote by pushing a commit straight to the gitops
  // branch, never through a PR (2026-09-11) - if this env has never had a
  // gitops PR, there's no PR lifecycle to render, only whatever Argo can say
  // about the most recent commit-triggered deploy history entry.
  if (envPrs.length === 0) {
    const history = deployHistory ?? [];
    const latest = history[history.length - 1];
    if (!latest) return { env };
    const steps = buildCommitSteps(argo, latest.date, rolloutStillActive, rolloutFailed);
    const fullyHealthy = steps.every(s => s.status === 'good');
    const previousEntry = history[history.length - 2];
    if (fullyHealthy) {
      return { env, previous: { commit: latest, steps } };
    }
    return {
      env,
      current: { commit: latest, steps },
      previous: previousEntry ? { commit: previousEntry, steps: buildSupersededCommitSteps() } : undefined,
    };
  }

  const openPr = envPrs.find(pr => pr.state === 'open');
  const mergedPrs = envPrs
    .filter(pr => pr.state === 'merged')
    .sort((a, b) => new Date(b.mergedAt ?? b.updatedAt).getTime() - new Date(a.mergedAt ?? a.updatedAt).getTime());
  const deployedPr = mergedPrs[0];
  const olderMergedPr = mergedPrs[1];

  if (openPr) {
    // A newer PR is open on top of whatever's currently deployed - nothing
    // has synced for it yet, so its own steps stop at "merged: pending."
    // Argo's live status still describes deployedPr, so that becomes
    // "previous" with real data.
    return {
      env,
      current: { pr: openPr, steps: buildSteps(openPr, undefined) },
      previous: deployedPr ? { pr: deployedPr, steps: buildSteps(deployedPr, argo, rolloutStillActive, rolloutFailed) } : undefined,
    };
  }

  if (!deployedPr) return { env };

  const deployedSteps = buildSteps(deployedPr, argo, rolloutStillActive, rolloutFailed);
  const deployedFullyHealthy = deployedSteps.every(s => s.status === 'good');

  if (deployedFullyHealthy) {
    // Nothing in flight - deployedPr is simply the last delivery, shown as
    // "previous" (with real timestamps, since Argo's status still describes
    // it) so the panel doesn't sit empty between releases.
    return { env, previous: { pr: deployedPr, steps: deployedSteps } };
  }

  return {
    env,
    current: { pr: deployedPr, steps: deployedSteps },
    previous: olderMergedPr ? { pr: olderMergedPr, steps: buildSupersededSteps(olderMergedPr) } : undefined,
  };
}
