import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy';
import { chainIdToSlug } from './chainSlug';
import type { PipelineRunSummary, PipelineTaskDef, RunPhase, TaskRunSummary } from './types';

// Real Tekton PipelineRuns for an app live in `app-<appName>-cicd` on the
// `kind-dev` cluster - the only cluster actually running Tekton (confirmed
// live: `kubectl get crd | grep tekton.dev` returns nothing on kind-prod,
// nothing runs on kind-man at all - see app-config.yaml's own comment on
// kind-dev's customResources block). User-confirmed, 2026-09-11.
// Exported for useTektonResultsRuns.ts - archived runs live in the same
// namespace on the same (only) Tekton-running cluster as their live
// counterparts.
export const TEKTON_CLUSTER = 'kind-dev';
const POLL_MS = 6000;

// Deliberately NOT fetched via useCustomResources(entity, [...]) the way
// Rollout/HTTPRoute/PDB are elsewhere in Tower (see useTowerEnvironments.ts):
// that path resolves objects through the entity's own
// `backstage.io/kubernetes-label-selector` annotation, which the
// kubernetes-ingestor patch computes as `hangar.io/app=<name>` (see
// .yarn/patches's kubernetes-label-selector fix). Whether a Tekton
// PipelineRun even carries that label turns out to be inconsistent: a real
// onboarded app's own build/deploy/test pipeline (confirmed live,
// app-checkout-api-cicd) does carry `hangar.io/app`/`hangar.io/flow`, but
// this app's own bootstrap CI pipeline (app-backstage-cicd, self-hosting
// Backstage) still only carries the pre-rebrand `platform.io/app` pair - two
// different apps, two different label sets, neither of them something this
// tab should have to guess right for every app it's ever pointed at. See
// ../k8sProxy.ts for the actual proxy mechanism this (and now
// useAnalysisRuns.ts, hitting the exact same problem for Argo Rollouts'
// AnalysisRun child resources) uses instead.

interface RawTaskRefParam {
  name: string;
  value: string;
}
interface RawTaskRef {
  name?: string;
  resolver?: string;
  params?: RawTaskRefParam[];
}
interface RawPipelineTask {
  name: string;
  runAfter?: string[];
  taskRef?: RawTaskRef;
}
interface RawChildRef {
  kind: string;
  name: string;
  pipelineTaskName: string;
}
interface RawCondition {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  reason?: string;
  message?: string;
}
interface RawObjectMeta {
  name: string;
  namespace: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  creationTimestamp?: string;
}
export interface RawPipelineRun {
  metadata: RawObjectMeta;
  spec?: {
    params?: RawParam[];
  };
  status?: {
    conditions?: RawCondition[];
    pipelineSpec?: { tasks?: RawPipelineTask[]; finally?: RawPipelineTask[] };
    childReferences?: RawChildRef[];
    startTime?: string;
    completionTime?: string;
    results?: RawResult[];
  };
}
interface RawTaskRunStep {
  name: string;
  container: string;
  terminated?: { exitCode?: number; startedAt?: string; finishedAt?: string };
  running?: { startedAt?: string };
}
interface RawParam {
  name: string;
  value: unknown;
}
interface RawResult {
  name: string;
  value: unknown;
}
export interface RawTaskRun {
  metadata: RawObjectMeta;
  spec?: {
    params?: RawParam[];
  };
  status?: {
    conditions?: RawCondition[];
    podName?: string;
    startTime?: string;
    completionTime?: string;
    steps?: RawTaskRunStep[];
    results?: RawResult[];
  };
}

// Tekton param/result values are technically a union (string | string[] |
// Record<string,string>) - every real one seen on this platform so far
// (confirmed live) is a plain string, but a task result carrying structured
// data (e.g. a JSON blob passed through as one string, or a genuine
// array/object result) shouldn't crash the detail panel - stringify
// anything that isn't already a string.
function paramValueToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return JSON.stringify(value);
}

function field(meta: RawObjectMeta, name: string): string | undefined {
  return meta.labels?.[name] ?? meta.annotations?.[name];
}

// Every gitops-repo-triggered release-guardrail/gate Pipeline in
// glidepath-catalog (charts/glidepath-catalog/templates/pipelines/*.yaml) -
// the 4 "real" scan gates plus the 4 governance/process gates delivered by
// the same onboarding-templates/gitops-repo/pull-request-*.yaml mechanism
// (confirmed live in glidepath, 2026-09-17: all 8 PipelineRun templates
// carry only `hangar.io/app`, no flow label at all) - so they were silently
// dropped by this hook's old ci/pr-build-only filter even though they run in
// this exact namespace. Tekton itself stamps the real resolved Pipeline name
// onto `tekton.dev/pipeline` regardless of whether the PipelineRun
// referenced it by plain name or a cluster resolver, so that existing label
// (already read into `pipelineName` below) is what this detects against,
// rather than re-deriving it from spec.pipelineRef.
const GUARDRAIL_PIPELINE_NAMES = [
  'sast-check',
  'image-scan-check',
  'provenance-check',
  'sbom-check',
  'governance-check',
  'qa-check',
  'image-promotion-check',
  'bypass-merge-check',
];

// release-outcome-notify/release-progress-notify (charts/glidepath-app/
// templates/triggers/release-{outcome,progress}-trigger.yaml) are CDEvent-
// triggered tracking/notification PipelineRuns, a genuinely different
// mechanism from the event-chained build/test/deploy/release flow - but they
// only ever fire because of a real release flow's own progress/outcome, and
// carry a chain-id linking them right back to it. They're labeled
// `hangar.io/subcomponent: release-outcome`/`release-progress`, never
// `hangar.io/flow` (confirmed live, 2026-09-17) - folded into the 'ci'
// bucket (2026-09-17 bug report: "they link to the correct release flow,
// however they don't show up in the Release flows filter... they should be
// included") rather than left unlabeled, since that's how a user actually
// thinks of them.
const RELEASE_TRACKING_SUBCOMPONENTS = ['release-outcome', 'release-progress'];

// The app/flow labeling convention itself went through the same hangar.io
// rebrand as everything else in Tower (see useTowerEnvironments.ts's own
// kubernetes-label-selector comment) - but unlike that fix, platform-cicd's
// Tekton labels weren't uniformly migrated: a real onboarded app's actual
// build/deploy/test pipeline runs (confirmed live, app-checkout-api-cicd)
// carry `hangar.io/app` + `hangar.io/flow`, while this app's own bootstrap
// CI pipeline (app-backstage-cicd, self-hosting Backstage) still only
// carries the older `platform.io/*` pair. hangar.io wins when both exist.
function hangarField(meta: RawObjectMeta, suffix: string): string | undefined {
  return field(meta, `hangar.io/${suffix}`) ?? field(meta, `platform.io/${suffix}`);
}

function resolveTaskRefName(ref?: RawTaskRef): string | undefined {
  if (!ref) return undefined;
  return ref.resolver === 'cluster' ? ref.params?.find(p => p.name === 'name')?.value : ref.name;
}

function toTaskDef(t: RawPipelineTask): PipelineTaskDef {
  return { name: t.name, runAfter: t.runAfter ?? [], taskRefName: resolveTaskRefName(t.taskRef) };
}

// Tower's own Cancel action (useCancelPipelineRun.ts) merge-patches
// spec.status to "CancelledRunFinally" rather than bare "Cancelled" so a
// cancelled run's finally block (where the notification tasks live) still
// fires - see that hook's own comment. Either reason value lands here as a
// False Succeeded condition exactly like a genuine failure, so without this
// check a cancelled run showed as 'failed' everywhere the CI table reads
// phase (2026-09-16 bug: "a canceled pipelinerun should show a 'canceled'
// pill, not 'failed'").
function isCancelledReason(reason: string | undefined): boolean {
  return reason === 'Cancelled' || reason === 'CancelledRunFinally' || reason === 'PipelineRunCancelled';
}

function conditionPhase(conditions: RawCondition[] | undefined): RunPhase {
  const c = conditions?.find(cond => cond.type === 'Succeeded');
  if (!c) return 'pending';
  if (c.status === 'True') return 'succeeded';
  if (c.status === 'False') return isCancelledReason(c.reason) ? 'cancelled' : 'failed';
  return 'running';
}

function stepState(step: RawTaskRunStep): 'running' | 'terminated' | 'waiting' {
  if (step.terminated) return 'terminated';
  if (step.running) return 'running';
  return 'waiting';
}

// Exported so useTektonResultsRuns.ts can turn an ARCHIVED run (unwrapped
// from a Tekton Results Record - same underlying tekton.dev PipelineRun/
// TaskRun object shape, just fetched from a durable store instead of a live
// watch) into the exact same summary shape a live run produces, rather than
// a second, parallel parser that could quietly drift from this one.
export function toTaskRunSummary(raw: RawTaskRun, pipelineTaskName: string): TaskRunSummary {
  const cond = raw.status?.conditions?.find(c => c.type === 'Succeeded');
  return {
    name: raw.metadata.name,
    pipelineTaskName,
    phase: conditionPhase(raw.status?.conditions),
    reason: cond?.reason,
    message: cond?.message,
    podName: raw.status?.podName,
    namespace: raw.metadata.namespace,
    startTime: raw.status?.startTime,
    completionTime: raw.status?.completionTime,
    steps: (raw.status?.steps ?? []).map(s => ({
      name: s.name,
      container: s.container,
      state: stepState(s),
      exitCode: s.terminated?.exitCode,
      startedAt: s.terminated?.startedAt ?? s.running?.startedAt,
      finishedAt: s.terminated?.finishedAt,
    })),
    params: (raw.spec?.params ?? []).map(p => ({ name: p.name, value: paramValueToString(p.value) })),
    results: (raw.status?.results ?? []).map(r => ({ name: r.name, value: paramValueToString(r.value) })),
    raw,
  };
}

// No label carries this - the flow-correlation slug only ever exists
// embedded in the run's own generated name (`ci-<step-index>-<stage>-<slug>-
// <suffix>`), confirmed live. Both `<stage>` and `<slug>` can themselves
// contain hyphens (e.g. stage "gitops-image-bump", slug "firm-bear"), so
// this can't just split the name by position - it strips the known
// `ci-<step-index>-<stage>-` prefix (real values, from this same run's own
// labels) and, of what's left, treats everything before the final hyphen
// segment (always the trailing random suffix) as the slug. A first-stage
// run (no chain to correlate against yet) has nothing left after the prefix
// but its own suffix, so this correctly returns undefined for it.
function extractFlowSlug(name: string, meta: RawObjectMeta): string | undefined {
  const stepIndex = hangarField(meta, 'step-index');
  const stage = hangarField(meta, 'stage');
  if (stepIndex === undefined || stage === undefined) return undefined;
  const prefix = `ci-${stepIndex}-${stage}-`;
  if (!name.startsWith(prefix)) return undefined;
  const rest = name.slice(prefix.length);
  const lastDash = rest.lastIndexOf('-');
  return lastDash === -1 ? undefined : rest.slice(0, lastDash);
}

// A CDEvent-triggered run's flowSlug (extractFlowSlug, above) comes from its
// own generated name - but the flow's own first stage, the git-triggered
// build pipeline, is named by Pipelines-as-Code's own convention and
// carries no such slug in its name at all (2026-09-12: "is there anything
// in the pipelinerun from a build pipeline that gets associated with the
// remaining flow pipelines? some way to visually link them"). It DOES share
// the same real chain-id with every downstream stage - just exposed
// differently: a CDEvent-triggered run carries chain-id as a real
// spec.params entry (confirmed live in glidepath-app's flow-triggers.yaml
// TriggerTemplate), while build only ever generates a fresh one internally
// (start-flow-root-span) and is never handed it back as a param of its
// own - the one place it's still visible on build's own PipelineRun object
// is its own `start-flow` pipeline task's TaskRun result (confirmed live:
// chain-id/traceparent/start-time are all real TaskRun results there,
// already fetched into taskRunsByPipelineTask by toTaskRunSummary above).
function chainIdOf(run: PipelineRunSummary): string | undefined {
  const fromParam = run.params.find(p => p.name === 'chain-id')?.value;
  if (fromParam) return fromParam;
  return run.taskRunsByPipelineTask['start-flow']?.results.find(r => r.name === 'chain-id')?.value;
}

// Backward-compatibility fallback only, now that every run's own start-flow
// task computes chain-slug directly (toPipelineRunSummary's own flowSlug
// line, preferred first) - this only still matters for a run whose
// PipelineRun predates that toolbox image, which won't have a chain-slug
// result to read. For those, borrow whichever sibling run sharing the same
// chain-id already parsed a slug out of its own generated name (any
// CDEvent-triggered stage - extractFlowSlug), and backfill it onto build's
// run (and any other chain-id-bearing run with no slug of its own) so the
// whole flow still visually shares one chip during the rollout window.
// Never re-derives the slug itself from chain-id - chain_id_to_slug's own
// adjective/noun wordlists live only inside the toolbox image
// (catalog/lib/chain-slug.sh), and duplicating them here would silently
// drift the moment that image's wordlists ever change.
// Exported for useTektonResultsRuns.ts's own merged live+archived list -
// once archived runs are unwrapped into PipelineRunSummary via
// toPipelineRunSummary below, re-running this same slug-borrowing pass over
// the COMBINED set (not just the live-only list this hook itself builds) is
// what lets an old, already-pruned build run's slug still show up on a
// still-live downstream stage's chip, and vice versa.
export function linkFlowSlugsByChainId(runs: PipelineRunSummary[]): void {
  const slugByChainId = new Map<string, string>();
  runs.forEach(run => {
    const chainId = chainIdOf(run);
    if (chainId && run.flowSlug && !slugByChainId.has(chainId)) slugByChainId.set(chainId, run.flowSlug);
  });
  runs.forEach(run => {
    if (run.flowSlug) return;
    const chainId = chainIdOf(run);
    const borrowed = chainId ? slugByChainId.get(chainId) : undefined;
    if (borrowed) {
      run.flowSlug = borrowed;
      return;
    }
    // Last resort (2026-09-24): a promotion chain (Tower Promote mints a fresh
    // chain-id) has no build/deploy/test sibling at all, so nothing to borrow
    // from - derive the same deterministic slug the toolbox would have. See
    // chainSlug.ts for why this is a fallback only.
    const derived = chainId ? chainIdToSlug(chainId) : undefined;
    if (derived) run.flowSlug = derived;
  });
}

// Exported for useTektonResultsRuns.ts - see toTaskRunSummary's own comment
// above for why an archived run is fed through this exact function rather
// than a parallel one.
export function toPipelineRunSummary(
  raw: RawPipelineRun,
  cluster: string,
  taskRunsByName: Map<string, RawTaskRun>,
): PipelineRunSummary {
  const meta = raw.metadata;
  const cond = raw.status?.conditions?.find(c => c.type === 'Succeeded');
  const taskRunsByPipelineTask: Record<string, TaskRunSummary> = {};
  (raw.status?.childReferences ?? []).forEach(ref => {
    if (ref.kind !== 'TaskRun') return;
    const trRaw = taskRunsByName.get(ref.name);
    if (trRaw) taskRunsByPipelineTask[ref.pipelineTaskName] = toTaskRunSummary(trRaw, ref.pipelineTaskName);
  });

  const urlOrg = field(meta, 'pipelinesascode.tekton.dev/url-org');
  const urlRepo = field(meta, 'pipelinesascode.tekton.dev/url-repository');
  const pipelineName = field(meta, 'tekton.dev/pipeline');

  return {
    name: meta.name,
    namespace: meta.namespace,
    cluster,
    pipelineName,
    appName: hangarField(meta, 'app'),
    sha: field(meta, 'pipelinesascode.tekton.dev/sha'),
    branch: field(meta, 'pipelinesascode.tekton.dev/source-branch')?.replace(/^refs\/heads\//, ''),
    author: field(meta, 'pipelinesascode.tekton.dev/sender'),
    eventType: field(meta, 'pipelinesascode.tekton.dev/event-type'),
    sourceRepoUrl:
      field(meta, 'pipelinesascode.tekton.dev/source-repo-url') ??
      (urlOrg && urlRepo ? `https://github.com/${urlOrg}/${urlRepo}` : undefined),
    triggerName: field(meta, 'triggers.tekton.dev/trigger'),
    // Prefer the real chain-slug result every run's own start-flow-root-span
    // task now computes directly (platform-cicd 2026-09-16 - see that Task's
    // own comment) over parsing it back out of a CDEvent-triggered run's
    // generated name (extractFlowSlug) - structured data over string-
    // parsing, and it's what closes the build-only-flow gap: a git-rooted
    // build run has never had a name-embeddable slug (extractFlowSlug always
    // returns undefined for it), but it always runs start-flow-root-span, so
    // this now resolves for it directly instead of only via
    // linkFlowSlugsByChainId borrowing one from a downstream sibling that
    // may not exist. Falls back to the name-based extraction for any run
    // that predates the toolbox image carrying this result.
    flowSlug:
      taskRunsByPipelineTask['start-flow']?.results.find(r => r.name === 'chain-slug')?.value ??
      extractFlowSlug(meta.name, meta),
    // Falls back to a derived 'guardrail' bucket, or folds into 'ci', when
    // there's no explicit flow label at all (every real guardrail
    // PipelineRun and both release-tracking PipelineRuns today) - anything
    // still unmatched (e.g. onboarding-resync, which genuinely shares this
    // namespace but isn't a guardrail or part of the release-tracking pair)
    // stays undefined, which "All flows" already shows, rather than picking
    // a misleading label for it.
    flow:
      hangarField(meta, 'flow') ??
      (pipelineName && GUARDRAIL_PIPELINE_NAMES.includes(pipelineName) ? 'guardrail' : undefined) ??
      (RELEASE_TRACKING_SUBCOMPONENTS.includes(hangarField(meta, 'subcomponent') ?? '') ? 'ci' : undefined),
    phase: conditionPhase(raw.status?.conditions),
    reason: cond?.reason,
    message: cond?.message,
    startTime: raw.status?.startTime ?? meta.creationTimestamp,
    completionTime: raw.status?.completionTime,
    tasks: (raw.status?.pipelineSpec?.tasks ?? []).map(toTaskDef),
    finallyTasks: (raw.status?.pipelineSpec?.finally ?? []).map(toTaskDef),
    taskRunsByPipelineTask,
    params: (raw.spec?.params ?? []).map(p => ({ name: p.name, value: paramValueToString(p.value) })),
    results: (raw.status?.results ?? []).map(r => ({ name: r.name, value: paramValueToString(r.value) })),
    raw,
  };
}

export interface UseTektonPipelineRunsResult {
  loading: boolean;
  error?: string;
  runs: PipelineRunSummary[];
}

// Polled (unlike Tower's GitHub-backed hooks) - this hits the app's own
// cluster directly, not a rate-limited external API, and a running
// PipelineRun's whole point on this tab is watching it move. Caps how many
// runs it keeps in memory via Pipelines-as-Code's own `max-keep-runs`
// annotation (5, confirmed live) - it prunes old PipelineRuns itself, so
// there's never an unbounded list to page through here.
// refreshNonce: bump it (from a caller's own useState, same convention as
// every other manually-refreshable hook in Tower) to force an immediate
// re-fetch instead of waiting out the rest of the current 6s poll interval -
// wired to the CI/CD tab's own Refresh control.
export function useTektonPipelineRuns(
  appName: string | undefined,
  refreshNonce = 0,
): UseTektonPipelineRunsResult {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<UseTektonPipelineRunsResult>({ loading: Boolean(appName), runs: [] });

  useEffect(() => {
    if (!appName) {
      setState({ loading: false, runs: [] });
      return undefined;
    }
    const namespace = `app-${appName}-cicd`;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      try {
        const [prList, trList] = await Promise.all([
          k8sProxyGet<{ items: RawPipelineRun[] }>(
            discoveryApi,
            fetchApi,
            TEKTON_CLUSTER,
            `/apis/tekton.dev/v1/namespaces/${namespace}/pipelineruns`,
          ),
          k8sProxyGet<{ items: RawTaskRun[] }>(
            discoveryApi,
            fetchApi,
            TEKTON_CLUSTER,
            `/apis/tekton.dev/v1/namespaces/${namespace}/taskruns`,
          ),
        ]);
        if (cancelled) return;
        const taskRunsByName = new Map(trList.items.map(tr => [tr.metadata.name, tr]));
        // 2026-09-16: this hook used to filter to only hangar.io/flow
        // ci/pr-build, on the theory that this namespace also carries other,
        // unrelated Tekton flows (e.g. release-outcome-notify's tracing/
        // CDEvents pipeline, confirmed live on app-checkout-api-cicd). That
        // filter also silently dropped every real release-guardrail
        // PipelineRun (sast/image-scan/provenance/sbom) - they genuinely run
        // in this exact namespace and carry no flow label at all, so they
        // were invisible even though they're real CI/CD work. Per explicit
        // direction: anything executing in this namespace should be visible
        // and filterable here, not fetch-time-excluded - toPipelineRunSummary
        // now derives a 'guardrail' flow for the four known guardrail
        // Pipelines, and PipelineRunList's "All flows" chip is what shows
        // everything else (including genuinely unrelated flows like the
        // tracing pipeline) rather than this hook guessing what to hide.
        const runs = prList.items
          .map(pr => toPipelineRunSummary(pr, TEKTON_CLUSTER, taskRunsByName))
          .sort((a, b) => new Date(b.startTime ?? 0).getTime() - new Date(a.startTime ?? 0).getTime());
        linkFlowSlugsByChainId(runs);
        setState({ loading: false, runs });
      } catch (e) {
        if (!cancelled) setState(prev => ({ loading: false, runs: prev.runs, error: String(e) }));
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    }

    setState(prev => ({ loading: prev.runs.length === 0, runs: prev.runs }));
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [appName, discoveryApi, fetchApi, refreshNonce]);

  return state;
}
