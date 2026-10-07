import { CLOUD_DEPLOY_TASKS, cloudDeployFromRun, type CloudDeploy } from '../cloudDeploy';
import {
  TEKTON_CLUSTER,
  toPipelineRunSummary,
  type RawPipelineRun,
  type RawTaskRun,
} from '../tekton/useTektonPipelineRuns';
import type { PipelineRunSummary } from '../tekton/types';

// A PipelineRun as the Ops Wall shows it: the shared summary plus what a fleet row needs for its
// links and progress bar. Everything here comes from the run's own labels, annotations and
// condition message, so the whole fleet is one list call (no TaskRuns needed for most runs).

export interface RunProgress {
  done: number;
  total: number;
  failed: number;
}

export interface FleetRun {
  /** namespace/name: run names are only unique per namespace. */
  key: string;
  run: PipelineRunSummary;
  /** hangar.io/stage: build, deploy, release, test, ... */
  stage?: string;
  /** The commit title PaC recorded. */
  title?: string;
  shaUrl?: string;
  prNumber?: string;
  /** The GitHub check run PaC reports this run to. */
  checkRunUrl?: string;
  progress?: RunProgress;
  /** Set when the run deploys to a cloud target (Lambda, ECS, Container Apps). */
  cloud?: CloudDeploy;
  durationSec?: number;
}

function meta(raw: RawPipelineRun, name: string): string | undefined {
  return raw.metadata.labels?.[name] ?? raw.metadata.annotations?.[name];
}

// "Tasks Completed: 7 (Failed: 0, Cancelled 0), Incomplete: 11, Skipped: 1" while running,
// "Tasks Completed: 13 (Failed: 0, Cancelled 0), Skipped: 3" once done (seen live 2026-10-07).
// Skipped tasks never run, so they are not part of the total.
const PROGRESS_RE = /Tasks Completed: (\d+) \(Failed: (\d+),[^)]*\)(?:, Incomplete: (\d+))?/;

export function parseProgress(message: string | undefined): RunProgress | undefined {
  const m = message?.match(PROGRESS_RE);
  if (!m) return undefined;
  const done = Number(m[1]);
  return { done, failed: Number(m[2]), total: done + Number(m[3] ?? 0) };
}

/** True when the run's pipeline includes a cloud deploy task, so its TaskRuns are worth reading. */
export function mayDeployToCloud(raw: RawPipelineRun): boolean {
  return (raw.status?.pipelineSpec?.tasks ?? []).some(t => t.name in CLOUD_DEPLOY_TASKS);
}

export function toFleetRun(raw: RawPipelineRun, taskRunsByName: Map<string, RawTaskRun>): FleetRun {
  const run = toPipelineRunSummary(raw, TEKTON_CLUSTER, taskRunsByName);
  const repoUrl = meta(raw, 'pipelinesascode.tekton.dev/repo-url');
  const checkRunId = meta(raw, 'pipelinesascode.tekton.dev/check-run-id');
  const start = run.startTime ? Date.parse(run.startTime) : undefined;
  const end = run.completionTime ? Date.parse(run.completionTime) : undefined;
  return {
    key: `${run.namespace}/${run.name}`,
    run,
    stage: meta(raw, 'hangar.io/stage') ?? meta(raw, 'platform.io/stage'),
    title: meta(raw, 'pipelinesascode.tekton.dev/sha-title')?.split('\n')[0],
    shaUrl: meta(raw, 'pipelinesascode.tekton.dev/sha-url'),
    prNumber: meta(raw, 'pipelinesascode.tekton.dev/pull-request'),
    checkRunUrl: repoUrl && checkRunId ? `${repoUrl}/runs/${checkRunId}` : undefined,
    progress: parseProgress(run.message),
    cloud: cloudDeployFromRun(run),
    durationSec: start !== undefined && end !== undefined ? Math.max(0, Math.round((end - start) / 1000)) : undefined,
  };
}

/** Which runs need their TaskRuns read: anything live or failed (for the failing task), and cloud deploys. */
export function needsTaskRuns(raw: RawPipelineRun): boolean {
  const cond = raw.status?.conditions?.find(c => c.type === 'Succeeded');
  return !cond || cond.status !== 'True' || mayDeployToCloud(raw);
}

export const runAppName = (r: FleetRun) => r.run.appName ?? r.run.namespace.replace(/^app-/, '').replace(/-cicd$/, '');
