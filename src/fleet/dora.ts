// DORA on the Ops Wall: the same metrics, queries and thresholds as Glidepath's Grafana
// "DORA executive" dashboard (glidepath charts/glidepath-control-plane/files/dashboards/
// dora-executive.json), so the two never disagree. The source is dora-exporter's Prometheus series
// (dora_deployments_total, dora_releases_total{outcome}, dora_lead_time_seconds,
// dora_time_to_restore_seconds_experimental; definitions in glidepath docs/admin/dora-metrics.md),
// read through whatever query endpoint `tower.dora.metrics` names. Windows of 7 to 90 days need a
// long-term query layer (Thanos Query, Mimir), not a Prometheus with short local retention.

export const DORA_WINDOWS = [7, 30, 90] as const;
export type DoraWindow = (typeof DORA_WINDOWS)[number];
export const DEFAULT_DORA_WINDOW: DoraWindow = 30;

export function isDoraWindow(n: number): n is DoraWindow {
  return (DORA_WINDOWS as readonly number[]).includes(n);
}

export type DoraBand = 'good' | 'fair' | 'poor' | 'neutral';

const DAY = 86400;
const WEEK = 7 * DAY;

// The executive dashboard's threshold steps, restated.
export function deployFrequencyBand(perDay: number | undefined): DoraBand {
  if (perDay === undefined) return 'neutral';
  if (perDay >= 7) return 'good';
  return perDay >= 1 ? 'fair' : 'poor';
}

export function leadTimeBand(seconds: number | undefined): DoraBand {
  if (seconds === undefined) return 'neutral';
  if (seconds < DAY) return 'good';
  return seconds < WEEK ? 'fair' : 'poor';
}

export function changeFailureBand(rate: number | undefined): DoraBand {
  if (rate === undefined) return 'neutral';
  if (rate < 0.15) return 'good';
  return rate < 0.3 ? 'fair' : 'poor';
}

// Grafana colours restore time without judging it (it is experimental: it only sees the gap
// between a failed release and the next good one, not real incidents). Same here.
export const restoreBand = (_seconds: number | undefined): DoraBand => 'neutral';

/** A PromQL label matcher limiting every query to some apps, or '' for the whole fleet. */
export function appSelector(apps: string[] | undefined): string {
  if (!apps) return '';
  // An empty filter must match nothing, not everything.
  if (apps.length === 0) return '{app="__none__"}';
  const escaped = [...new Set(apps)].sort().map(a => a.replace(/[\\.*+?^${}()|[\]]/g, '\\$&'));
  return `{app=~"${escaped.join('|')}"}`;
}

/** Inserts extra matchers into a selector like `{app=~"a"}` (or builds one). */
function withMatcher(sel: string, matcher: string): string {
  return sel ? `${sel.slice(0, -1)},${matcher}}` : `{${matcher}}`;
}

export interface DoraQueries {
  deploys: string;
  deploysPrevious: string;
  failures: string;
  releases: string;
  failuresPrevious: string;
  releasesPrevious: string;
  leadTimeP50: string;
  restoreP50: string;
  deploysByApp: string;
  releasesByAppOutcome: string;
  leadTimeP50ByApp: string;
  restoreP50ByApp: string;
  deploysDaily: string;
  failuresDaily: string;
}

export function doraQueries(windowDays: number, apps?: string[]): DoraQueries {
  const w = `${windowDays}d`;
  const sel = appSelector(apps);
  const failedSel = withMatcher(sel, 'outcome="failed"');
  return {
    deploys: `sum(increase(dora_deployments_total${sel}[${w}]))`,
    deploysPrevious: `sum(increase(dora_deployments_total${sel}[${w}] offset ${w}))`,
    failures: `sum(increase(dora_releases_total${failedSel}[${w}]))`,
    releases: `sum(increase(dora_releases_total${sel}[${w}]))`,
    failuresPrevious: `sum(increase(dora_releases_total${failedSel}[${w}] offset ${w}))`,
    releasesPrevious: `sum(increase(dora_releases_total${sel}[${w}] offset ${w}))`,
    leadTimeP50: `histogram_quantile(0.5, sum(rate(dora_lead_time_seconds_bucket${sel}[${w}])) by (le))`,
    restoreP50: `histogram_quantile(0.5, sum(rate(dora_time_to_restore_seconds_experimental_bucket${sel}[${w}])) by (le))`,
    deploysByApp: `sum by (app) (increase(dora_deployments_total${sel}[${w}]))`,
    releasesByAppOutcome: `sum by (app, outcome) (increase(dora_releases_total${sel}[${w}]))`,
    leadTimeP50ByApp: `histogram_quantile(0.5, sum(rate(dora_lead_time_seconds_bucket${sel}[${w}])) by (app, le))`,
    restoreP50ByApp: `histogram_quantile(0.5, sum(rate(dora_time_to_restore_seconds_experimental_bucket${sel}[${w}])) by (app, le))`,
    deploysDaily: `sum(increase(dora_deployments_total${sel}[1d]))`,
    failuresDaily: `sum(increase(dora_releases_total${failedSel}[1d]))`,
  };
}

export interface DoraAppRow {
  app: string;
  deploys: number;
  failures: number;
  releases: number;
  changeFailureRate?: number;
  leadTimeP50Sec?: number;
  restoreP50Sec?: number;
}

export interface DoraPoint {
  time: number;
  value: number;
}

export interface DoraSnapshot {
  windowDays: number;
  deploys?: number;
  deploysPerDay?: number;
  deploysPerDayPrevious?: number;
  releases?: number;
  failures?: number;
  changeFailureRate?: number;
  changeFailureRatePrevious?: number;
  leadTimeP50Sec?: number;
  restoreP50Sec?: number;
  apps: DoraAppRow[];
  deploysDaily: DoraPoint[];
  failuresDaily: DoraPoint[];
}

/** A Prometheus sample value as a number, or undefined for NaN/Inf (0/0, an empty histogram). */
export function finite(v: number | undefined): number | undefined {
  return v !== undefined && Number.isFinite(v) ? v : undefined;
}

export function ratio(num: number | undefined, den: number | undefined): number | undefined {
  if (num === undefined || den === undefined || den <= 0) return undefined;
  return num / den;
}

export interface DoraRawResults {
  scalar: Partial<Record<keyof DoraQueries, number>>;
  deploysByApp: Array<{ app: string; value: number }>;
  releasesByAppOutcome: Array<{ app: string; outcome: string; value: number }>;
  leadTimeP50ByApp: Array<{ app: string; value: number }>;
  restoreP50ByApp: Array<{ app: string; value: number }>;
  deploysDaily: DoraPoint[];
  failuresDaily: DoraPoint[];
}

export function buildDoraSnapshot(windowDays: number, raw: DoraRawResults): DoraSnapshot {
  const s = raw.scalar;
  const deploys = finite(s.deploys);
  const deploysPrevious = finite(s.deploysPrevious);
  const rows = new Map<string, DoraAppRow>();
  const row = (app: string) => {
    let r = rows.get(app);
    if (!r) {
      r = { app, deploys: 0, failures: 0, releases: 0 };
      rows.set(app, r);
    }
    return r;
  };
  raw.deploysByApp.forEach(({ app, value }) => {
    row(app).deploys = Math.round(finite(value) ?? 0);
  });
  raw.releasesByAppOutcome.forEach(({ app, outcome, value }) => {
    const n = Math.round(finite(value) ?? 0);
    const r = row(app);
    r.releases += n;
    if (outcome === 'failed') r.failures += n;
  });
  raw.leadTimeP50ByApp.forEach(({ app, value }) => {
    row(app).leadTimeP50Sec = finite(value);
  });
  raw.restoreP50ByApp.forEach(({ app, value }) => {
    row(app).restoreP50Sec = finite(value);
  });
  rows.forEach(r => {
    r.changeFailureRate = ratio(r.failures, r.releases);
  });
  return {
    windowDays,
    deploys: deploys === undefined ? undefined : Math.round(deploys),
    deploysPerDay: ratio(deploys, windowDays),
    deploysPerDayPrevious: ratio(deploysPrevious, windowDays),
    releases: finite(s.releases),
    failures: finite(s.failures),
    changeFailureRate: ratio(finite(s.failures), finite(s.releases)),
    changeFailureRatePrevious: ratio(finite(s.failuresPrevious), finite(s.releasesPrevious)),
    leadTimeP50Sec: finite(s.leadTimeP50),
    restoreP50Sec: finite(s.restoreP50),
    apps: [...rows.values()]
      .filter(r => r.deploys > 0 || r.releases > 0)
      .sort((a, b) => b.deploys - a.deploys || a.app.localeCompare(b.app)),
    deploysDaily: raw.deploysDaily,
    failuresDaily: raw.failuresDaily,
  };
}
