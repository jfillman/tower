import { dump, load } from 'js-yaml';

const probeFilter = (c, probeType) => `namespace="${c.namespace}",container="${c.app}",probe_type="${probeType}"`;
const SLO_PRESETS = [
  {
    id: "readiness-availability",
    title: "Readiness availability",
    description: "The share of readiness probes that succeed: how often the service says it is ready to take traffic. 99%.",
    entry: (c) => ({
      name: `${c.app}-readiness-availability`,
      service: c.app,
      objective: 99,
      indicator: {
        type: "availability",
        metric: "prober_probe_total",
        totalFilter: probeFilter(c, "Readiness"),
        errorFilter: 'result!="successful"'
      }
    }),
    dataQuery: (c) => `count(prober_probe_total{${probeFilter(c, "Readiness")}})`
  },
  {
    id: "liveness-availability",
    title: "Liveness availability",
    description: "The share of liveness probes that succeed: how often the process answers its own health check. 99%.",
    entry: (c) => ({
      name: `${c.app}-liveness-availability`,
      service: c.app,
      objective: 99,
      indicator: {
        type: "availability",
        metric: "prober_probe_total",
        totalFilter: probeFilter(c, "Liveness"),
        errorFilter: 'result!="successful"'
      }
    }),
    dataQuery: (c) => `count(prober_probe_total{${probeFilter(c, "Liveness")}})`
  },
  {
    id: "health-check-latency",
    title: "Health check latency",
    description: "The share of readiness probes that answer within 500 ms: a slow health endpoint is the first sign of a struggling service. 95%.",
    entry: (c) => ({
      name: `${c.app}-health-check-latency`,
      service: c.app,
      objective: 95,
      indicator: {
        type: "latency",
        metric: "prober_probe_duration_seconds",
        totalFilter: probeFilter(c, "Readiness"),
        latencyThreshold: "0.5"
      }
    }),
    dataQuery: (c) => `count(prober_probe_duration_seconds_bucket{${probeFilter(c, "Readiness")},le="0.5"})`
  }
];
const SLO_PRESETS_NOTE = "Request success and latency SLOs need request metrics (from the gateway or the app), and none are scraped on this cluster yet, so they are not offered.";
function parseSlos(text) {
  if (!text.trim()) return [];
  try {
    const v = load(text);
    return Array.isArray(v) ? v : void 0;
  } catch {
    return void 0;
  }
}
const presetName = (p, c) => String(p.entry(c).name);
function presetOn(text, p, c) {
  return (parseSlos(text) ?? []).some((e) => e?.name === presetName(p, c));
}
function togglePreset(text, p, c, on) {
  const list = parseSlos(text);
  if (!list) return void 0;
  const name = presetName(p, c);
  const rest = list.filter((e) => e?.name !== name);
  const next = on ? [...rest, p.entry(c)] : rest;
  return next.length === 0 ? "" : dump(next, { lineWidth: 120 }).trimEnd();
}

export { SLO_PRESETS, SLO_PRESETS_NOTE, parseSlos, presetName, presetOn, togglePreset };
//# sourceMappingURL=sloCatalog.esm.js.map
