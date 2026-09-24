import { useCallback, useMemo, useState } from 'react';
import { useEntity } from '@backstage/plugin-catalog-react';
import { useTowerEnvironments } from './useTowerEnvironments';
import {
  useArgoStatusMap,
  useDeployHistory,
  usePipelineOrder,
  useProvenanceMap,
  useRepoHead,
} from './useReleaseData';
import { usePullRequests, type PullRequestSummary } from '../pullRequests/usePullRequests';
import { linkFlowSlugsByChainId, useTektonPipelineRuns } from './tekton/useTektonPipelineRuns';
import { useTektonResultsRuns } from './tekton/useTektonResultsRuns';
import type { PipelineRunSummary } from './tekton/types';
import { recallNickname, rememberNickname } from './nicknameCache';
import {
  envStageRank,
  extractShortShaFromImageTag,
  extractSource,
  imageTag,
  isPreviewEnvName,
  parseGithubUrl,
  type DeployHistoryEntry,
  type EnvironmentSummary,
  type SlsaProvenanceV02Predicate,
} from './types';

// Shared release context for every Tower tab that needs "this app's real
// environments, correctly ordered, plus the data tied to them" - Overview,
// Releases, and (eventually) Topology/Images/SLOs all need the exact same
// repoRef/pipelineOrder/environments derivation. Pulled out into one hook
// after a real bug: OverviewTab used to call envStageRank(env) with no
// pipelineOrder argument at all, so it silently always fell back to the
// hardcoded dev/staging/prod/production guess instead of the app's real
// cicd.yaml deploy.promotionOrder (dev/test/staging/pre-prod/prod for
// checkout-api) - confirmed live 2026-09-08. One shared hook means that
// class of bug can only happen once, not once per tab.
export function useReleaseContext() {
  const { entity } = useEntity();
  const { environments: rawEnvironments, loading, error } = useTowerEnvironments();

  // Live Kubernetes data (rawEnvironments above) already refreshes on its
  // own poll cadence - everything below this point is a one-shot fetch
  // (GitHub/glidepath-backed, deliberately not polled, see usePullRequests'
  // own comment on the rate-limit incident that decision came from). Before
  // this, several of these had literally no way to refresh short of leaving
  // the app and coming back (2026-09-09 feedback, "some tabs aren't
  // refreshing") - `refresh()` is a manual, user-triggered re-fetch of all
  // of them at once.
  const [refreshNonce, setRefreshNonce] = useState(0);
  const refresh = useCallback(() => setRefreshNonce(n => n + 1), []);

  const images = useMemo(
    () => rawEnvironments.map(e => e.image).filter((i): i is string => Boolean(i)),
    [rawEnvironments],
  );
  const provenanceByImage = useProvenanceMap(images, refreshNonce);

  // Owner/repo is derived from whichever environment's own SLSA provenance
  // has already resolved a real source URL - see GlidepathPage.tsx's
  // identical reasoning, ported verbatim (order doesn't matter, any
  // environment with a resolved source is equally good evidence).
  const repoRef = useMemo(() => {
    for (const env of rawEnvironments) {
      const data = env.image ? provenanceByImage[env.image]?.data : undefined;
      const slsa = data?.attestations.find(
        a => a.predicateType === 'https://slsa.dev/provenance/v0.2',
      );
      const source = extractSource(slsa?.predicate as SlsaProvenanceV02Predicate | undefined);
      const parsed = source.url ? parseGithubUrl(source.url) : undefined;
      if (parsed) return parsed;
    }
    return undefined;
  }, [rawEnvironments, provenanceByImage]);

  const projectSlug = entity.metadata.annotations?.['github.com/project-slug'];
  const [slugOwner, slugAppName] = projectSlug ? projectSlug.split('/') : [undefined, undefined];
  const owner = repoRef?.owner ?? slugOwner;
  const appName = repoRef?.repo ?? slugAppName;

  // Falls back to the catalog's own github.com/project-slug annotation
  // (same fallback owner/appName below already use for everything else)
  // rather than repoRef alone - repoRef can only ever resolve from a LIVE
  // deployed image's own SLSA provenance, so an app with a real cicd.yaml
  // and real declared flight environments but nothing deployed anywhere
  // yet (2026-09-22 bug: "App Configuration... just spins its wheels" for
  // boarding-api, which has a real kind-prod/staging/values.yaml but no
  // live workload) could never resolve pipelineOrder at all: usePipelineOrder
  // only ever fetches once given a truthy argument, so passing repoRef
  // (permanently undefined here) meant it would sit at `{loading:false,
  // data:undefined, error:undefined}` forever - ConfigTab's own "wait for
  // real data OR a real error" guard (needed to fix an unrelated race, see
  // its own comment) reads that as "still loading" indefinitely, since
  // neither condition can ever become true. cicd.yaml lives in the source
  // repo and has nothing to do with whether anything's been deployed, so
  // there's no reason this particular fetch needs live provenance evidence
  // the way repoRef itself legitimately does.
  const pipelineOwnerRepo = useMemo(
    () => (owner && appName ? { owner, repo: appName } : undefined),
    [owner, appName],
  );
  const pipelineOrder = usePipelineOrder(pipelineOwnerRepo, refreshNonce);

  // Real ArgoCD health/sync per environment, folded directly onto each
  // EnvironmentSummary rather than kept as a separate map - every existing
  // caller of health(env) (ReleaseCard, EnvironmentTopology,
  // ReleaseStatusPanel, OverviewTab) picks this up for free with no call-site
  // changes, since health() itself now reads env.argoHealthStatus. Polled the
  // same live cadence as everything else here (kubernetesObjects' own poll,
  // via refreshNonce for the manual refresh path) - not gated behind the
  // GitHub-rate-limit-driven "fetch once" posture the PR/provenance/image
  // hooks use, since this hits ArgoCD, not GitHub.
  const argoStatusRaw = useArgoStatusMap(
    rawEnvironments.map(e => e.argoAppName).filter((n): n is string => Boolean(n)),
    refreshNonce,
  );

  // THE fix: pipelineOrder.data is now actually passed through.
  const environments = useMemo(
    () =>
      rawEnvironments
        .map(e => ({
          ...e,
          argoHealthStatus: e.argoAppName ? argoStatusRaw[e.argoAppName]?.healthStatus : undefined,
          argoSyncStatus: e.argoAppName ? argoStatusRaw[e.argoAppName]?.syncStatus : undefined,
          argoOperationStartedAt: e.argoAppName ? argoStatusRaw[e.argoAppName]?.operationStartedAt : undefined,
          argoOperationFinishedAt: e.argoAppName ? argoStatusRaw[e.argoAppName]?.operationFinishedAt : undefined,
          argoHealthSince: e.argoAppName ? argoStatusRaw[e.argoAppName]?.healthSince : undefined,
          argoOperationPhase: e.argoAppName ? argoStatusRaw[e.argoAppName]?.operationPhase : undefined,
          argoSource: e.argoAppName ? argoStatusRaw[e.argoAppName]?.source : undefined,
          argoSyncPolicy: e.argoAppName ? argoStatusRaw[e.argoAppName]?.syncPolicy : undefined,
          argoRevision: e.argoAppName ? argoStatusRaw[e.argoAppName]?.revision : undefined,
          argoOperationMessage: e.argoAppName ? argoStatusRaw[e.argoAppName]?.operationMessage : undefined,
          argoReconciledAt: e.argoAppName ? argoStatusRaw[e.argoAppName]?.reconciledAt : undefined,
          argoResources: e.argoAppName ? argoStatusRaw[e.argoAppName]?.resources : undefined,
          argoConditions: e.argoAppName ? argoStatusRaw[e.argoAppName]?.conditions : undefined,
        }))
        .sort(
          (a, b) =>
            envStageRank(a.env, pipelineOrder.data) - envStageRank(b.env, pipelineOrder.data) ||
            a.env.localeCompare(b.env),
        ),
    [rawEnvironments, pipelineOrder.data, argoStatusRaw],
  );

  const prs = usePullRequests(owner && appName ? { owner, appName } : undefined, refreshNonce);
  const gitopsPrs = useMemo(() => (prs.data ?? []).filter(pr => pr.repo === 'gitops'), [prs.data]);
  const sourcePrs = useMemo(() => (prs.data ?? []).filter(pr => pr.repo === 'source'), [prs.data]);

  const deployHistory = useDeployHistory(
    repoRef,
    environments.map(e => ({ env: e.env, cluster: e.cluster })),
    refreshNonce,
  );

  // The real flow-correlation nickname CiCdTab already shows per PipelineRun
  // (e.g. "lively finch" - see tekton/useTektonPipelineRuns.ts's
  // linkFlowSlugsByChainId), reused here as each release's own nickname
  // instead of inventing a second naming scheme: a release's build run is
  // the one CDEvent-triggered PipelineRun whose real git sha (the
  // pipelinesascode.tekton.dev/sha annotation) is a prefix match for the
  // short sha this platform's own image-tagging convention embeds in the
  // tag (extractShortShaFromImageTag). Live k8s data, same posture as
  // useArgoStatusMap - polled, not GitHub-rate-limited, so a second
  // subscription alongside TowerPage's own tab-bar one is fine.
  const pipelineRuns = useTektonPipelineRuns(appName, refreshNonce);
  const archivedPipelineRuns = useTektonResultsRuns(appName, refreshNonce);

  // Merged live+archived view - see useTektonResultsRuns.ts's own top
  // comment for why archived data is needed at all now (Tekton Results'
  // 1h post-completion grace period means the live-only query above can no
  // longer see any release old enough to have actually reached a Flight
  // env - which is every release this whole Releases area cares about
  // beyond "what's running right now"). Archived entries are added first,
  // live entries override by name: a run still inside its 1h grace period
  // can genuinely exist in both sources at once, and the live one is always
  // more current (an in-flight task's real-time state, not yet archived at
  // all). linkFlowSlugsByChainId re-runs over the COMBINED set rather than
  // trusting either source's own already-linked list - an old, already-
  // archived build run's slug needs to reach a still-live downstream
  // stage's chip, and vice versa.
  const mergedPipelineRuns = useMemo(() => {
    const byName = new Map<string, PipelineRunSummary>();
    archivedPipelineRuns.runs.forEach(run => byName.set(run.name, run));
    pipelineRuns.runs.forEach(run => byName.set(run.name, run));
    const merged = [...byName.values()].sort(
      (a, b) => new Date(b.startTime ?? 0).getTime() - new Date(a.startTime ?? 0).getTime(),
    );
    linkFlowSlugsByChainId(merged);
    return merged;
  }, [pipelineRuns.runs, archivedPipelineRuns.runs]);

  // Preview envs excluded here, not just at the Releases tab's own display
  // layer: they rank -1 in envStageRank (see types.ts), so if `environments`
  // itself went in, a preview env sorting to index 0 would silently corrupt
  // buildReleases' positional math ("current" = environments[0]'s image,
  // the 'promotable' frontier cell = environments[lastDeployedIndex + 1]) -
  // confirmed live 2026-09-16 as the reason Promote never showed up in the
  // matrix at all. This must stay the exact same ordered set ReleasesTab.tsx
  // passes to ReleaseMatrix as its columns, or the two silently disagree.
  const pipelineEnvironments = useMemo(
    () => environments.filter(e => !isPreviewEnvName(e.env)),
    [environments],
  );

  const { rows: releases, total: releaseTotalCount } = useMemo(
    () => buildReleases(pipelineEnvironments, deployHistory.data, gitopsPrs, mergedPipelineRuns),
    [pipelineEnvironments, deployHistory.data, gitopsPrs, mergedPipelineRuns],
  );

  // Furthest-progressed real environment's actual commit, not GitHub's
  // abstract branch HEAD - same "prod may not be running HEAD" reasoning as
  // GlidepathPage.tsx. Walks from the end of the now-correctly-ordered list.
  const releaseRef = useMemo(() => {
    for (let i = environments.length - 1; i >= 0; i -= 1) {
      const env = environments[i];
      const data = env.image ? provenanceByImage[env.image]?.data : undefined;
      const slsa = data?.attestations.find(
        a => a.predicateType === 'https://slsa.dev/provenance/v0.2',
      );
      const source = extractSource(slsa?.predicate as SlsaProvenanceV02Predicate | undefined);
      if (!source.url || !source.commit) continue;
      const parsed = parseGithubUrl(source.url);
      if (parsed) return { ...parsed, sha: source.commit, env: env.env };
    }
    return undefined;
  }, [environments, provenanceByImage]);
  const repoHead = useRepoHead(
    releaseRef ? { owner: releaseRef.owner, repo: releaseRef.repo, ref: releaseRef.sha } : undefined,
    refreshNonce,
  );

  return {
    entity,
    rawEnvironments,
    environments,
    loading,
    error,
    refresh,
    provenanceByImage,
    repoRef,
    owner,
    appName,
    pipelineOrder,
    prs,
    gitopsPrs,
    sourcePrs,
    deployHistory,
    pipelineRuns: mergedPipelineRuns,
    releaseRef,
    repoHead,
    releases,
    releaseTotalCount,
  };
}

// A gitops-<app> release PR's title is always
// `Release: ${appName} to ${targetEnv} @ ${imageTag}` (glidepathPromote.ts's
// promoteToUpperEnv, the exact PR Tower's own Promote button opens) - the
// one load-bearing convention every PR-matching function in Tower depends
// on, since there's no structured field for "which env/image is this PR
// for". Centralized here (rather than each matcher re-deriving its own
// substring check) so every caller - the matchers below, and
// PullRequestsTab's structured target-env/image-tag display - agrees on
// exactly one parse of it.
export interface ParsedGitopsPrTitle {
  appName: string;
  targetEnv: string;
  imageTag: string;
}

const GITOPS_PR_TITLE_RE = /^Release:\s+(\S+)\s+to\s+(\S+)\s+@\s+(\S+)$/i;

export function parseGitopsPrTitle(title: string): ParsedGitopsPrTitle | undefined {
  const match = title.match(GITOPS_PR_TITLE_RE);
  if (!match) return undefined;
  const [, appName, targetEnv, tag] = match;
  return { appName, targetEnv, imageTag: tag };
}

export function gitopsPrForEnv(
  gitopsPrs: PullRequestSummary[],
  env: string,
): PullRequestSummary | undefined {
  const needle = env.toLowerCase();
  return gitopsPrs.find(pr => parseGitopsPrTitle(pr.title)?.targetEnv.toLowerCase() === needle);
}

// Same PR-title convention as gitopsPrForEnv, tightened to also require the
// release's own image tag - gitopsPrForEnv alone can't tell two different
// pending releases to the same env apart (only the release matrix needs
// that: several rows can all have an open PR "to staging" at once, each for
// a different image). See idp_tower_release_matrix_design memory / the
// "Tower Release Matrix" artifact this was designed against. Exported: PR-
// integration work outside buildReleases() now needs this tighter match too.
export function gitopsPrForEnvAndImage(
  gitopsPrs: PullRequestSummary[],
  env: string,
  tag: string,
): PullRequestSummary | undefined {
  const needleEnv = env.toLowerCase();
  const needleTag = tag.toLowerCase();
  return gitopsPrs.find(pr => {
    const parsed = parseGitopsPrTitle(pr.title);
    return parsed?.targetEnv.toLowerCase() === needleEnv && parsed.imageTag.toLowerCase() === needleTag;
  });
}

// The real "when was this deployed" - the app's own deploy-history record
// (a real promotion commit, from whichever file each environment's tier
// commits to - see useDeployHistory) rather than EnvironmentSummary's
// `deployedAt` (max pod startTime across the namespace). Pod start time is
// NOT deployment time: it also moves on a node drain/reschedule, an OOM
// restart, an HPA scale event creating a fresh pod, or an ArgoCD resync that
// re-applies with no real diff - none of those are a release. Confirmed live
// 2026-09-09: a card's "Deployed" timestamp was tracking ArgoCD resync
// activity, not the actual last promotion. Falls back to the pod-based value
// only when this environment has no deploy-history entry yet (e.g. history
// hasn't loaded, or this env predates history being recorded).
export function lastDeployedAt(
  env: EnvironmentSummary,
  deployHistory: Record<string, DeployHistoryEntry[]> | undefined,
): string | undefined {
  const entries = deployHistory?.[env.env];
  const latest = entries?.[entries.length - 1];
  return latest?.date ?? env.deployedAt;
}

export interface ReleaseCell {
  // 'promotable' is the current release's own frontier: the environment
  // immediately after wherever it's furthest deployed, with no PR already
  // pending there - the matrix's replacement for the per-env ReleaseCard's
  // unconditional "Promote to <next env>" button (see ReleasesTab.tsx's own
  // 2026-09-16 header comment on the Command Deck / split sub-tabs revamp).
  status: 'deployed' | 'pending' | 'promotable' | 'none';
  date?: string;
  sha?: string;
  pr?: PullRequestSummary;
  // Only set for 'promotable' - the environment this release is currently
  // live in, i.e. what PromoteDialog's `source` should be.
  sourceEnv?: string;
  // Set instead of sourceEnv for a 'promotable' cell on a release that's
  // never been deployed anywhere (a build-only pipeline's own artifact,
  // 2026-09-16: "now that non deployed images appear in the release
  // matrix, i need to be able to trigger a promotion to the first env") -
  // there's no environment to promote FROM, only the release's own real
  // image ref to deploy for the first time.
  sourceImage?: string;
}

export interface ReleaseRow {
  imageTag: string;
  // Only set when this tag is *currently* the live image of at least one
  // environment - reconstructed from that environment's own real `image`
  // field, never guessed at from the tag alone. A tag that has aged out of
  // every environment's current state gets no `image`, so its matrix cell
  // only ever shows the plain deploy-history facts (date/sha), not a
  // fabricated provenance lookup.
  image?: string;
  cells: Record<string, ReleaseCell>;
  // When this release was FIRST introduced - the earliest deploy-history
  // entry seen for it in any environment (in practice, almost always its
  // entry in the lowest/first environment, since that's where every new
  // build lands first). Used purely to order rows newest-release-first.
  // Deliberately NOT "most recently touched by any environment": promoting
  // an older release later would stamp a fresh timestamp on it and wrongly
  // rank it above a genuinely newer build that just hasn't been promoted
  // yet - introducedAt tracks the release's own age, not its last activity.
  introducedAt: string;
  current: boolean;
  // The real flow-correlation slug (e.g. "lively finch") of the PipelineRun
  // that built this exact revision - see buildReleases' own lookup below.
  // Undefined when no matching run is found (garbage-collected from the
  // cluster, or built before Tower ever added this correlation) - never
  // fabricated.
  nickname?: string;
}

// Row cap for the release matrix - a deliberate, named policy rather than a
// bare magic number: the matrix is a "recent activity" view (see its own
// head copy, "rows are recent releases, newest first"), not a full history
// browser, and a fixed cap keeps every app's matrix the same predictable
// height regardless of how many distinct images it's ever run. Anything
// older simply isn't shown - buildReleases returns the true `total` count
// alongside the capped `rows` so the UI can say so rather than truncating
// silently (see ReleaseMatrix.tsx).
export const MATRIX_ROW_CAP = 8;

// A release's build run is the one PipelineRun whose real git sha (a full
// 40-char sha, the pipelinesascode.tekton.dev/sha annotation) is a prefix
// match for the short sha this platform's own tagging convention embeds in
// the image tag - see extractShortShaFromImageTag. A 7+ char hex prefix
// match is unambiguous in practice, so first match wins. Shared by
// buildReleases, ReleaseLog.tsx's buildLogEntries, OverviewTab.tsx's image
// tag rail, and activityRowRenderers.tsx's build-event row - one nickname
// lookup, not four copies drifting apart.
//
// A live match is also opportunistically cached (nicknameCache.ts) and
// consulted as the fallback when no live PipelineRun match exists - the
// chip otherwise vanished the moment that run aged past Tekton's own 24h
// pruning window (2026-09-16 feedback: "it looks like the nickname chip
// disappears when all the pipeline runs get deleted"). Real caveat, not
// silently glossed over: this only ever has an answer for a release
// someone's browser already saw resolved while its run was still alive -
// see nicknameCache.ts's own header for why nothing client-side can do
// better than that.
export function nicknameForImageTag(tag: string, pipelineRuns: PipelineRunSummary[]): string | undefined {
  const shortSha = extractShortShaFromImageTag(tag);
  if (!shortSha) return undefined;
  const run = pipelineRuns.find(r => r.sha?.toLowerCase().startsWith(shortSha.toLowerCase()));
  if (run?.flowSlug) {
    rememberNickname(shortSha, run.flowSlug);
    return run.flowSlug;
  }
  return recallNickname(shortSha);
}

// Groups deployHistory (already fetched per environment for the Timeline/
// Lead-Time panels) by image tag instead of by environment - the release
// matrix's whole data model, and zero new backend calls: same
// deployHistory + gitopsPrs useReleaseContext already fetches, reshaped
// client-side. See the "Tower Release Matrix" design artifact
// (idp_tower_release_matrix_design memory) this was built from.
export function buildReleases(
  environments: EnvironmentSummary[],
  deployHistory: Record<string, DeployHistoryEntry[]> | undefined,
  gitopsPrs: PullRequestSummary[],
  pipelineRuns: PipelineRunSummary[] = [],
): { rows: ReleaseRow[]; total: number } {
  if (!deployHistory) return { rows: [], total: 0 };

  const imageByTag: Record<string, string> = {};
  environments.forEach(e => {
    if (e.image) imageByTag[imageTag(e.image)] = e.image;
  });

  const rows = new Map<string, ReleaseRow>();
  environments.forEach(env => {
    (deployHistory[env.env] ?? []).forEach(entry => {
      const tag = imageTag(entry.imageTag);
      let row = rows.get(tag);
      if (!row) {
        row = {
          imageTag: tag,
          image: imageByTag[tag],
          cells: {},
          introducedAt: entry.date,
          current: false,
          nickname: nicknameForImageTag(tag, pipelineRuns),
        };
        rows.set(tag, row);
      }
      row.cells[env.env] = { status: 'deployed', date: entry.date, sha: entry.sha };
      if (new Date(entry.date).getTime() < new Date(row.introducedAt).getTime()) {
        row.introducedAt = entry.date;
      }
    });
  });

  // A pipeline that only ever runs a build stage (no test/deploy/release
  // configured downstream in cicd.yaml) never produces a single
  // deployHistory entry anywhere - the loop above, keyed entirely off
  // deployHistory, silently never gives it a row at all (2026-09-16 bug:
  // "an image from a build-only pipeline never appears in the release
  // matrix"). Backfill one row per successful 'build' PipelineRun whose
  // image isn't already represented from deployHistory, reading the same
  // build-image task result resolve-image-ref/deploy-manifests read
  // downstream (taskRunsByPipelineTask['build-image'].results['image-ref'])
  // rather than fabricating a tag from the run's params. No cells (nothing
  // deployed anywhere yet) - the matrix cell UI already renders an all-empty
  // row correctly for a release that hasn't reached any environment.
  pipelineRuns
    .filter(run => run.pipelineName === 'build' && run.phase === 'succeeded')
    .forEach(run => {
      const imageRef = run.taskRunsByPipelineTask['build-image']?.results.find(
        r => r.name === 'image-ref',
      )?.value;
      if (!imageRef) return;
      const tag = imageTag(imageRef);
      if (rows.has(tag)) return;
      rows.set(tag, {
        imageTag: tag,
        image: imageByTag[tag] ?? imageRef,
        cells: {},
        introducedAt: run.completionTime ?? run.startTime ?? new Date().toISOString(),
        current: false,
        nickname: run.flowSlug ?? nicknameForImageTag(tag, pipelineRuns),
      });
    });

  rows.forEach(row => {
    environments.forEach(env => {
      if (row.cells[env.env]) return;
      // 'pending' means "an open PR is awaiting merge to promote this
      // image here" - gitopsPrForEnvAndImage itself matches any PR state
      // (usePullRequests now returns recently-merged PRs too), so a merged
      // match without a deploy-history entry yet (sync lag) deliberately
      // falls through to 'none' rather than mislabeling it 'pending' next
      // to a PrButton that would show the contradictory "merged" checkmark.
      const pr = gitopsPrForEnvAndImage(gitopsPrs, env.env, row.imageTag);
      if (pr?.state === 'open') row.cells[env.env] = { status: 'pending', pr };
    });
  });

  const currentTag = environments[0]?.image ? imageTag(environments[0].image) : undefined;
  const sorted = [...rows.values()].sort(
    (a, b) => new Date(b.introducedAt).getTime() - new Date(a.introducedAt).getTime(),
  );
  const withCurrent = sorted
    .slice(0, MATRIX_ROW_CAP)
    .map(row => ({ ...row, current: row.imageTag === currentTag }));

  // The current release's own frontier cell: the environment right after the
  // furthest one it's actually reached, provided nothing's already
  // deployed/pending there. Exactly one cell per matrix (or none, if the
  // current release has already reached the last environment) - matches the
  // single "+" promote affordance the Command Deck / Split Sub-tabs design
  // settled on, not a promote button on every historical row.
  const currentRow = withCurrent.find(row => row.current);
  if (currentRow) {
    let lastDeployedIndex = -1;
    environments.forEach((env, i) => {
      if (currentRow.cells[env.env]?.status === 'deployed') lastDeployedIndex = i;
    });
    const frontier = environments[lastDeployedIndex + 1];
    if (frontier && (!currentRow.cells[frontier.env] || currentRow.cells[frontier.env].status === 'none')) {
      currentRow.cells[frontier.env] = {
        status: 'promotable',
        sourceEnv: environments[lastDeployedIndex]?.env,
      };
    }
  }

  // A release that's never been deployed anywhere (no cell in this row is
  // 'deployed') has no environment to promote FROM - only its own real
  // image to deploy for the first time, into the app's own first
  // environment. Distinct from currentRow's frontier above (which by
  // construction always has environments[0] deployed, so the two never
  // overlap) - most commonly a build-only pipeline's own artifact (see this
  // function's own build-run backfill above). 2026-09-16: "now that non
  // deployed images appear in the release matrix, i need to be able to
  // trigger a promotion to the first env".
  const firstEnv = environments[0];
  if (firstEnv) {
    withCurrent.forEach(row => {
      if (!row.image) return;
      const alreadyDeployedSomewhere = environments.some(
        env => row.cells[env.env]?.status === 'deployed',
      );
      if (alreadyDeployedSomewhere) return;
      const existing = row.cells[firstEnv.env];
      if (existing && existing.status !== 'none') return;
      row.cells[firstEnv.env] = { status: 'promotable', sourceImage: row.image };
    });
  }

  return { rows: withCurrent, total: sorted.length };
}
