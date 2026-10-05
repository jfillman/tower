import { dump as dumpYaml, load as loadYaml } from 'js-yaml';

// A short list of SLOs worth having on any service, each one a toggle. Only SLOs whose metric exists in the cluster's Prometheus
// are offered: the probe metrics (every pod's liveness and readiness probes, scraped from the kubelet) and nothing that needs
// request metrics, because none are scraped here today (no gateway or per-app request series on kiac-dev). Each preset carries
// the query Tower runs to check there is data before the SLO is turned on, so a toggle never creates an SLO with nothing behind it.

export interface SloContext {
  app: string;
  /** The environment's namespace, app-<app>-<env>. */
  namespace: string;
}

export interface SloPreset {
  id: string;
  title: string;
  description: string;
  /** The `slos:` entry this preset writes. */
  entry: (c: SloContext) => Record<string, unknown>;
  /** A query that returns a series when the metric has data for this workload. */
  dataQuery: (c: SloContext) => string;
}

const probeFilter = (c: SloContext, probeType: 'Liveness' | 'Readiness') =>
  `namespace="${c.namespace}",container="${c.app}",probe_type="${probeType}"`;

export const SLO_PRESETS: SloPreset[] = [
  {
    id: 'readiness-availability',
    title: 'Readiness availability',
    description: 'The share of readiness probes that succeed: how often the service says it is ready to take traffic. 99%.',
    entry: c => ({
      name: `${c.app}-readiness-availability`,
      service: c.app,
      objective: 99,
      indicator: {
        type: 'availability',
        metric: 'prober_probe_total',
        totalFilter: probeFilter(c, 'Readiness'),
        errorFilter: 'result!="successful"',
      },
    }),
    dataQuery: c => `count(prober_probe_total{${probeFilter(c, 'Readiness')}})`,
  },
  {
    id: 'liveness-availability',
    title: 'Liveness availability',
    description: 'The share of liveness probes that succeed: how often the process answers its own health check. 99%.',
    entry: c => ({
      name: `${c.app}-liveness-availability`,
      service: c.app,
      objective: 99,
      indicator: {
        type: 'availability',
        metric: 'prober_probe_total',
        totalFilter: probeFilter(c, 'Liveness'),
        errorFilter: 'result!="successful"',
      },
    }),
    dataQuery: c => `count(prober_probe_total{${probeFilter(c, 'Liveness')}})`,
  },
  {
    id: 'health-check-latency',
    title: 'Health check latency',
    description: 'The share of readiness probes that answer within 500 ms: a slow health endpoint is the first sign of a struggling service. 95%.',
    entry: c => ({
      name: `${c.app}-health-check-latency`,
      service: c.app,
      objective: 95,
      indicator: {
        type: 'latency',
        metric: 'prober_probe_duration_seconds',
        totalFilter: probeFilter(c, 'Readiness'),
        latencyThreshold: '0.5',
      },
    }),
    dataQuery: c => `count(prober_probe_duration_seconds_bucket{${probeFilter(c, 'Readiness')},le="0.5"})`,
  },
];

/** What the presets cannot offer, for the panel to say. */
export const SLO_PRESETS_NOTE =
  'Request success and latency SLOs need request metrics (from the gateway or the app), and none are scraped on this cluster yet, so they are not offered.';

type Entry = Record<string, unknown>;

/** The `slos:` YAML parsed to a list, an empty list for blank text, or undefined when it is not a list (the toggles are then off). */
export function parseSlos(text: string): Entry[] | undefined {
  if (!text.trim()) return [];
  try {
    const v = loadYaml(text);
    return Array.isArray(v) ? (v as Entry[]) : undefined;
  } catch {
    return undefined;
  }
}

export const presetName = (p: SloPreset, c: SloContext) => String(p.entry(c).name);

export function presetOn(text: string, p: SloPreset, c: SloContext): boolean {
  return (parseSlos(text) ?? []).some(e => e?.name === presetName(p, c));
}

/** The YAML with the preset added (appended, other entries untouched) or removed. undefined when the text is not a list to edit. */
export function togglePreset(text: string, p: SloPreset, c: SloContext, on: boolean): string | undefined {
  const list = parseSlos(text);
  if (!list) return undefined;
  const name = presetName(p, c);
  const rest = list.filter(e => e?.name !== name);
  const next = on ? [...rest, p.entry(c)] : rest;
  return next.length === 0 ? '' : dumpYaml(next, { lineWidth: 120 }).trimEnd();
}
