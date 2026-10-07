import type { Deploy } from './stagedChanges';

// An environment that renders its own chart (glidepath ADR-0023: deploy.chart or the environment's chart, other than
// Airframe's). Tower's values form is generated from Airframe's chart, so such an environment is edited as raw YAML.
// Mirrors the backend's ownChartValues.ts and glidepath-app's resolveChart.

export interface ChartRef {
  repoURL?: string;
  path?: string;
  chart?: string;
  targetRevision?: string;
}

const AIRFRAME = { repoURL: 'https://github.com/jfillman/airframe.git', path: 'charts/airframe-application' };

function over(base: ChartRef, o: ChartRef | undefined): ChartRef {
  if (!o) return base;
  if (o.repoURL) return o;
  const r: ChartRef = { ...base };
  if (o.path) {
    r.path = o.path;
    delete r.chart;
  }
  if (o.chart) {
    r.chart = o.chart;
    delete r.path;
  }
  if (o.targetRevision) r.targetRevision = o.targetRevision;
  return r;
}

export function ownChartOf(deploy: Deploy | undefined, env: string): ChartRef | undefined {
  const d = deploy as (Deploy & { chart?: ChartRef; target?: string; environments?: Array<{ name: string; chart?: ChartRef }> }) | undefined;
  if ((d?.target ?? 'k8s-rollout') !== 'k8s-rollout') return undefined;
  const r = over(over(AIRFRAME, d?.chart), d?.environments?.find((e: { name: string }) => e.name === env)?.chart);
  return r.repoURL === AIRFRAME.repoURL && !r.chart && r.path === AIRFRAME.path ? undefined : r;
}

export function describeChart(c: ChartRef): string {
  return `${c.repoURL ?? ''} ${c.path ?? c.chart ?? ''}${c.targetRevision ? `@${c.targetRevision}` : ''}`.trim();
}
