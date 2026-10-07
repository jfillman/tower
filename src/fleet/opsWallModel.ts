import { health, isPreviewEnvName, isRolloutActive, type EnvironmentSummary } from '../types';
import type { FleetApp } from '../useFleetEnvironments';
import type { FleetSloRow } from '../useFleetSlos';
import { runAppName, type FleetRun, type RunProgress } from './fleetRuns';
import {
  PIPELINE_CATEGORIES,
  pipelineCategory,
  type HistoryRun,
  type HistoryStatus,
  type PipelineCategory,
} from './pipelineHistory';
import { DEPLOYING_STATES, FAILED_STATES, type ReleaseEvent, type ReleaseRecord } from './releaseRecords';

// Everything the Ops Wall shows, derived from the polled sources in one pure function so every
// rule is a plain unit test. The page only renders what this returns.

// ---- thresholds (one place; see HANDOFF-tower-ops-wall.md section 5.3)
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const APPROVAL_WAIT_WARN_MS = 4 * HOUR;
export const QUEUED_WARN_MS = 5 * MIN;
export const SLOW_RUN_FACTOR = 3;
export const SLOW_RUN_FALLBACK_SEC = 45 * 60;
export const SLOW_RUN_MIN_SEC = 10 * 60;
export const TYPICAL_MIN_SAMPLES = 3;
export const POD_NOT_READY_MS = 5 * MIN;
export const POD_RESTARTS_WARN = 3;
export const PREVIEW_STALE_MS = 7 * DAY;
export const SLO_BUDGET_LOW = 0.25;

export type Severity = 'critical' | 'high' | 'warn' | 'info';
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, warn: 2, info: 3 };

export interface OpsLink {
  label: string;
  href: string;
  /** Leaves Backstage (GitHub, a cloud console). */
  external?: boolean;
}

/** Builds a link into Tower for one app, or undefined when the app is not in the catalog. */
export type TowerHref = (app: string, tab: string, params?: Record<string, string>) => string | undefined;

export interface AttentionItem {
  id: string;
  rule: string;
  severity: Severity;
  app: string;
  env?: string;
  title: string;
  detail?: string;
  /** When the condition started, if known. */
  since?: string;
  links: OpsLink[];
}

export interface PipelineItem {
  key: string;
  app: string;
  pipeline: string;
  category: PipelineCategory;
  stage?: string;
  phase: FleetRun['run']['phase'];
  progress?: RunProgress;
  startedAt?: string;
  elapsedSec?: number;
  typicalSec?: number;
  slow: boolean;
  queuedLong: boolean;
  title?: string;
  sha?: string;
  author?: string;
  prNumber?: string;
  eventType?: string;
  links: OpsLink[];
}

export type DeploymentKind = 'release' | 'ground' | 'cloud' | 'rollout';

export interface CanaryState {
  weight?: number;
  step?: number;
  steps?: number;
}

export interface DeploymentItem {
  key: string;
  kind: DeploymentKind;
  app: string;
  env: string;
  cluster?: string;
  /** Short state label: "progressing", "sync failed", "deploy pipeline", ... */
  state: string;
  tone: 'active' | 'bad' | 'paused';
  /** What it deploys to, when not Kubernetes ("AWS Lambda"). */
  target?: string;
  detail?: string;
  startedAt?: string;
  canary?: CanaryState;
  progress?: RunProgress;
  links: OpsLink[];
}

export interface LandedItem {
  key: string;
  app: string;
  env: string;
  cluster?: string;
  kind: DeploymentKind;
  ok: boolean;
  at: string;
  links: OpsLink[];
}

export interface ApprovalItem {
  key: string;
  app: string;
  env: string;
  cluster: string;
  since?: string;
  prUrl?: string;
}

export interface OpsKpis {
  pipelinesRunning: number;
  pipelinesQueued: number;
  slowRuns: number;
  deploying: number;
  /** Lowest canary weight among deploys mid-canary, for the sub-line. */
  canaries: number;
  awaitingApproval: number;
  oldestApprovalSince?: string;
  envsFailing: number;
  envsTotal: number;
  outOfSync: number;
  pausedRollouts: number;
}

export interface WindowStats {
  runs: number;
  failedRuns: number;
  /** p50 duration of finished runs, seconds. */
  p50Sec?: number;
}

/** A finished run, live or archived. */
export interface FinishedRun {
  key: string;
  app: string;
  name: string;
  pipeline: string;
  category: PipelineCategory;
  status: HistoryStatus;
  startTime?: string;
  endTime?: string;
  durationSec?: number;
  /** Why it failed, when the live run's TaskRuns say. */
  detail?: string;
  checkRunUrl?: string;
  env?: string;
}

export interface OpsWallModel {
  kpis: OpsKpis;
  attention: AttentionItem[];
  pipelines: PipelineItem[];
  /** Finished in the window, newest first, category filter applied. */
  recentRuns: FinishedRun[];
  pipelineStats: WindowStats;
  /** Runs per category in the window (live + finished), before the category filter: the filter chips' counts. */
  pipelineCounts: Record<PipelineCategory, number>;
  deployments: DeploymentItem[];
  approvals: ApprovalItem[];
  landed: LandedItem[];
}

export interface ProvisioningSignal {
  name: string;
  failed: boolean;
  stalled: boolean;
  since?: string;
}

export interface OpsWallInputs {
  now: number;
  windowMs: number;
  apps: FleetApp[];
  runs: FleetRun[];
  /** Finished runs from Tekton Results, covering the window. */
  history?: HistoryRun[];
  /** Pipeline categories to show. Undefined = all. */
  pipelineCategories?: Set<PipelineCategory>;
  records: ReleaseRecord[];
  events: ReleaseEvent[];
  slos: FleetSloRow[];
  provisioning: ProvisioningSignal[];
  towerHref: TowerHref;
  /** Limits everything to these apps (the owner filter). Undefined = the whole fleet. */
  appFilter?: Set<string>;
}

// ---- helpers

const ms = (iso: string | undefined) => (iso ? Date.parse(iso) : NaN);
const ageMs = (now: number, iso: string | undefined) => {
  const t = ms(iso);
  return Number.isNaN(t) ? undefined : now - t;
};
const within = (now: number, windowMs: number, iso: string | undefined) => {
  const a = ageMs(now, iso);
  return a !== undefined && a <= windowMs;
};

/** Newest first; anything without a time goes last. */
const newestFirst = (a: string | undefined, b: string | undefined) => (ms(b) || 0) - (ms(a) || 0);

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const tower = (href: TowerHref, app: string, tab: string, label: string, params?: Record<string, string>) => {
  const h = href(app, tab, params);
  return h ? [{ label, href: h }] : [];
};

const ext = (label: string, href: string | undefined): OpsLink[] => (href ? [{ label, href, external: true }] : []);

const envKey = (app: string, env: string) => `${app}|${env}`;

export function canaryOf(env: EnvironmentSummary): CanaryState | undefined {
  const p = env.workload?.kind === 'Rollout' ? env.workload.canaryProgress : undefined;
  if (!p) return undefined;
  return {
    weight: p.currentWeight,
    step: p.currentStepIndex,
    steps: p.steps.length || undefined,
  };
}

function runPipelineName(r: FleetRun): string {
  return r.run.pipelineName ?? r.stage ?? r.run.name;
}

function runEnv(r: FleetRun): string {
  return r.cloud?.env ?? r.run.params.find(p => p.name === 'env')?.value ?? 'dev';
}

/** p50 duration of successful runs per pipeline, when there are enough of them to trust. */
export function typicalDurations(runs: FinishedRun[]): Map<string, number> {
  const byPipeline = new Map<string, number[]>();
  runs.forEach(r => {
    if (r.status !== 'succeeded' || r.durationSec === undefined) return;
    byPipeline.set(r.pipeline, [...(byPipeline.get(r.pipeline) ?? []), r.durationSec]);
  });
  const out = new Map<string, number>();
  byPipeline.forEach((list, k) => {
    if (list.length >= TYPICAL_MIN_SAMPLES) out.set(k, median(list)!);
  });
  return out;
}

function fromLive(r: FleetRun): FinishedRun | undefined {
  const { phase } = r.run;
  if (phase !== 'succeeded' && phase !== 'failed' && phase !== 'cancelled') return undefined;
  const pipeline = runPipelineName(r);
  const failedTask =
    phase === 'failed' ? Object.values(r.run.taskRunsByPipelineTask).find(t => t.phase === 'failed') : undefined;
  let detail: string | undefined;
  if (failedTask) detail = `task ${failedTask.pipelineTaskName}${failedTask.message ? `: ${failedTask.message}` : ''}`;
  else if (phase === 'failed') detail = r.run.reason;
  return {
    key: r.key,
    app: runAppName(r),
    name: r.run.name,
    pipeline,
    category: pipelineCategory(pipeline),
    status: phase,
    startTime: r.run.startTime,
    endTime: r.run.completionTime,
    durationSec: r.durationSec,
    detail,
    checkRunUrl: r.checkRunUrl,
    env: r.stage === 'deploy' || r.cloud ? runEnv(r) : undefined,
  };
}

function fromHistory(h: HistoryRun): FinishedRun {
  const pipeline = h.pipeline ?? h.name;
  return {
    key: h.key,
    app: h.app,
    name: h.name,
    pipeline,
    category: pipelineCategory(pipeline),
    status: h.status,
    startTime: h.startTime,
    endTime: h.endTime,
    durationSec: h.durationSec,
  };
}

export function isSlow(elapsedSec: number, typicalSec: number | undefined): boolean {
  if (typicalSec === undefined) return elapsedSec > SLOW_RUN_FALLBACK_SEC;
  return elapsedSec > Math.max(typicalSec * SLOW_RUN_FACTOR, SLOW_RUN_MIN_SEC);
}

const fmtMin = (sec: number) => (sec < 120 ? `${Math.round(sec)}s` : `${Math.round(sec / 60)}m`);

// ---- the model

export function buildOpsWallModel(input: OpsWallInputs): OpsWallModel {
  const { now, windowMs, towerHref: href, appFilter } = input;
  const keep = (app: string) => !appFilter || appFilter.has(app);
  const apps = input.apps.filter(a => keep(a.appName));
  const runs = input.runs.filter(r => keep(runAppName(r)));
  const records = input.records.filter(r => keep(r.appName));
  const slos = input.slos.filter(s => keep(s.service));
  const provisioning = input.provisioning.filter(p => keep(p.name));

  const attention: AttentionItem[] = [];
  const add = (item: AttentionItem) => attention.push(item);

  // ---- pipelines
  // Live runs (the last hour) and archived ones (the window) as one list of finished runs; the live copy
  // wins, it has task detail. Everything pipeline-derived honours the category filter; deployments do not.
  const shownCategory = (pipeline: string | undefined) =>
    !input.pipelineCategories || input.pipelineCategories.has(pipelineCategory(pipeline));
  const history = (input.history ?? []).filter(h => keep(h.app));
  const finishedByKey = new Map<string, FinishedRun>();
  history.forEach(h => finishedByKey.set(h.key, fromHistory(h)));
  runs.forEach(r => {
    const f = fromLive(r);
    if (f) finishedByKey.set(f.key, f);
  });
  const finishedAll = [...finishedByKey.values()];
  const typical = typicalDurations(finishedAll);

  const pipelineCounts = Object.fromEntries(PIPELINE_CATEGORIES.map(c => [c, 0])) as Record<PipelineCategory, number>;
  const live = runs.filter(r => r.run.phase === 'running' || r.run.phase === 'pending');
  live.forEach(r => {
    pipelineCounts[pipelineCategory(runPipelineName(r))] += 1;
  });
  finishedAll.forEach(f => {
    if (within(now, windowMs, f.endTime)) pipelineCounts[f.category] += 1;
  });

  const shownLive = live.filter(r => shownCategory(runPipelineName(r)));
  const pipelines: PipelineItem[] = shownLive.map(r => {
    const app = runAppName(r);
    const pipeline = runPipelineName(r);
    const startedAgo = ageMs(now, r.run.startTime);
    const elapsedSec = startedAgo === undefined ? undefined : Math.max(0, Math.round(startedAgo / 1000));
    const typicalSec = typical.get(pipeline);
    const slow = r.run.phase === 'running' && elapsedSec !== undefined && isSlow(elapsedSec, typicalSec);
    const queuedLong = r.run.phase === 'pending' && startedAgo !== undefined && startedAgo > QUEUED_WARN_MS;
    return {
      key: r.key,
      app,
      pipeline,
      category: pipelineCategory(pipeline),
      stage: r.stage,
      phase: r.run.phase,
      progress: r.progress,
      startedAt: r.run.startTime,
      elapsedSec,
      typicalSec,
      slow,
      queuedLong,
      title: r.title,
      sha: r.run.sha?.slice(0, 7),
      author: r.run.author,
      prNumber: r.prNumber,
      eventType: r.run.eventType,
      links: [
        ...tower(href, app, 'pipelines', 'Run', { run: r.run.name }),
        ...ext('Check', r.checkRunUrl),
        ...ext('Commit', r.shaUrl),
      ],
    };
  });
  pipelines.forEach(p => {
    if (p.slow) {
      add({
        id: `slow:${p.key}`,
        rule: 'pipeline-slow',
        severity: 'high',
        app: p.app,
        title: `${p.pipeline} running ${fmtMin(p.elapsedSec ?? 0)}`,
        detail: p.typicalSec !== undefined ? `usually ${fmtMin(p.typicalSec)}` : 'no typical duration yet',
        since: p.startedAt,
        links: p.links,
      });
    }
    if (p.queuedLong) {
      add({
        id: `queued:${p.key}`,
        rule: 'pipeline-queued',
        severity: 'warn',
        app: p.app,
        title: `${p.pipeline} queued, not started`,
        since: p.startedAt,
        links: p.links,
      });
    }
  });

  // The newest run of each (app, pipeline) failed and nothing newer is running: still broken.
  const latestByPipeline = new Map<string, { startTime?: string; failed?: FinishedRun }>();
  const consider = (app: string, pipeline: string, startTime: string | undefined, failed?: FinishedRun) => {
    if (!shownCategory(pipeline)) return;
    const k = `${app}|${pipeline}`;
    const prev = latestByPipeline.get(k);
    if (!prev || (ms(startTime) || 0) > (ms(prev.startTime) || 0)) latestByPipeline.set(k, { startTime, failed });
  };
  live.forEach(r => consider(runAppName(r), runPipelineName(r), r.run.startTime));
  finishedAll.forEach(f => consider(f.app, f.pipeline, f.startTime, f.status === 'failed' ? f : undefined));
  latestByPipeline.forEach(({ failed: f }) => {
    if (!f) return;
    add({
      id: `failed:${f.key}`,
      rule: 'pipeline-failed',
      severity: 'high',
      app: f.app,
      env: f.env,
      title: `${f.pipeline} failed`,
      detail: f.detail,
      since: f.endTime ?? f.startTime,
      links: [...tower(href, f.app, 'pipelines', 'Run', { run: f.name }), ...ext('Check', f.checkRunUrl)],
    });
  });

  const recentRuns = finishedAll
    .filter(f => shownCategory(f.pipeline) && within(now, windowMs, f.endTime))
    .sort((a, b) => newestFirst(a.endTime, b.endTime));
  const pipelineStats: WindowStats = {
    runs: recentRuns.length,
    failedRuns: recentRuns.filter(f => f.status === 'failed').length,
    p50Sec: median(recentRuns.map(f => f.durationSec).filter((d): d is number => d !== undefined)),
  };

  // ---- deployments
  const deployments: DeploymentItem[] = [];
  const deploymentKeys = new Set<string>();
  const envByKey = new Map<string, EnvironmentSummary>();
  apps.forEach(a => a.environments.forEach(e => envByKey.set(envKey(a.appName, e.env), e)));

  records
    .filter(r => DEPLOYING_STATES.has(r.state))
    .forEach(r => {
      const env = envByKey.get(envKey(r.appName, r.env));
      const bad = r.state === 'sync-failed';
      deploymentKeys.add(envKey(r.appName, r.env));
      deployments.push({
        key: `release:${r.namespace}/${r.name}`,
        kind: 'release',
        app: r.appName,
        env: r.env,
        cluster: r.cluster,
        state: r.state.replace('-', ' '),
        tone: bad ? 'bad' : 'active',
        detail: bad ? r.lastError : undefined,
        startedAt: r.mergedAt ?? r.stateAt,
        canary: env ? canaryOf(env) : undefined,
        links: [...tower(href, r.appName, 'deployments', 'Deployment', { env: r.env }), ...ext('PR', r.prUrl)],
      });
      if (bad) {
        add({
          id: `sync-failed:${r.name}`,
          rule: 'release-sync-failed',
          severity: 'critical',
          app: r.appName,
          env: r.env,
          title: `Release to ${r.env} failed to sync`,
          detail: r.lastError,
          since: r.stateAt,
          links: [...tower(href, r.appName, 'deployments', 'Deployment', { env: r.env }), ...ext('PR', r.prUrl)],
        });
      }
    });

  live
    .filter(r => r.cloud || r.stage === 'deploy')
    .forEach(r => {
      const app = runAppName(r);
      const env = runEnv(r);
      const k = envKey(app, env);
      if (deploymentKeys.has(k)) return;
      deploymentKeys.add(k);
      deployments.push({
        key: `run:${r.key}`,
        kind: r.cloud ? 'cloud' : 'ground',
        app,
        env,
        state: 'deploy pipeline',
        tone: 'active',
        target: r.cloud?.targetLabel,
        startedAt: r.run.startTime,
        progress: r.progress,
        links: [...tower(href, app, 'pipelines', 'Run', { run: r.run.name }), ...ext('Console', r.cloud?.consoleUrl)],
      });
    });

  // A Rollout moving with no release record or deploy run behind it: a manual or out-of-band change,
  // or the tail of a ground deploy whose pipeline already finished.
  apps.forEach(a =>
    a.environments.forEach(e => {
      const k = envKey(a.appName, e.env);
      const paused = health(e) === 'paused';
      if (deploymentKeys.has(k) || (!isRolloutActive(e) && !paused)) return;
      deploymentKeys.add(k);
      deployments.push({
        key: `rollout:${a.appName}/${e.cluster}/${e.namespace}`,
        kind: 'rollout',
        app: a.appName,
        env: e.env,
        cluster: e.cluster,
        state: paused ? 'paused' : 'rolling out',
        tone: paused ? 'paused' : 'active',
        detail: e.rolloutMessage,
        startedAt: e.deployedAt,
        canary: canaryOf(e),
        links: tower(href, a.appName, 'deployments', 'Deployment', { env: e.env }),
      });
    }),
  );
  deployments.sort((a, b) => newestFirst(a.startedAt, b.startedAt) || a.app.localeCompare(b.app));

  // ---- releases waiting for a human
  const approvals: ApprovalItem[] = records
    .filter(r => r.state === 'proposed')
    .map(r => ({
      key: `${r.namespace}/${r.name}`,
      app: r.appName,
      env: r.env,
      cluster: r.cluster,
      since: r.prCreatedAt ?? r.stateAt,
      prUrl: r.prUrl,
    }))
    .sort((a, b) => ms(a.since) - ms(b.since));
  approvals.forEach(a => {
    const waited = ageMs(now, a.since);
    if (waited === undefined || waited < APPROVAL_WAIT_WARN_MS) return;
    add({
      id: `approval:${a.key}`,
      rule: 'release-awaiting-merge',
      severity: 'warn',
      app: a.app,
      env: a.env,
      title: `Release PR to ${a.env} waiting for merge`,
      detail: a.cluster ? `on ${a.cluster}` : undefined,
      since: a.since,
      links: [...ext('PR', a.prUrl), ...tower(href, a.app, 'deployments', 'Deployment', { env: a.env })],
    });
  });

  // ---- release outcomes and Glidepath's own alerts
  const newerHealthy = (r: ReleaseRecord) =>
    records.some(
      o =>
        o !== r &&
        o.appName === r.appName &&
        o.env === r.env &&
        o.cluster === r.cluster &&
        (o.state === 'healthy' || o.state === 'superseded') &&
        ms(o.stateAt) > ms(r.stateAt),
    );
  records
    .filter(r => FAILED_STATES.has(r.state) && within(now, windowMs, r.stateAt) && !newerHealthy(r))
    .forEach(r =>
      add({
        id: `release-failed:${r.name}`,
        rule: 'release-failed',
        severity: 'critical',
        app: r.appName,
        env: r.env,
        title: `Release to ${r.env} ${r.state === 'aborted' ? 'aborted' : 'degraded'}`,
        detail: r.lastError,
        since: r.stateAt,
        links: [...tower(href, r.appName, 'deployments', 'Deployment', { env: r.env }), ...ext('PR', r.prUrl)],
      }),
    );

  const recordByName = new Map(records.map(r => [`${r.namespace}/${r.name}`, r]));
  const latestEvent = new Map<string, ReleaseEvent>();
  input.events.forEach(e => {
    if (!within(now, windowMs, e.at)) return;
    const k = `${e.reason}|${e.namespace}/${e.recordName}`;
    const prev = latestEvent.get(k);
    if (!prev || ms(e.at) > ms(prev.at)) latestEvent.set(k, e);
  });
  latestEvent.forEach(e => {
    const r = recordByName.get(`${e.namespace}/${e.recordName}`);
    if (!r) return; // swept, or filtered out
    if (e.reason === 'ReleaseStalled' && !DEPLOYING_STATES.has(r.state)) return; // it moved on
    const stalled = e.reason === 'ReleaseStalled';
    add({
      id: `${e.reason}:${r.name}`,
      rule: stalled ? 'release-stalled' : 'release-drift',
      severity: stalled ? 'high' : 'warn',
      app: r.appName,
      env: r.env,
      title: stalled ? `Release to ${r.env} stalled` : `Live ${r.env} drifted from its release`,
      detail: e.message ?? (stalled ? undefined : r.drift),
      since: e.at,
      links: tower(href, r.appName, stalled ? 'deployments' : 'topology', stalled ? 'Deployment' : 'Topology', {
        env: r.env,
      }),
    });
  });

  // ---- live environments
  let envsTotal = 0;
  let envsFailing = 0;
  let outOfSync = 0;
  let pausedRollouts = 0;
  apps.forEach(a =>
    a.environments.forEach(e => {
      envsTotal += 1;
      const h = health(e);
      // Out of sync is expected while a release or deploy run is applying it.
      const deploying = deployments.some(d => d.app === a.appName && d.env === e.env && d.kind !== 'rollout');
      const links = tower(href, a.appName, 'deployments', 'Deployment', { env: e.env });
      if (e.argoSyncStatus === 'OutOfSync') outOfSync += 1;
      if (h === 'degraded') {
        envsFailing += 1;
        add({
          id: `degraded:${a.appName}/${e.cluster}/${e.namespace}`,
          rule: 'env-degraded',
          severity: 'critical',
          app: a.appName,
          env: e.env,
          title: `${e.env} is degraded`,
          detail:
            e.rolloutMessage ||
            e.argoOperationMessage ||
            (e.argoHealthStatus ? `Argo CD: ${e.argoHealthStatus}` : undefined),
          since: e.argoHealthSince,
          links,
        });
        return; // the pods and sync of a degraded env are part of the same problem
      }
      if (h === 'paused') {
        pausedRollouts += 1;
        const c = canaryOf(e);
        add({
          id: `paused:${a.appName}/${e.cluster}/${e.namespace}`,
          rule: 'rollout-paused',
          severity: 'warn',
          app: a.appName,
          env: e.env,
          title: `Rollout in ${e.env} paused`,
          detail:
            c?.weight !== undefined
              ? `canary at ${c.weight}%${
                  c.step !== undefined && c.steps ? `, step ${c.step + 1} of ${c.steps}` : ''
                }: waiting for promotion`
              : 'waiting for promotion',
          links,
        });
      }
      if (e.argoSyncStatus === 'OutOfSync' && !deploying && e.argoOperationPhase !== 'Running') {
        add({
          id: `out-of-sync:${a.appName}/${e.cluster}/${e.namespace}`,
          rule: 'argo-out-of-sync',
          severity: 'warn',
          app: a.appName,
          env: e.env,
          title: `${e.env} is out of sync with git`,
          detail: e.argoAppName ? `Argo CD app ${e.argoAppName}` : undefined,
          since: e.argoReconciledAt,
          links,
        });
      }
      const sick = e.pods.filter(p => {
        if (p.ready || p.phase === 'Succeeded') return false;
        const age = ageMs(now, p.startTime);
        return p.restarts >= POD_RESTARTS_WARN || (age !== undefined && age > POD_NOT_READY_MS);
      });
      if (sick.length > 0) {
        add({
          id: `pods:${a.appName}/${e.cluster}/${e.namespace}`,
          rule: 'pods-not-ready',
          severity: 'warn',
          app: a.appName,
          env: e.env,
          title: `${sick.length} pod${sick.length === 1 ? '' : 's'} not ready in ${e.env}`,
          detail: sick
            .slice(0, 2)
            .map(p => `${p.name} (${p.restarts} restart${p.restarts === 1 ? '' : 's'})`)
            .join(', '),
          links: tower(href, a.appName, 'topology', 'Topology', { env: e.env }),
        });
      }
      const previewAge = ageMs(now, e.deployedAt);
      if (isPreviewEnvName(e.env) && previewAge !== undefined && previewAge > PREVIEW_STALE_MS) {
        add({
          id: `preview:${a.appName}/${e.namespace}`,
          rule: 'preview-stale',
          severity: 'info',
          app: a.appName,
          env: e.env,
          title: `Preview ${e.env} untouched for ${Math.floor(previewAge / DAY)}d`,
          since: e.deployedAt,
          links: tower(href, a.appName, 'environments', 'Environments'),
        });
      }
    }),
  );

  // ---- SLOs
  slos.forEach(s => {
    const links = tower(href, s.service, 'slos', 'SLOs');
    if (s.periodBurnRate !== undefined && s.periodBurnRate > 1) {
      add({
        id: `slo:${s.cluster}/${s.service}/${s.slo}`,
        rule: 'slo-budget-exhausted',
        severity: 'high',
        app: s.service,
        title: `SLO ${s.slo} out of error budget`,
        detail: `burning at ${s.periodBurnRate.toFixed(2)}x over the period`,
        links,
      });
    } else if (s.budgetRemaining !== undefined && s.budgetRemaining < SLO_BUDGET_LOW) {
      add({
        id: `slo-low:${s.cluster}/${s.service}/${s.slo}`,
        rule: 'slo-budget-low',
        severity: 'warn',
        app: s.service,
        title: `SLO ${s.slo} has ${Math.max(0, Math.round(s.budgetRemaining * 100))}% budget left`,
        links,
      });
    }
  });

  // ---- provisioning
  provisioning.forEach(p => {
    if (!p.failed && !p.stalled) return;
    add({
      id: `provisioning:${p.name}`,
      rule: p.failed ? 'provisioning-failed' : 'provisioning-stalled',
      severity: p.failed ? 'high' : 'warn',
      app: p.name,
      title: p.failed ? 'Provisioning failed' : 'Provisioning stalled',
      since: p.since,
      links: [],
    });
  });

  attention.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (ms(a.since) || Infinity) - (ms(b.since) || Infinity) ||
      a.app.localeCompare(b.app),
  );

  // ---- what finished in the window
  const landed: LandedItem[] = [
    ...records
      .filter(r => (r.state === 'healthy' || FAILED_STATES.has(r.state)) && within(now, windowMs, r.stateAt))
      .map(r => ({
        key: `release:${r.namespace}/${r.name}`,
        app: r.appName,
        env: r.env,
        cluster: r.cluster,
        kind: 'release' as const,
        ok: r.state === 'healthy',
        at: r.stateAt!,
        links: [...tower(href, r.appName, 'deployments', 'Deployment', { env: r.env }), ...ext('PR', r.prUrl)],
      })),
    ...runs
      .filter(
        r =>
          (r.cloud || r.stage === 'deploy') &&
          (r.run.phase === 'succeeded' || r.run.phase === 'failed') &&
          within(now, windowMs, r.run.completionTime),
      )
      .map(r => ({
        key: `run:${r.key}`,
        app: runAppName(r),
        env: runEnv(r),
        kind: (r.cloud ? 'cloud' : 'ground') as DeploymentKind,
        ok: r.run.phase === 'succeeded',
        at: r.run.completionTime!,
        links: tower(href, runAppName(r), 'pipelines', 'Run', { run: r.run.name }),
      })),
  ].sort((a, b) => newestFirst(a.at, b.at));

  const canaries = deployments.filter(d => d.canary?.weight !== undefined && d.canary.weight < 100).length;
  return {
    kpis: {
      pipelinesRunning: shownLive.filter(r => r.run.phase === 'running').length,
      pipelinesQueued: shownLive.filter(r => r.run.phase === 'pending').length,
      slowRuns: pipelines.filter(p => p.slow).length,
      deploying: deployments.length,
      canaries,
      awaitingApproval: approvals.length,
      oldestApprovalSince: approvals[0]?.since,
      envsFailing,
      envsTotal,
      outOfSync,
      pausedRollouts,
    },
    attention,
    pipelines,
    recentRuns,
    pipelineStats,
    pipelineCounts,
    deployments,
    approvals,
    landed,
  };
}
