// Mirrors packages/backend/src/glidepathProvenance.ts's response shape -
// same backend route Glidepath's own module already calls (see
// GlidepathPage.tsx). Tower reuses this data source directly rather than
// standing up a parallel one: reusing a plugin's *backend* route is fine,
// only reimplementing its *frontend* is the point (see HANDOFF-tower-
// module.md's "absorbing means reimplementing" decision).
export interface CertificateSummary {
  subject: string;
  issuer: string;
  identity?: string;
  validFrom: string;
  validTo: string;
}

export interface TransparencyLogEntry {
  logIndex: number;
  logId?: string;
  integratedTime?: number;
}

export interface SlsaProvenanceV02Predicate {
  builder?: { id?: string };
  buildType?: string;
  metadata?: { buildStartedOn?: string; buildFinishedOn?: string };
  buildConfig?: {
    tasks?: Array<{
      invocation?: { environment?: { labels?: Record<string, string> } };
      results?: Array<{ name?: string; value?: string }>;
    }>;
  };
}

export interface Attestation {
  predicateType: string;
  predicate?: Record<string, unknown>;
  subject?: Array<{ name?: string; digest?: Record<string, string> }>;
  certificate?: CertificateSummary;
  transparencyLog?: TransparencyLogEntry;
  verified: boolean;
  verificationError?: string;
}

export interface ProvenanceResponse {
  digest: string;
  attestations: Attestation[];
}

export interface RepoHead {
  sha: string;
  branch?: string;
  author?: string;
  pushedAt?: string;
  message?: string;
}

export interface ImageVersion {
  digest: string;
  tags: string[];
  createdAt?: string;
  htmlUrl?: string;
}

export interface ArgoApplicationSummary {
  syncStatus?: string;
  healthStatus?: string;
  // Real ArgoCD Application fields beyond the two Overview cards originally
  // needed - status.operationState.startedAt (when the most recent sync
  // operation began) and status.health.lastTransitionTime (when the
  // *current* health status was reached). Added for the CI/CD tab's CD
  // panel: ArgoCD keeps no history of past syncs/health transitions, only
  // these two "since when has the present state been true" timestamps, so
  // they're the only real dates a delivery's sync/health steps can show -
  // see useCdDelivery.ts.
  operationStartedAt?: string;
  // status.operationState.finishedAt - when the most recent sync operation
  // actually finished (undefined while still `Running`) - the real
  // "Application sync completed at" signal (2026-09-16: "the timestamp for
  // the 'Application Sync' stage should be when the argo app finishes
  // syncing all its resources"), distinct from operationStartedAt above
  // (when it began).
  operationFinishedAt?: string;
  healthSince?: string;
  // status.operationState.phase - "Running" while a sync is genuinely still
  // being applied right now, vs "Succeeded"/"Error"/"Failed" once it's
  // settled (2026-09-12 bug: dev's active-delivery panel showed "App
  // Health: Progressing"/"App Healthy" as already satisfied, with a stale
  // 6h-old timestamp, moments after a brand-new commit's sync had just been
  // triggered). `healthStatus`/`syncStatus` are themselves lagging
  // snapshots - right after a fresh sync starts, they can still be reporting
  // the PREVIOUS release's "Healthy"/"Synced" for a few seconds until Argo
  // actually gets around to updating them (a narrower version of the same
  // kind of lag `argoStale` already exists in useCdDelivery.ts to catch, but
  // that check only fires when operationStartedAt itself is stale - it
  // can't catch a fresh operation whose health/sync fields just haven't
  // caught up yet). `phase === 'Running'` is authoritative regardless of
  // what health/sync currently claim - see useCdDelivery.ts's own use of it.
  operationPhase?: string;
  // Everything below is read from the same real Application object the
  // fields above already come from (redhat-argocd-backend's
  // `/find/name/:name?expand=applications`, see useArgoStatusMap) - no new
  // backend route, just more of the same response actually mapped through.
  // Added for the Deployments tab's "Ground Control" ArgoCD application
  // panel (HANDOFF-tower-cicd-redesign.md's "all important ArgoCD app info
  // must be surfaced" requirement): source repo/path/revision, sync policy
  // flags, the live/target revision, the last operation's own result
  // message, and the resource tree ArgoCD itself already aggregates
  // (status.resources) - real per-resource kind/name/health, not
  // reimplemented from Tower's own separately-fetched K8sResourceRef list.
  source?: { repoUrl?: string; path?: string; targetRevision?: string };
  syncPolicy?: { automated: boolean; selfHeal: boolean; prune: boolean };
  // status.sync.revision - the commit ArgoCD has actually applied, as
  // opposed to source.targetRevision (what the Application is configured to
  // track, usually a branch name). Distinct real facts: a Sync status of
  // "OutOfSync" is precisely target != this value.
  revision?: string;
  operationMessage?: string;
  // status.reconciledAt - when ArgoCD last actually compared live state
  // against git (real field the redhat-argocd plugin's own Status type
  // also carries) - the screenshot behind the 2026-09-16 "missing vital
  // info" report showed this as "Last reconcile: 4m ago" alongside the
  // operation banner.
  reconciledAt?: string;
  resources?: ArgoResourceNode[];
  // status.conditions - a real standing Application-level problem (e.g.
  // ComparisonError, SyncError), distinct from operationMessage (which
  // only ever describes the last sync OPERATION) since a condition can be
  // true between syncs too, e.g. a live comparison failure ArgoCD hit
  // while just computing the diff (2026-09-16: "the argocd info panel is
  // missing vital info - there was a sync result message").
  conditions?: Array<{ type: string; message: string }>;
}

// One node of ArgoCD's own status.resources tree - already a flat list of
// every resource the Application manages with its own per-resource
// kind/name/namespace/health, not something Tower has to reconstruct from
// its separately-fetched K8sResourceRef list (which comes from Tower's own
// direct Kubernetes reads, not ArgoCD's comparison).
export interface ArgoResourceNode {
  kind: string;
  name: string;
  namespace?: string;
  // ArgoCD's own per-resource status/health.status vocabulary
  // (Synced/OutOfSync, Healthy/Progressing/Degraded/Missing/Unknown) - kept
  // as the raw string rather than remapped through this file's own Health
  // type, since a resource here isn't necessarily a workload at all (a
  // Service or ExternalSecret has no "Progressing" concept of its own).
  syncStatus?: string;
  health?: string;
  // The last sync operation's own real per-resource result
  // (status.operationState.syncResult.resources[].message/hookType) -
  // neither lives on status.resources itself (see useReleaseData.ts's own
  // merge comment), so both are only ever real for whichever resources that
  // operation actually touched, not every resource the Application manages
  // (2026-09-16: "the argocd resource tree section [should] contain the
  // same info as argocd's UI does in the sync status page"). `hookType` is
  // ArgoCD's own vocabulary (PreSync/Sync/PostSync/SyncFail/PostDelete) -
  // undefined for an ordinary (non-hook) resource.
  message?: string;
  hookType?: string;
}

export type Health = 'healthy' | 'progressing' | 'paused' | 'degraded' | 'unknown';

export interface PodSummary {
  name: string;
  phase?: string;
  ready: boolean;
  restarts: number;
  startTime?: string;
  containers: string[];
}

export interface ServicePortSummary {
  port: number;
  targetPort?: string | number;
  protocol?: string;
}

export interface ServiceSummary {
  name: string;
  type?: string;
  clusterIP?: string;
  ports: ServicePortSummary[];
}

// One real deployed object in an environment's namespace - the Topology
// tab's "full resource list" and raw-YAML view both work off this, not a
// bespoke per-kind type, so any object type useTowerEnvironments collects
// (Deployment, Rollout, Service, ConfigMap, Secret, HPA, ...) can be listed
// and inspected the same way. `raw` is the exact object the Kubernetes API
// returned - never hand-reconstructed - so the YAML view is trustworthy.
export interface K8sResourceRef {
  kind: string;
  apiVersion?: string;
  name: string;
  namespace: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  raw: unknown;
}

export interface CanaryStepSummary {
  label: string;
}

// The structured version of a canary step - CanaryStepSummary's `label` is a
// pre-rendered display string (Topology tab's static step list); this keeps
// the real fields (setWeight/pause/analysis) so the CI/CD tab's live ramp and
// weight chart (2026-09-11: "show the rollout deployment live... the
// resulting steps and their output") can compute progress, not just print
// each step once.
export type CanaryStepKind = 'setWeight' | 'pause' | 'analysis';
export interface CanaryStepDef {
  kind: CanaryStepKind;
  weight?: number;
  pauseDuration?: string;
  analysisTemplates?: string[];
  // Set only on the synthetic final setWeight(100) step
  // buildCanaryProgress appends when the Rollout's own spec.strategy.
  // canary.steps doesn't already end at 100% - Argo Rollouts always fully
  // promotes once every declared step finishes, even when no step literally
  // says `setWeight: 100` (2026-09-15 bug: the canary chart/ramp never
  // showed traffic actually reach 100% for a rollout whose last real step
  // was e.g. 80%, because there was no step object to draw it from). Never
  // set on a real step read from the spec, so a consumer can still tell
  // "the platform inferred this" from "the app declared this" apart.
  implied?: boolean;
}

export interface AnalysisMeasurement {
  at?: string;
  value: string;
}

export interface AnalysisMetricResult {
  name: string;
  phase?: string;
  successCondition?: string;
  query?: string;
  measurements: AnalysisMeasurement[];
  // status.metricResults[].message - Argo Rollouts' own real "why this
  // metric assessed Failed/Inconclusive" explanation (e.g. "metric
  // \"success-rate\" assessed Failed due to failed (1) > failureLimit (0)")
  // - the one piece of a failed canary this platform wasn't surfacing at
  // all before (2026-09-18: "canary error messages need to surface
  // better"). Distinct from successCondition (the rule) and the raw
  // measurements (the numbers) - this is the controller's own verdict.
  message?: string;
}

export interface AnalysisRunSummary {
  name: string;
  phase?: string;
  startedAt?: string;
  completedAt?: string;
  // status.message - the AnalysisRun's own top-level summary, real for a
  // Failed/Error run (usually names which metric tipped it over) even
  // before drilling into a specific metric's own message above.
  message?: string;
  // Argo Rollouts' own `rollout-type` label ('Background' | 'Step') and, for a
  // step run, its `step-index` label - the authoritative way to tell the
  // background run apart from step runs and to map a step run to its step
  // (2026-09-24: the old positional pairing depended on the Rollout's live
  // status.canary.currentBackgroundAnalysisRunStatus name, which Argo Rollouts
  // clears once the rollout completes - after which the background run got
  // counted as a step run and shifted every step's results by one).
  rolloutType?: string;
  stepIndex?: number;
  metrics: AnalysisMetricResult[];
  raw: unknown;
}

// currentWeight is derived client-side (the last setWeight step at or before
// currentStepIndex - Rollout status carries currentStepIndex but not a
// standalone "current traffic %" field of its own) rather than re-derived
// wherever it's displayed, so the chart and any other consumer agree on
// exactly one definition of "current."
export interface CanaryProgress {
  steps: CanaryStepDef[];
  currentStepIndex?: number;
  currentWeight?: number;
  // spec.strategy.canary.analysis - a background AnalysisTemplate that runs
  // for the whole canary revision's duration, alongside (not as one of) the
  // numbered steps array above. Genuinely distinct from a `steps[].analysis`
  // entry: Argo Rollouts tracks its live run separately too, in
  // status.canary.currentBackgroundAnalysisRunStatus, not
  // currentStepAnalysisRunStatus (2026-09-12: "if a canary deployment
  // includes a background analysistemplate, that should be present on the
  // canary rollout step diagram").
  backgroundAnalysisTemplates?: string[];
  currentBackgroundAnalysisRunName?: string;
}

export interface WorkloadDetail {
  kind: 'Rollout' | 'Deployment';
  name: string;
  strategyKind: 'canary' | 'blueGreen' | 'rollingUpdate' | 'recreate' | 'unknown';
  canarySteps?: CanaryStepSummary[];
  canaryProgress?: CanaryProgress;
  // The canary revision's pod-template-hash - AnalysisRuns carry this as
  // their own `rollouts-pod-template-hash` label (confirmed live), the only
  // way to tell "this analysis run belongs to the currently-canarying
  // revision" apart from an older one still lingering in the namespace.
  currentPodHash?: string;
  canaryServices?: { canary?: string; stable?: string };
  blueGreen?: {
    activeService?: string;
    previewService?: string;
    autoPromotionEnabled?: boolean;
    scaleDownDelaySeconds?: number;
  };
  pdb?: {
    name: string;
    minAvailable?: string | number;
    maxUnavailable?: string | number;
    currentHealthy?: number;
    desiredHealthy?: number;
    disruptionsAllowed?: number;
  };
  hpa?: {
    name: string;
    minReplicas?: number;
    maxReplicas?: number;
    targetCpuUtilization?: number;
    currentReplicas?: number;
  };
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  raw: unknown;
}

export interface EnvironmentSummary {
  key: string;
  env: string;
  cluster: string;
  namespace: string;
  appName?: string;
  argoAppName?: string;
  // Real ArgoCD Application status for this environment, when it resolved
  // (see useReleaseContext.ts) - health()'s own real-incident fix (2026-09-11:
  // pre-prod/prod showed "Healthy" on Overview/Topology while ArgoCD itself
  // reported Degraded, because health() only ever looked at the Rollout's own
  // replica/phase state, never at ArgoCD's Application-wide health, which
  // aggregates every resource the Application manages, not just the
  // Rollout). Optional and best-effort like ArgoApplicationSummary itself -
  // its absence means "couldn't reach ArgoCD," not "app is fine."
  argoHealthStatus?: string;
  argoSyncStatus?: string;
  // Real ArgoCD timestamps - see ArgoApplicationSummary's own comment on why
  // these two are the only ones ArgoCD actually offers (a live snapshot, not
  // a history). Used by the CI/CD tab's CD panel (useCdDelivery.ts).
  argoOperationStartedAt?: string;
  argoOperationFinishedAt?: string;
  argoHealthSince?: string;
  // See ArgoApplicationSummary's own comment on operationPhase.
  argoOperationPhase?: string;
  // See ArgoApplicationSummary's own comment on these five - same
  // fold-onto-EnvironmentSummary treatment useReleaseContext.ts already
  // gives syncStatus/healthStatus/the two timestamps/operationPhase above,
  // for the Deployments tab's ArgoCD application panel.
  argoSource?: ArgoApplicationSummary['source'];
  argoSyncPolicy?: ArgoApplicationSummary['syncPolicy'];
  argoRevision?: string;
  argoOperationMessage?: string;
  argoReconciledAt?: string;
  argoResources?: ArgoResourceNode[];
  argoConditions?: ArgoApplicationSummary['conditions'];
  image?: string;
  desiredReplicas?: number;
  availableReplicas?: number;
  cpuRequest?: string;
  cpuLimit?: string;
  memoryRequest?: string;
  memoryLimit?: string;
  deployedAt?: string;
  rolloutPhase?: string;
  // status.message - the Rollout's own real "why this phase" explanation
  // (e.g. why it's Degraded: an aborted canary, an exceeded progress
  // deadline, ...) - a direct Kubernetes read like rolloutPhase itself, so
  // it's available even while ArgoCD's own operationMessage is stale or the
  // sync operation is stuck (see useCdDelivery.ts's rolloutFailed comment).
  // 2026-09-18: "canary error messages need to surface better" - rolloutPhase
  // alone said THAT it failed, never WHY.
  rolloutMessage?: string;
  strategy?: string;
  ingressUrl?: string;
  drift: boolean;
  pods: PodSummary[];
  services: ServiceSummary[];
  workload?: WorkloadDetail;
  resources: K8sResourceRef[];
}

export interface PromoteRequest {
  owner: string;
  appName: string;
  // sourceCluster/sourceEnv are omitted for a first deploy of a release
  // that's never been deployed anywhere - sourceImageRepo/sourceImageTag
  // carry the artifact directly instead. See glidepathPromote.ts's
  // resolveSource on the backend for how that's still independently
  // verified, not just trusted at face value.
  sourceCluster?: string;
  sourceEnv?: string;
  sourceImageRepo?: string;
  sourceImageTag?: string;
  targetCluster: string;
  targetEnv: string;
}

export interface PromoteResult {
  mode: 'pr' | 'direct-commit';
  prUrl?: string;
  alreadyOpen?: boolean;
  commitUrl?: string;
}

export interface DeployHistoryEntry {
  sha: string;
  date: string;
  imageTag: string;
}

export function extractSource(predicate: SlsaProvenanceV02Predicate | undefined) {
  const cloneTask = predicate?.buildConfig?.tasks?.find(t => {
    const taskLabel = t.invocation?.environment?.labels?.['tekton.dev/task'];
    return taskLabel === 'git-clone' || taskLabel === 'clone-repo-authenticated';
  });
  return {
    url: cloneTask?.results?.find(r => r.name === 'url')?.value,
    commit: cloneTask?.results?.find(r => r.name === 'commit')?.value,
  };
}

export function parseGithubUrl(url: string): { owner: string; repo: string } | undefined {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  return match ? { owner: match[1], repo: match[2] } : undefined;
}

// This platform's real image-tagging convention (platform-cicd/Glidepath's
// build-image.yaml: "<version>-<7-char-sha>", or a bare 12-char sha alone for
// pull_request-triggered images).
export function extractShortShaFromImageTag(tag: string): string | undefined {
  return tag.match(/(?:^|-)([0-9a-f]{7,40})$/i)?.[1];
}

export function imageTag(image?: string): string {
  if (!image) return 'no image';
  const atIndex = image.indexOf('@sha256:');
  if (atIndex !== -1) return `sha256:${image.slice(atIndex + 8, atIndex + 20)}…`;
  const colonIndex = image.lastIndexOf(':');
  return colonIndex === -1 ? image : image.slice(colonIndex + 1);
}

// The inverse of imageTag - repo and tag both, for a first-deploy Promote
// request (glidepathPromote.ts's resolveSource needs them as separate
// fields, not a combined ref). Only meaningful for a plain `repo:tag`
// reference, never a `repo@sha256:...` digest - the real image every
// buildReleases() row/build-image task result carries is always the former
// on this platform (see build-image.yaml's own tagging convention).
export function splitImageRef(image: string): { repo: string; tag: string } | undefined {
  const colonIndex = image.lastIndexOf(':');
  if (colonIndex === -1) return undefined;
  return { repo: image.slice(0, colonIndex), tag: image.slice(colonIndex + 1) };
}

// GHCR images are always ghcr.io/<owner>/<repo>[:tag|@digest] on this
// platform (see glidepathProvenance.ts's own parseImageRef) - the owner is
// always the GHCR account this platform pushes to, never something an
// entity annotation needs to carry. Ported from GlidepathPage.tsx's
// identical helper rather than imported, since that module must stay
// untouched (same posture as every other hook/helper in this file).
export function parseGhcrOwnerRepo(image: string): { owner: string; repo: string } | undefined {
  const prefix = 'ghcr.io/';
  if (!image.startsWith(prefix)) return undefined;
  const rest = image.slice(prefix.length);
  const withoutRef = rest.split('@')[0].replace(/:[^/]*$/, '');
  const slash = withoutRef.indexOf('/');
  if (slash === -1) return undefined;
  return { owner: withoutRef.slice(0, slash), repo: withoutRef.slice(slash + 1) };
}

export type GhcrVersionKind = 'image' | 'provenance' | 'attestations' | 'signature';

// All three of this platform's real attestation/signature-storage
// conventions show up as ordinary package "versions" on GHCR, tagged with
// the digest they're attached to rather than a real release tag -
// `<repo>:sha256-<digest>.att` for Tekton Chains' legacy SLSA provenance
// manifest, `<repo>:sha256-<digest>` (no suffix) for the OCI-1.1 referrers
// Image Index cosign attest (SBOM) writes into, `<repo>:sha256-<digest>.sig`
// for cosign's classic image-signing tag (`cosign sign`, a genuinely
// different mechanism from the other two - it signs the image manifest
// itself, not an attestation statement about it). A naming-convention match
// only, not a manifest-content check - good enough to label a row without
// spending an extra GHCR call per version just to look inside it. Ported
// from GlidepathPage.tsx. 2026-09-17 bug: `.sig` wasn't recognized at all
// here, so it fell through to the 'image' default and got its own fake
// image row on the Images tab instead of being folded into its real image's
// panel.
const GHCR_PROVENANCE_TAG = /^sha256-[0-9a-f]{64}\.att$/;
const GHCR_ATTESTATIONS_TAG = /^sha256-[0-9a-f]{64}$/;
const GHCR_SIGNATURE_TAG = /^sha256-[0-9a-f]{64}\.sig$/;

export function classifyGhcrVersion(tags: string[]): GhcrVersionKind {
  if (tags.some(t => GHCR_PROVENANCE_TAG.test(t))) return 'provenance';
  if (tags.some(t => GHCR_SIGNATURE_TAG.test(t))) return 'signature';
  if (tags.some(t => GHCR_ATTESTATIONS_TAG.test(t))) return 'attestations';
  return 'image';
}

const FALLBACK_STAGE_ORDER = ['dev', 'staging', 'prod', 'production'];

export function isPreviewEnvName(env: string): boolean {
  const lower = env.toLowerCase();
  return /^pr[-_]?\d+/.test(lower) || lower.includes('preview');
}

// The source-repo PR number embedded in a preview env's own name (this
// platform's ephemeral-environment naming convention - see
// isPreviewEnvName's identical `pr[-_]?<n>` pattern) - lets a preview env's
// card link back to the actual PR that spawned it, matched against
// useReleaseContext's `sourcePrs` by number. `undefined` for a preview env
// matched only via the `.includes('preview')` fallback (no number to
// extract) or for a non-preview env entirely.
export function previewPrNumber(env: string): number | undefined {
  const match = env.toLowerCase().match(/^pr[-_]?(\d+)/);
  return match ? Number(match[1]) : undefined;
}

// Three-tier environment taxonomy (user-confirmed naming, 2026-09-08):
// Preview (ephemeral, PR-triggered - may vanish any time), Ground (dev
// cluster, low stakes), Flight (prod cluster, real traffic). Deliberately a
// *display*-layer concept only - the real wire/schema vocabulary underneath
// (cicd.yaml's lowerEnvironments/upperEnvironments, the glidepath backend's
// pipeline-order route returning {lower, upper}, glidepathPromote.ts's
// tier: 'lower' | 'upper') stays as-is; renaming that would mean touching
// platform-cicd's real schema and every XRD that speaks it, for a rename
// that only ever needed to change what Tower shows a human.
export type EnvTier = 'preview' | 'lower' | 'upper';

export const ENV_TIER_LABEL: Record<EnvTier, string> = {
  preview: 'Preview',
  lower: 'Ground',
  upper: 'Flight',
};

// Display-order rank for tier-first views (Topology tab: Flight, then
// Ground, then Preview - highest-stakes first, since that's the thing worth
// checking before anything else). Deliberately NOT applied to the shared
// `environments` list every tab reads from useReleaseContext - Releases'
// promote-chain logic (environments[index + 1] as "the next env to promote
// to") depends on real pipeline order, not tier grouping, so this is a
// display-only re-sort local to whichever tab wants it.
export const ENV_TIER_DISPLAY_RANK: Record<EnvTier, number> = {
  upper: 0,
  lower: 1,
  preview: 2,
};

// Preview is decided locally (isPreviewEnvName - a naming convention, not
// data the pipeline-order route knows about). Flight requires an explicit
// match in the app's own real cicd.yaml upperEnvironments list; anything not
// confirmed as Flight defaults to Ground, including while pipelineOrder is
// still loading - the safe default here is "ordinary", not "production".
export function envTierOf(
  env: string,
  pipelineOrder?: { lower?: string[]; upper?: string[] },
): EnvTier {
  if (isPreviewEnvName(env)) return 'preview';
  const needle = env.toLowerCase();
  if (pipelineOrder?.upper?.some(e => e.toLowerCase() === needle)) return 'upper';
  return 'lower';
}

export function envStageRank(env: string, pipelineOrder?: string[]): number {
  const lower = env.toLowerCase();
  if (isPreviewEnvName(env)) return -1;
  if (pipelineOrder) {
    const index = pipelineOrder.findIndex(e => e.toLowerCase() === lower);
    return index === -1 ? pipelineOrder.length : index;
  }
  const index = FALLBACK_STAGE_ORDER.indexOf(lower);
  return index === -1 ? FALLBACK_STAGE_ORDER.length : index;
}

function rolloutHealthOf(env: EnvironmentSummary): Health {
  switch (env.rolloutPhase) {
    case 'Healthy':
      return 'healthy';
    case 'Progressing':
      return 'progressing';
    case 'Paused':
      return 'paused';
    case 'Degraded':
      return 'degraded';
    default:
      break;
  }
  if (env.desiredReplicas === undefined || env.desiredReplicas === 0) return 'unknown';
  if (env.availableReplicas === env.desiredReplicas) return 'healthy';
  if ((env.availableReplicas ?? 0) > 0) return 'progressing';
  return 'degraded';
}

function argoHealthOf(status: string | undefined): Health | undefined {
  if (status === 'Healthy') return 'healthy';
  if (status === 'Progressing') return 'progressing';
  if (status === 'Suspended') return 'paused';
  // ArgoCD's "Missing" means the Application manages a resource that isn't
  // actually present in the cluster - as real a problem as "Degraded",
  // just a different reason for it.
  if (status === 'Degraded' || status === 'Missing') return 'degraded';
  return undefined;
}

// Worse-wins ranking so a real ArgoCD-detected problem always surfaces even
// when the Rollout's own replica counts look fine - ArgoCD's health is an
// Application-wide judgment (every resource it manages, plus its own
// comparison/sync state), while the Rollout only knows about itself.
// Confirmed live, 2026-09-11: order-api-prod's Rollout reported healthy
// replica counts while ArgoCD reported Progressing/Degraded due to a real
// repo-server comparison error - the two signals can genuinely disagree, and
// only ArgoCD's was actually catching the problem.
const HEALTH_SEVERITY: Record<Health, number> = { healthy: 0, unknown: 1, paused: 2, progressing: 3, degraded: 4 };

export function health(env: EnvironmentSummary): Health {
  const rollout = rolloutHealthOf(env);
  const argo = argoHealthOf(env.argoHealthStatus);
  if (!argo) return rollout;
  return HEALTH_SEVERITY[argo] >= HEALTH_SEVERITY[rollout] ? argo : rollout;
}

// Whether this env's own Rollout is still actively canarying - the one
// signal that's both real-time-live (comes straight off useTowerEnvironments'
// own Kubernetes poll, not a GitHub-backed fetch) and cheap enough to check
// from anywhere, including outside the CI/CD tab (2026-09-12: "make the
// CICD tab dynamic and change when there's active deliveries"). Shared
// rather than defined once per caller (CiCdTab.tsx and TowerPage.tsx both
// need the exact same definition - the tab bar's own activity dot would
// silently drift from the CD panel's own "is anything active" logic
// otherwise).
export function isRolloutActive(env: EnvironmentSummary): boolean {
  // Weight-ramping (a multi-step canary mid-way through its steps) is one
  // real "active" shape, but not the only one - a single-step strategy
  // (e.g. `steps: [{setWeight: 100}]`, effectively a plain rolling update
  // dressed up as canary) jumps straight to weight 100 the instant it
  // starts, so this alone missed it entirely (2026-09-12 bug: "the CICD tab
  // is still not showing the amber activity dot" - confirmed live on
  // app-order-api-prod: status.phase Progressing, 1/2 replicas ready,
  // Healthy: False, yet currentWeight was already 100). Argo Rollouts' own
  // status.phase is the general-purpose "is this rollout still settling"
  // signal - Progressing means exactly that, regardless of step shape -
  // so it's checked alongside the weight-ramp case rather than replacing it.
  const weight = env.workload?.kind === 'Rollout' ? env.workload.canaryProgress?.currentWeight : undefined;
  if (weight !== undefined && weight < 100) return true;
  return env.rolloutPhase === 'Progressing';
}

// --- Config tab (mirrors packages/backend/src/glidepathConfig.ts) ---------

// Kept in sync by hand with glidepathConfig.ts's own CONFIG_TOP_LEVEL_FIELDS
// - there's no shared package between backend/frontend here (same posture
// as every other Tower type in this file), so this list is this feature's
// one place that has to be remembered to move together with the backend's.
export const CONFIG_TOP_LEVEL_FIELDS = [
  'serviceAccount',
  'rollout',
  'analysisTemplates',
  'env',
  'configMaps',
  'secrets',
  'notifications',
  'volumes',
  'cronJobs',
  'jobs',
  'autoscaling',
  'podDisruptionBudget',
  'ingress',
  'httpRoute',
  'serviceMonitor',
  'networkPolicy',
  'extraManifests',
] as const;
export type ConfigTopLevelField = (typeof CONFIG_TOP_LEVEL_FIELDS)[number];

export interface AppConfigResponse {
  cluster: string;
  env: string;
  path: string;
  values: Partial<Record<ConfigTopLevelField, unknown>>;
  // Full, unfiltered committed file content - '' when nothing's been
  // committed for this env yet. Read-only "view the real file" panel only.
  raw: string;
}

export interface ConfigChangeRequest {
  owner: string;
  appName: string;
  cluster: string;
  env: string;
  patch: Partial<Record<ConfigTopLevelField, unknown>>;
  summary: string[];
}

export interface ConfigChangeResult {
  prUrl: string;
  alreadyOpen: boolean;
}

export interface EnvXrResponse {
  env: string;
  path: string;
  configMapGenerator: boolean;
}

export interface EnvXrChangeRequest {
  owner: string;
  appName: string;
  env: string;
  configMapGenerator: boolean;
}

// The ConfigMapGenerator source directory (<cluster>/<env>/configmap/*) a
// values.yaml configMaps: entry's existingConfigMap: can reference - see
// glidepathConfig.ts's own top comment on this feature.
export interface ConfigMapFileSummary {
  name: string;
  content: string;
}

export interface ConfigMapFilesResponse {
  cluster: string;
  env: string;
  path: string;
  files: ConfigMapFileSummary[];
  configMapName?: string;
}

export interface ConfigMapFilesChangeRequest {
  owner: string;
  appName: string;
  cluster: string;
  env: string;
  files: ConfigMapFileSummary[];
  deletedFiles: string[];
}

// --- Glidepath tab (mirrors packages/backend/src/glidepathCicdConfig.ts and
// glidepathPlatformConfig.ts) -----------------------------------------------
//
// Same "no shared package, kept in sync by hand" posture as Config's own
// types above.

export const CICD_TOP_LEVEL_FIELDS = [
  'build',
  'test',
  'deploy',
  'ephemeralEnvironments',
  'governance',
  'notifications',
  'secrets',
  'pipelines',
] as const;
export type CicdTopLevelField = (typeof CICD_TOP_LEVEL_FIELDS)[number];

export interface CicdConfigResponse {
  repo: string;
  path: string;
  apiVersion?: string;
  kind?: string;
  values: Partial<Record<CicdTopLevelField, unknown>>;
  raw: string;
}

export interface CicdConfigChangeRequest {
  owner: string;
  appName: string;
  patch: Partial<Record<CicdTopLevelField, unknown>>;
  summary: string[];
}

export interface CicdConfigChangeResult {
  prUrl: string;
  alreadyOpen: boolean;
}

// platform/pr-env.yaml and platform/envs/<env>.yaml both render through the
// same airframe-application chart as gitops-<app>/values.yaml, so they reuse
// Config's own ConfigTopLevelField allowlist rather than a separate one.
export type PlatformEnvSelector = { kind: 'pr-env' } | { kind: 'env'; env: string };

export interface PlatformFileResponse {
  repo: string;
  path: string;
  values: Partial<Record<ConfigTopLevelField, unknown>>;
  raw: string;
}

export interface PlatformFileChangeRequest {
  owner: string;
  appName: string;
  selector: PlatformEnvSelector;
  patch: Partial<Record<ConfigTopLevelField, unknown>>;
  summary: string[];
}

export interface PlatformFileChangeResult {
  prUrl: string;
  alreadyOpen: boolean;
}

export interface PlatformEnvsResponse {
  envs: string[];
}

// Mirrors airframe's slos.catalog.idp.io v1alpha1 XRD schema exactly (see
// airframe/xrds/slo.yaml) - this platform's SLO XR wraps Sloth
// (prometheusservicelevels.sloth.slok.dev), which is what actually computes
// the multi-window-multi-burn-rate PromQL from just `objective`.
export interface SloIndicator {
  type: 'availability' | 'latency';
  metric: string;
  totalFilter: string;
  errorFilter?: string;
  latencyThreshold?: string;
}

export interface SloSummary {
  name: string;
  cluster: string;
  namespace: string;
  environmentRefName?: string;
  // The real, human-readable env name (hangar.io/env label - the same one
  // envLabelOf reads off a Rollout/Deployment in useTowerEnvironments.ts) -
  // 2026-09-15: `name`/`service` are commonly IDENTICAL across environments
  // by design (the same SLO promoted to prod and a new proofing env, say),
  // so this is what actually distinguishes two otherwise-identical-looking
  // SLO cards. Prefer this over environmentRefName for display - that field
  // carries the full ApplicationEnvironment XR name (e.g.
  // "checkout-api-kind-prod-proofing"), not the bare env a user thinks in
  // terms of.
  env?: string;
  service: string;
  objective: number;
  indicator: SloIndicator;
  // Sloth stamps this on the PrometheusServiceLevel/PrometheusRule it
  // generates (sloth_id label) - the join key every Prometheus query for
  // this SLO's recording rules needs (sloth_service/sloth_slo pair matches
  // `service`/`name` above exactly, see build below). No longer sufficient
  // on its own to select a unique series in Prometheus once the same
  // name/service is promoted to more than one environment - see
  // SlosTab.tsx's selectorFor, which now also matches on `namespace`
  // (Sloth's own per-SLO `labels` field, added to the generated
  // PrometheusServiceLevel by airframe's composition template 2026-09-15).
  slothId: string;
}
