import { useMemo } from 'react';
import type { PullRequestSummary } from '../pullRequests/usePullRequests';
import type { PipelineRunSummary } from './tekton/types';
import type { ProvenanceState } from './useReleaseData';
import { gitopsPrForEnvAndImage } from './useReleaseContext';
import type { ReleaseRow } from './useReleaseContext';
import {
  envTierOf,
  extractShortShaFromImageTag,
  health,
  imageTag,
  type CanaryStepDef,
  type EnvironmentSummary,
  type ProvenanceResponse,
  type WorkloadDetail,
} from './types';

// The Release Record - HANDOFF-tower-release-record.md's design, Phase 1
// ("read-only, no new infra"). That handoff sketched a ReleaseRecord shape
// speculatively, before checking what real data would actually be behind
// each field; this is the version grounded against Tower's real hooks, with
// two deliberate departures from the sketch once the real data was in hand:
//
//   - No `testResults`/`securityScans` suite-level pass/total numbers - no
//     real source anywhere in this codebase produces that shape (Tekton
//     TaskResults are free-form name/value pairs, not a suite tally). The
//     real equivalent this platform actually has is the release-guardrails
//     Check Run ledger already fetched onto every gitops PR (PullRequestSummary
//     .ci - see SignalRail.tsx's GateLedger, which this reuses) - `guardrails`
//     below, not a fabricated split. `testResults` (added 2026-09-17, once
//     Tekton Results made this possible - see findRelatedPipelineRuns/
//     buildTestResults below) is a flat TaskResult list for exactly this
//     reason, not a revision of this decision - still no pass/total tally.
//   - No `humanContext`, no persisted record, no `incidents[]` with real
//     entries - none of that exists without the Phase 2 backend route this
//     handoff explicitly defers. `incidents` stays present (typed) but is
//     always `[]` for the same reason ReleaseLog.tsx never fabricates a
//     drift-detection row: no persisted history to back it with yet.
export interface ChangeCategoryCounts {
  features: number;
  fixes: number;
  chores: number;
}

export interface ReleaseRecordDeployment {
  env: string;
  cluster: string;
  deployedAt: string;
  // Whether this release's own image is THIS env's live image right now -
  // argoRevision/rolloutStrategy/canarySteps are only ever real for the
  // current occupant of an environment (Tower has no persisted history of a
  // past rollout's own step config), so those three are only ever populated
  // when this is true.
  isLive: boolean;
  argoRevision?: string;
  rolloutStrategy?: WorkloadDetail['strategyKind'];
  canarySteps?: CanaryStepDef[];
}

export interface ReleaseRecordPromotion {
  fromEnv: string;
  toEnv: string;
  at: string;
  prUrl?: string;
  prNumber?: number;
  mergedAt?: string;
}

export interface ReleaseRecordCommit {
  sha: string;
  date: string;
  env: string;
}

// Multiple envs can carry the same source sha (e.g. a promotion that
// fast-forwarded without its own distinct gitops commit) - collapse those
// before display so a "no PRs found" fallback doesn't repeat identical rows.
// Shared by ReleaseRecordDetail.tsx and ReleaseRecordExport.ts so the live
// page and the downloadable copy can't drift on this logic.
export function dedupeCommits(commits: ReleaseRecordCommit[]): ReleaseRecordCommit[] {
  const seen = new Set<string>();
  return commits.filter(c => (seen.has(c.sha) ? false : (seen.add(c.sha), true)));
}

export interface ReleaseRecordTestResult {
  taskName: string;
  resultName: string;
  value: string;
}

export interface ReleaseRecordSecurityScan {
  scanner: string;
  outcome?: string;
  findingsSummary?: string;
}

export type ReleaseRecordStatus = 'healthy' | 'degraded' | 'superseded';

export interface ReleaseRecord {
  id: string;
  appName: string;
  imageTag: string;
  image?: string;
  imageDigest?: string;
  version?: string;
  createdAt: string;
  // Live in a Flight-tier env RIGHT NOW - distinct from ReleaseRow.current
  // (useReleaseContext.ts), which flags whichever image the LOWEST env is
  // currently running. A record's own "current" is about prod, not dev.
  current: boolean;
  status: ReleaseRecordStatus;

  pullRequests: PullRequestSummary[];
  changeCategories: ChangeCategoryCounts;
  commits: ReleaseRecordCommit[];

  pipelineRun?: PipelineRunSummary;
  // Every stage of this release's own flow, build/test/deploy/release alike
  // (correlated via flowSlug - see findRelatedPipelineRuns), not just the
  // build run `pipelineRun` above carries - 2026-09-17 ask: "every related
  // pipeline run, info about it, its results, should be in there." Includes
  // `pipelineRun` itself when a match was found.
  pipelineRuns: PipelineRunSummary[];
  // Flattened TaskResults from every run in pipelineRuns whose own
  // `pipelineName` is the app's `test` cicd.yaml stage - see
  // buildTestResults's own comment for why this stays a flat list rather
  // than a fabricated pass/total tally.
  testResults: ReleaseRecordTestResult[];
  // sast-scan/image-scan's own outcome+findings, read directly from the
  // build-stage PipelineRun - see buildSecurityScans's own comment for why
  // this exists separately from testResults (different stage, different
  // shape - multi-line findings text, not a flat name/value pair) and why
  // it's not just a duplicate of the guardrails ledger below.
  securityScans: ReleaseRecordSecurityScan[];
  provenance?: ProvenanceResponse;
  nickname?: string;
  hasSbom: boolean;

  guardrails?: NonNullable<PullRequestSummary['ci']>;
  guardrailsPrUrl?: string;
  guardrailsPrNumber?: number;

  deployments: ReleaseRecordDeployment[];
  promotionChain: ReleaseRecordPromotion[];
  // Always [] in Phase 1 - see this file's header comment. Kept typed (not
  // removed) so Phase 3's incident-linkage idea (HANDOFF's "Where this could
  // go next" #02) has a field to append to without a breaking type change.
  incidents: never[];

  // v1 heuristic, deliberately simple - see computeConfidence below. Phase 2
  // folds in real human approvals once humanContext exists.
  confidence: number;
}

// This platform's real image-tagging convention is "<version>-<7-char-sha>"
// (see types.ts's extractShortShaFromImageTag) - the inverse extraction,
// used for the record's own display version. A bare-sha tag (pull_request
// builds) has no separate version to show, so this returns undefined rather
// than the sha itself - imageTag/nickname already cover that display.
function versionFromImageTag(tag: string): string | undefined {
  return tag.match(/^(.+)-[0-9a-f]{7,40}$/i)?.[1];
}

// Same short-sha-prefix match nicknameForImageTag (useReleaseContext.ts)
// uses, returning the run itself rather than just its flowSlug - the
// record's "What was built" column needs the run's own params/results, not
// only its nickname chip. Only the git-triggered BUILD stage ever carries
// this sha annotation (pipelinesascode.tekton.dev/sha) - a CDEvent-triggered
// downstream stage (test/deploy/release) has none of its own, which is
// exactly why this only ever finds the one build run, not the whole flow -
// see findRelatedPipelineRuns below for that.
//
// RESOLVED 2026-09-17 (was "KNOWN PHASE 1 GAP" here): `pipelineRuns` is now
// useReleaseContext.ts's own merged live+Tekton-Results view
// (useTektonResultsRuns.ts), not the bare live in-cluster list - a release
// old enough to have actually reached a Flight env (which, by construction,
// is every release this whole file ever builds a record for) resolves
// against the durable archive instead of coming up empty once Tekton's own
// watcher deletes the live object (now within ~1h of completion). This
// function itself needed no change - the fix lives entirely in what list
// gets passed in.
function findPipelineRunForTag(tag: string, pipelineRuns: PipelineRunSummary[]): PipelineRunSummary | undefined {
  const shortSha = extractShortShaFromImageTag(tag);
  if (!shortSha) return undefined;
  return pipelineRuns.find(r => r.sha?.toLowerCase().startsWith(shortSha.toLowerCase()));
}

// Every stage of the SAME flow as the build run found above - build's own
// sha match can't extend to test/deploy/release (they carry no sha of their
// own, see findPipelineRunForTag's comment), so this correlates by
// flowSlug/chain-id instead, the exact mechanism useTektonPipelineRuns.ts's
// linkFlowSlugsByChainId already establishes and visually confirms elsewhere
// in Tower (every stage of one execution shares one colored chip). A build
// run with no flowSlug at all (a chain this platform's own chain-slug
// TaskResult predates, or a genuinely standalone build) just returns itself
// - no flow to correlate against, not an error.
function findRelatedPipelineRuns(
  buildRun: PipelineRunSummary | undefined,
  pipelineRuns: PipelineRunSummary[],
): PipelineRunSummary[] {
  if (!buildRun) return [];
  if (!buildRun.flowSlug) return [buildRun];
  return pipelineRuns
    .filter(r => r.flowSlug === buildRun.flowSlug)
    .sort((a, b) => new Date(a.startTime ?? 0).getTime() - new Date(b.startTime ?? 0).getTime());
}

// Every Task in this platform's catalog writes these two span-timing results
// (catalog/tasks/*.yaml's own otel_task_span_send convention) purely for
// tracing - never a real test outcome, but indistinguishable from one to a
// blind flatten of every TaskResult. Excluded defensively here rather than
// assuming a future catalog Task won't also happen to emit them.
const NON_TEST_RESULT_NAMES = new Set(['span-start-time', 'span-end-time']);

// Flattened, not a fabricated pass/total tally - same "no real source
// produces that shape" reasoning this file's own header comment already
// gives for `guardrails` replacing testResults/securityScans in the
// original speculative sketch. A Tekton TaskResult is a free-form name/value
// pair; the closest thing to "the test results" this platform actually has
// is every result any TaskRun produced under a run whose own resolved
// Pipeline is this app's `test` cicd.yaml stage (types.ts's
// CICD_TOP_LEVEL_FIELDS, mirroring the already-confirmed-live
// `pipelineName === 'build'` convention useReleaseContext.ts's own
// build-only-pipeline backfill uses for the 'build' stage).
//
// KNOWN GAP, 2026-09-22 (confirmed by reading the actual Task specs, not
// assumed): as of today neither catalog Task that runs in the `test` stage
// writes a real per-test result - run-tests.yaml declares only the two
// span-timing results above (no pass/fail, no count), and qa-gate.yaml is a
// declared stub (hangar.io/stub: "true", always succeeds). run-testworkflow.yaml
// (the Testkube integration path) computes a real status internally
// (polls TestWorkflowExecution for result.status/result.steps) but never
// writes it out as a Task result - only uses it to decide its own exit code.
// So this function will return [] for every real app until the catalog
// itself is fixed to actually produce something - no amount of filtering
// here can surface a result that was never written. See
// docs/admin/release-guardrails.md's own gap tracking once that catalog fix
// lands (glidepath's own repo, not this one).
function buildTestResults(relatedRuns: PipelineRunSummary[]): ReleaseRecordTestResult[] {
  const results: ReleaseRecordTestResult[] = [];
  relatedRuns
    .filter(r => r.pipelineName === 'test')
    .forEach(r => {
      Object.values(r.taskRunsByPipelineTask).forEach(tr => {
        tr.results
          .filter(res => !NON_TEST_RESULT_NAMES.has(res.name))
          .forEach(res => results.push({ taskName: tr.pipelineTaskName, resultName: res.name, value: res.value }));
      });
    });
  return results;
}

// Real data, unlike buildTestResults above: sast-scan.yaml and image-scan.yaml
// (catalog Tasks that run in the `build` stage, alongside build-image/
// generate-sbom/etc - never `test`) both declare a real `outcome`
// ('passed'/'failed', 'error' for image-scan) plus a `findings-summary` -
// up to 8 real findings (severity/rule-id/file:line for SAST,
// severity/CVE/package for image-scan), already self-capped by the Task
// itself, not re-capped here. Named by pipelineTaskName, not inferred from
// pipelineName, since both tasks run inside the SAME `build` PipelineRun
// alongside several others - only these two specific task names are ever
// looked at.
//
// This is genuinely new information to the record, not a duplicate of the
// guardrails ledger's own check messages: image-scan's findings do already
// reach that ledger today (comment-pr-check-result.yaml threads its
// findings-summary into the gitops PR's Check Run message), but SAST's do
// not - sast-check.yaml (the gitops-repo re-verification pipeline) verifies
// the build's SLSA attestation rather than re-running sast-scan, so the
// original scan's findings text never reaches that PR's Check Run at all.
// Reading straight from the build-stage PipelineRun here bypasses that gap
// entirely for both scanners, rather than depending on whichever of them
// happens to have a PR-comment path today.
const SECURITY_SCAN_TASK_NAMES = ['sast-scan', 'image-scan'] as const;

function buildSecurityScans(relatedRuns: PipelineRunSummary[]): ReleaseRecordSecurityScan[] {
  const buildRun = relatedRuns.find(r => r.pipelineName === 'build');
  if (!buildRun) return [];
  const scans: ReleaseRecordSecurityScan[] = [];
  SECURITY_SCAN_TASK_NAMES.forEach(scanner => {
    const tr = buildRun.taskRunsByPipelineTask[scanner];
    if (!tr) return;
    const outcome = tr.results.find(res => res.name === 'outcome')?.value;
    const findingsSummary = tr.results.find(res => res.name === 'findings-summary')?.value;
    if (outcome === undefined && findingsSummary === undefined) return;
    scans.push({ scanner, outcome, findingsSummary });
  });
  return scans;
}

// No SBOM predicateType constant exists anywhere in this codebase today
// (classifyGhcrVersion's GHCR-tag-naming match is a different mechanism,
// for the Images tab's own package-version list) - a real CycloneDX/SPDX
// attestation predicate is the only honest signal available here, matched
// by name rather than invented wholesale.
function hasSbomAttestation(provenance: ProvenanceResponse | undefined): boolean {
  return provenance?.attestations.some(a => /cyclonedx|spdx/i.test(a.predicateType)) ?? false;
}

// Best-effort feature/fix/chore split from real PR labels, falling back to a
// Conventional-Commits-style title prefix. HANDOFF-tower-release-record.md
// flags this exact question as unresolved platform-wide ("does one already
// exist, or does this need to be established?") - this is a heuristic
// reading of what's already on the PR, not a new convention Tower imposes;
// a PR matching neither simply doesn't add to any bucket; it still shows up
// in the full PR list.
const FEATURE_LABEL = /^(feature|enhancement|feat)$/i;
const FIX_LABEL = /^(bug|bugfix|fix)$/i;
const CHORE_LABEL = /^(chore|dependencies|deps|docs?|documentation|refactor|maintenance)$/i;
const CHORE_PREFIXES = new Set(['chore', 'docs', 'doc', 'refactor', 'test', 'tests', 'ci', 'build', 'style']);

function classifyPr(pr: PullRequestSummary): keyof ChangeCategoryCounts | undefined {
  if (pr.labels.some(l => FEATURE_LABEL.test(l))) return 'features';
  if (pr.labels.some(l => FIX_LABEL.test(l))) return 'fixes';
  if (pr.labels.some(l => CHORE_LABEL.test(l))) return 'chores';
  const prefix = pr.title.match(/^(\w+)(?:\([^)]*\))?:/)?.[1]?.toLowerCase();
  if (!prefix) return undefined;
  if (prefix === 'feat' || prefix === 'feature') return 'features';
  if (prefix === 'fix' || prefix === 'bugfix') return 'fixes';
  if (CHORE_PREFIXES.has(prefix)) return 'chores';
  return undefined;
}

function buildChangeCategories(prs: PullRequestSummary[]): ChangeCategoryCounts {
  const counts: ChangeCategoryCounts = { features: 0, fixes: 0, chores: 0 };
  prs.forEach(pr => {
    const bucket = classifyPr(pr);
    if (bucket) counts[bucket] += 1;
  });
  return counts;
}

// v1 confidence score: a base, plus real signal Tower already has -
// guardrail pass ratio, cosign/SLSA verification, and (today, always true)
// zero recorded incidents. Deliberately not weighted against Phase 2's real
// human approvals, since those don't exist yet - re-tune once they do.
function computeConfidence(input: {
  guardrails?: NonNullable<PullRequestSummary['ci']>;
  provenance?: ProvenanceResponse;
}): number {
  let score = 50;
  if (input.guardrails) {
    score +=
      input.guardrails.totalChecks > 0
        ? Math.round((input.guardrails.passedChecks / input.guardrails.totalChecks) * 30)
        : 15;
  }
  if (input.provenance?.attestations.some(a => a.verified)) score += 15;
  score += 5; // incidents.length is always 0 in Phase 1 - see this file's header comment.
  return Math.min(100, Math.max(0, score));
}

// computeConfidence above runs inside buildReleaseRecords, which has no
// access to a record's persisted humanContext - that's fetched separately,
// per-record, only once a record is actually opened
// (useReleaseRecordDoc/ReleaseRecordDetail.tsx). So `record.confidence`
// itself stays a purely technical score; this is a separate, explicit layer
// callers apply once they actually have approvals to fold in (the record
// detail view, and its HTML/PDF export mirror) rather than silently baking
// human judgment into one score computed somewhere that can't see it.
//
// +5 per approval, capped at +10 total (i.e. the first two approvals move
// the needle, a third doesn't) - deliberately small next to guardrails' own
// up-to-30-point swing: an approval is a real, human-recorded signal, but
// this platform's whole posture (see feedback_tower_write_action_security_policy
// in memory, and this record's own governance-via-PR-review model) treats
// approvals as recorded metadata, not a substitute for the technical gates
// that make up the rest of this score.
export function applyApprovalBonus(baseConfidence: number, approvalsCount: number): number {
  return Math.min(100, baseConfidence + Math.min(10, approvalsCount * 5));
}

// Records only ever come from `releases` (useReleaseContext.ts's own
// MATRIX_ROW_CAP-limited, deploy-history-backed row list) - not a second,
// uncapped query. That cap already exists as this app's "recent activity"
// policy for the Matrix view; reusing it here means a Record archive never
// needs its own separate backend fetch, at the cost of only ever showing
// this app's most recent ~8 distinct images. Good enough for Phase 1's
// "real, demoable value, zero new backend work" - a real archive going back
// further is exactly the kind of thing Phase 2's git-committed-JSON
// persistence (this handoff's own recommended storage) is for.
export function buildReleaseRecords(
  appName: string | undefined,
  pipelineEnvironments: EnvironmentSummary[],
  releases: ReleaseRow[],
  gitopsPrs: PullRequestSummary[],
  sourcePrs: PullRequestSummary[],
  pipelineRuns: PipelineRunSummary[],
  provenanceByImage: Record<string, ProvenanceState>,
  pipelineOrder: { lower?: string[]; upper?: string[] },
): ReleaseRecord[] {
  const upperEnvs = pipelineEnvironments.filter(e => envTierOf(e.env, pipelineOrder) === 'upper');
  if (upperEnvs.length === 0) return [];
  const upperEnvNames = new Set(upperEnvs.map(e => e.env));

  const qualifying = releases
    .map(row => {
      const deployedUpperEnvs = upperEnvs.filter(e => row.cells[e.env]?.status === 'deployed');
      if (deployedUpperEnvs.length === 0) return undefined;
      const createdAt = deployedUpperEnvs
        .map(e => row.cells[e.env].date!)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
      return { row, createdAt, createdAtMs: new Date(createdAt).getTime() };
    })
    .filter((x): x is { row: ReleaseRow; createdAt: string; createdAtMs: number } => Boolean(x))
    .sort((a, b) => a.createdAtMs - b.createdAtMs);

  const records = qualifying.map(({ row, createdAt, createdAtMs }, i) => {
    const previous = qualifying[i - 1];
    const liveUpperEnvs = upperEnvs.filter(e => e.image && imageTag(e.image) === row.imageTag);
    const isLive = liveUpperEnvs.length > 0;
    let status: ReleaseRecordStatus = 'superseded';
    if (isLive) status = liveUpperEnvs.some(e => health(e) === 'degraded') ? 'degraded' : 'healthy';

    const provenance = row.image ? provenanceByImage[row.image]?.data : undefined;

    const pullRequests = sourcePrs
      .filter(pr => {
        if (pr.state !== 'merged' || !pr.mergedAt) return false;
        const mergedMs = new Date(pr.mergedAt).getTime();
        if (mergedMs > createdAtMs) return false;
        return previous ? mergedMs > previous.createdAtMs : true;
      })
      .sort((a, b) => new Date(a.mergedAt!).getTime() - new Date(b.mergedAt!).getTime());

    const deployedEnvs = pipelineEnvironments.filter(e => row.cells[e.env]?.status === 'deployed');
    const commits: ReleaseRecordCommit[] = deployedEnvs.map(e => ({
      sha: row.cells[e.env].sha!,
      date: row.cells[e.env].date!,
      env: e.env,
    }));

    const deployments: ReleaseRecordDeployment[] = deployedEnvs.map(e => {
      const live = Boolean(e.image && imageTag(e.image) === row.imageTag);
      return {
        env: e.env,
        cluster: e.cluster,
        deployedAt: row.cells[e.env].date!,
        isLive: live,
        argoRevision: live ? e.argoRevision : undefined,
        rolloutStrategy: live ? e.workload?.strategyKind : undefined,
        canarySteps: live ? e.workload?.canaryProgress?.steps : undefined,
      };
    });

    const promotionChain: ReleaseRecordPromotion[] = [];
    for (let envIdx = 0; envIdx < pipelineEnvironments.length - 1; envIdx += 1) {
      const from = pipelineEnvironments[envIdx];
      const to = pipelineEnvironments[envIdx + 1];
      if (row.cells[from.env]?.status !== 'deployed' || row.cells[to.env]?.status !== 'deployed') continue;
      const pr = gitopsPrForEnvAndImage(gitopsPrs, to.env, row.imageTag);
      promotionChain.push({
        fromEnv: from.env,
        toEnv: to.env,
        at: row.cells[to.env].date!,
        prUrl: pr?.url,
        prNumber: pr?.number,
        mergedAt: pr?.mergedAt,
      });
    }

    const guardrailPr = deployedUpperEnvNames(deployedEnvs, upperEnvNames)
      .map(envName => gitopsPrForEnvAndImage(gitopsPrs, envName, row.imageTag))
      .find(pr => pr?.ci);

    const pipelineRun = findPipelineRunForTag(row.imageTag, pipelineRuns);
    const relatedPipelineRuns = findRelatedPipelineRuns(pipelineRun, pipelineRuns);
    const testResults = buildTestResults(relatedPipelineRuns);
    const securityScans = buildSecurityScans(relatedPipelineRuns);

    const record: ReleaseRecord = {
      id: `${appName ?? 'app'}@${row.imageTag}`,
      appName: appName ?? '',
      imageTag: row.imageTag,
      image: row.image,
      imageDigest: provenance?.digest,
      version: versionFromImageTag(row.imageTag),
      createdAt,
      current: isLive,
      status,
      pullRequests,
      changeCategories: buildChangeCategories(pullRequests),
      commits,
      pipelineRun,
      pipelineRuns: relatedPipelineRuns,
      testResults,
      securityScans,
      provenance,
      nickname: row.nickname,
      hasSbom: hasSbomAttestation(provenance),
      guardrails: guardrailPr?.ci,
      guardrailsPrUrl: guardrailPr?.url,
      guardrailsPrNumber: guardrailPr?.number,
      deployments,
      promotionChain,
      incidents: [],
      confidence: computeConfidence({ guardrails: guardrailPr?.ci, provenance }),
    };
    return record;
  });

  return records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function deployedUpperEnvNames(deployedEnvs: EnvironmentSummary[], upperEnvNames: Set<string>): string[] {
  return deployedEnvs.filter(e => upperEnvNames.has(e.env)).map(e => e.env);
}

// lower/upper taken as two separate array params, not one `{lower, upper}`
// object - usePipelineOrder's own state already holds each as a stable
// reference across renders (only replaced when a real refetch resolves),
// but a caller building `{lower: pipelineOrder.lower, upper:
// pipelineOrder.upper}` inline creates a brand-new wrapper object every
// render regardless - that would silently defeat this hook's own useMemo
// (a changed dependency identity every render, even though the arrays
// inside it never changed) and recompute every record on every render,
// including every live Kubernetes poll tick.
export function useReleaseRecords(
  appName: string | undefined,
  pipelineEnvironments: EnvironmentSummary[],
  releases: ReleaseRow[],
  gitopsPrs: PullRequestSummary[],
  sourcePrs: PullRequestSummary[],
  pipelineRuns: PipelineRunSummary[],
  provenanceByImage: Record<string, ProvenanceState>,
  pipelineOrderLower: string[] | undefined,
  pipelineOrderUpper: string[] | undefined,
): ReleaseRecord[] {
  return useMemo(
    () =>
      buildReleaseRecords(
        appName,
        pipelineEnvironments,
        releases,
        gitopsPrs,
        sourcePrs,
        pipelineRuns,
        provenanceByImage,
        { lower: pipelineOrderLower, upper: pipelineOrderUpper },
      ),
    [
      appName,
      pipelineEnvironments,
      releases,
      gitopsPrs,
      sourcePrs,
      pipelineRuns,
      provenanceByImage,
      pipelineOrderLower,
      pipelineOrderUpper,
    ],
  );
}
