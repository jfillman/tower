import type { PrCheckRun } from '../pullRequests/usePullRequests';
import type { StatusTone } from '../ui';

// The api-compat release check's verdict (Airspace phase 2). Glidepath's api-compat gate diffs a release's signed spec
// against the spec running in the target environment (oasdiff) and posts it on the release PR inside its gate comment,
// as one hidden line: `<!-- glidepath:api-compat {JSON} -->`. Tower reads it from the gate's message, which the backend
// already passes through (packages/backend/src/pullRequests.ts parseGateComments).
//
// The check run's own conclusion is what GitHub enforces; this block explains it. Contract version 1; unknown fields are
// ignored, a missing or malformed block is simply "no report".

export type ApiCompatVerdictKind = 'pass' | 'warn' | 'block' | 'overridden' | 'no-spec' | 'no-baseline' | 'unsupported';

export interface ApiCompatSide {
  image?: string;
  digest?: string;
  specSha256?: string;
  title?: string;
  version?: string;
}

export interface ApiCompatBreaking {
  id: string;
  level: 'error' | 'warning';
  text: string;
  operation?: { method: string; path: string };
  /** Seen in traffic in the usage window; null when usage is unknown. */
  inUse: boolean | null;
  rate: number | null;
}

export interface ApiCompatReport {
  version: 1;
  verdict: ApiCompatVerdictKind;
  env: string;
  candidate?: ApiCompatSide;
  baseline: ApiCompatSide | null;
  breaking: ApiCompatBreaking[];
  nonBreakingCount: number;
  usage: { source: 'prometheus' | 'unknown'; window?: string; callers: string[] };
  override: { by: string; at?: string; reason?: string } | null;
}

const VERDICTS: ApiCompatVerdictKind[] = ['pass', 'warn', 'block', 'overridden', 'no-spec', 'no-baseline', 'unsupported'];
const MARKER = /<!--\s*glidepath:api-compat\s+(\{[\s\S]*?\})\s*-->/;

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const optStr = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

function sideOf(v: unknown): ApiCompatSide | undefined {
  if (!isObj(v)) return undefined;
  return { image: optStr(v.image), digest: optStr(v.digest), specSha256: optStr(v.specSha256), title: optStr(v.title), version: optStr(v.version) };
}

/** The report in a gate comment, or undefined when there is none or it isn't a version-1 report Tower understands. */
export function parseApiCompat(message: string | undefined): ApiCompatReport | undefined {
  const m = message?.match(MARKER);
  if (!m) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(m[1]);
  } catch {
    return undefined;
  }
  if (!isObj(raw) || raw.version !== 1 || !VERDICTS.includes(raw.verdict as ApiCompatVerdictKind)) return undefined;
  const breaking = (Array.isArray(raw.breaking) ? raw.breaking : []).filter(isObj).map((b, i) => {
    const op = isObj(b.operation) && typeof b.operation.method === 'string' && typeof b.operation.path === 'string'
      ? { method: b.operation.method.toUpperCase(), path: b.operation.path }
      : undefined;
    return {
      id: optStr(b.id) ?? `change-${i}`,
      level: b.level === 'warning' ? ('warning' as const) : ('error' as const),
      text: optStr(b.text) ?? optStr(b.id) ?? 'breaking change',
      operation: op,
      inUse: typeof b.inUse === 'boolean' ? b.inUse : null,
      rate: typeof b.rate === 'number' && Number.isFinite(b.rate) ? b.rate : null,
    };
  });
  const usage = isObj(raw.usage) ? raw.usage : {};
  const override = isObj(raw.override) && typeof raw.override.by === 'string'
    ? { by: raw.override.by, at: optStr(raw.override.at), reason: optStr(raw.override.reason) }
    : null;
  return {
    version: 1,
    verdict: raw.verdict as ApiCompatVerdictKind,
    env: optStr(raw.env) ?? '',
    candidate: sideOf(raw.candidate),
    baseline: sideOf(raw.baseline) ?? null,
    breaking,
    nonBreakingCount: typeof raw.nonBreakingCount === 'number' ? raw.nonBreakingCount : 0,
    usage: {
      source: usage.source === 'prometheus' ? 'prometheus' : 'unknown',
      window: optStr(usage.window),
      callers: Array.isArray(usage.callers) ? usage.callers.filter((c): c is string => typeof c === 'string') : [],
    },
    override,
  };
}

/** A Check Run's gate id, the way the backend keys gate comments: `Pipelines as Code CI / api-compat-` -> `api-compat`. */
export function gateIdOf(checkName: string): string {
  return checkName.replace(/^Pipelines as Code(?:\s+CI)?\s*\/\s*/i, '').replace(/-+\s*$/, '').toLowerCase();
}

/** The api-compat gate among a release PR's checks. */
export function apiCompatCheck(checks: PrCheckRun[] | undefined): PrCheckRun | undefined {
  return checks?.find(c => gateIdOf(c.name) === 'api-compat');
}

export interface ApiCompatState {
  check: PrCheckRun;
  report?: ApiCompatReport;
}

export function apiCompatOf(checks: PrCheckRun[] | undefined): ApiCompatState | undefined {
  const check = apiCompatCheck(checks);
  return check ? { check, report: parseApiCompat(check.message) } : undefined;
}

export const VERDICT_LABEL: Record<ApiCompatVerdictKind, string> = {
  pass: 'Compatible',
  warn: 'Breaking · warning',
  block: 'Breaking · blocked',
  overridden: 'Breaking · accepted',
  'no-spec': 'No spec',
  'no-baseline': 'First spec',
  unsupported: 'Not compared',
};

/** pass green; warn amber (attention); block red; an accepted break stays amber; nothing-to-compare neutral. */
export const VERDICT_TONE: Record<ApiCompatVerdictKind, StatusTone> = {
  pass: 'ok',
  warn: 'warn',
  block: 'bad',
  overridden: 'warn',
  'no-spec': 'neutral',
  'no-baseline': 'neutral',
  unsupported: 'neutral',
};

/** Whether a verdict asks a human to look before the release merges. */
export const needsAttention = (v: ApiCompatVerdictKind) => v === 'warn' || v === 'block';
