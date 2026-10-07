// Pipeline types and run history for the Ops Wall.

/**
 * What a pipeline is for, so a team can hide what it does not care about (guardrail checks, platform plumbing).
 * Decided by the Tekton Pipeline's name, which every live run and every archived summary carries.
 */
export type PipelineCategory = 'build' | 'deploy' | 'guardrail' | 'platform';

export const PIPELINE_CATEGORIES: PipelineCategory[] = ['build', 'deploy', 'guardrail', 'platform'];

export const CATEGORY_LABEL: Record<PipelineCategory, string> = {
  build: 'Build & test',
  deploy: 'Deploy',
  guardrail: 'Guardrails',
  platform: 'Platform',
};

/** Shown unless the viewer changes it: platform plumbing (notifications, onboarding re-syncs) is noise to a team. */
export const DEFAULT_CATEGORIES: PipelineCategory[] = ['build', 'deploy', 'guardrail'];

const BUILD = new Set(['build', 'test', 'pr-build']);
const DEPLOY = new Set(['deploy', 'release', 'gitops-image-bump', 'promote']);

export function pipelineCategory(pipeline: string | undefined): PipelineCategory {
  if (!pipeline) return 'platform';
  if (BUILD.has(pipeline)) return 'build';
  if (DEPLOY.has(pipeline)) return 'deploy';
  // The release guardrails and the governance gates are all <name>-check (glidepath-catalog pipelines).
  if (pipeline.endsWith('-check')) return 'guardrail';
  return 'platform';
}

export function parseCategories(param: string | null): Set<PipelineCategory> {
  if (param === null) return new Set(DEFAULT_CATEGORIES);
  const picked = param.split(',').filter((c): c is PipelineCategory => (PIPELINE_CATEGORIES as string[]).includes(c));
  return new Set(picked);
}

export function formatCategories(cats: Set<PipelineCategory>): string | undefined {
  const sorted = PIPELINE_CATEGORIES.filter(c => cats.has(c));
  const isDefault = sorted.length === DEFAULT_CATEGORIES.length && DEFAULT_CATEGORIES.every(c => cats.has(c));
  return isDefault ? undefined : sorted.join(',');
}

// ---- archived runs (Tekton Results)

export type HistoryStatus = 'succeeded' | 'failed' | 'cancelled';

/** A finished PipelineRun from Tekton Results' Result summary: small (~1 KB), unlike the full record (~24 KB). */
export interface HistoryRun {
  /** namespace/name, the same key a live run has. */
  key: string;
  namespace: string;
  name: string;
  app: string;
  pipeline?: string;
  status: HistoryStatus;
  startTime?: string;
  endTime?: string;
  durationSec?: number;
  commit?: string;
  eventType?: string;
  prNumber?: string;
}

/** The Result object as `parents/-/results` returns it (fields read live 2026-10-07, Results v0.20.0). */
export interface RawResult {
  name: string;
  create_time?: string;
  annotations?: Record<string, string>;
  summary?: {
    type?: string;
    status?: string;
    start_time?: string;
    end_time?: string;
    annotations?: Record<string, string>;
  };
}

const STATUS: Record<string, HistoryStatus> = {
  SUCCESS: 'succeeded',
  FAILURE: 'failed',
  TIMEOUT: 'failed',
  CANCELLED: 'cancelled',
};

export const appOfNamespace = (ns: string) => ns.replace(/^app-/, '').replace(/-cicd$/, '');

export function toHistoryRun(r: RawResult): HistoryRun | undefined {
  const s = r.summary;
  if (!s || s.type !== 'tekton.dev/v1.PipelineRun') return undefined;
  const status = s.status ? STATUS[s.status] : undefined;
  const name = r.annotations?.['object.metadata.name'];
  if (!status || !name) return undefined; // still running, or not one Tekton named
  const namespace = r.name.split('/')[0];
  const start = s.start_time ? Date.parse(s.start_time) : NaN;
  const end = s.end_time ? Date.parse(s.end_time) : NaN;
  return {
    key: `${namespace}/${name}`,
    namespace,
    name,
    app: appOfNamespace(namespace),
    pipeline: r.annotations?.['tekton.dev/pipeline'],
    status,
    startTime: s.start_time,
    endTime: s.end_time,
    durationSec: Number.isNaN(start) || Number.isNaN(end) ? undefined : Math.max(0, Math.round((end - start) / 1000)),
    commit: s.annotations?.commit,
    eventType: s.annotations?.eventType,
    prNumber: s.annotations?.['pull_request-id'],
  };
}
