import { parseSlos, presetName, presetOn, SLO_PRESETS, togglePreset } from './sloCatalog';

const c = { app: 'boarding-api', namespace: 'app-boarding-api-staging' };
const readiness = SLO_PRESETS.find(p => p.id === 'readiness-availability')!;
const latency = SLO_PRESETS.find(p => p.id === 'health-check-latency')!;

describe('SLO presets', () => {
  it('each preset is a complete chart SLO: name, service, objective and the indicator fields its type requires', () => {
    for (const p of SLO_PRESETS) {
      const e = p.entry(c) as any;
      expect(e.name).toBe(`boarding-api-${p.id}`);
      expect(e.service).toBe('boarding-api');
      expect(e.service).toMatch(/^[a-zA-Z0-9_.-]+$/);
      expect(e.objective).toBeGreaterThan(0);
      expect(e.objective).toBeLessThanOrEqual(100);
      expect(e.indicator.metric).toBeTruthy();
      expect(e.indicator.totalFilter).toContain('namespace="app-boarding-api-staging"');
      if (e.indicator.type === 'availability') expect(e.indicator.errorFilter).toBeTruthy();
      else expect(e.indicator.latencyThreshold).toBeTruthy();
    }
    expect(new Set(SLO_PRESETS.map(p => p.id)).size).toBe(SLO_PRESETS.length);
  });

  it('only uses metrics that exist in this cluster\'s Prometheus (the probe metrics)', () => {
    for (const p of SLO_PRESETS) expect((p.entry(c) as any).indicator.metric).toMatch(/^prober_probe_/);
  });

  it('checks for data with a query on the same series the SLO reads', () => {
    expect(readiness.dataQuery(c)).toBe('count(prober_probe_total{namespace="app-boarding-api-staging",container="boarding-api",probe_type="Readiness"})');
    expect(latency.dataQuery(c)).toContain('prober_probe_duration_seconds_bucket');
    expect(latency.dataQuery(c)).toContain('le="0.5"'); // the bucket the 0.5 threshold needs
  });
});

describe('toggling a preset in the slos YAML', () => {
  it('turns one on in empty text, and detects it', () => {
    const text = togglePreset('', readiness, c, true)!;
    expect(presetOn(text, readiness, c)).toBe(true);
    expect(parseSlos(text)).toEqual([readiness.entry(c)]);
  });

  it('appends without touching entries already there, and removes only its own', () => {
    const custom = `- name: custom\n  service: boarding-api\n  objective: 90\n  indicator:\n    type: availability\n    metric: m\n    totalFilter: 'a="b"'\n    errorFilter: 'c="d"'`;
    const both = togglePreset(togglePreset(custom, readiness, c, true)!, latency, c, true)!;
    expect(parseSlos(both)!.map(e => e.name)).toEqual(['custom', 'boarding-api-readiness-availability', 'boarding-api-health-check-latency']);
    const without = togglePreset(both, readiness, c, false)!;
    expect(parseSlos(without)!.map(e => e.name)).toEqual(['custom', 'boarding-api-health-check-latency']);
    expect(parseSlos(togglePreset(without, latency, c, false)!)).toEqual(parseSlos(custom));
  });

  it('turning on twice does not duplicate, and turning off the last one leaves empty text', () => {
    const once = togglePreset('', readiness, c, true)!;
    expect(parseSlos(togglePreset(once, readiness, c, true)!)).toHaveLength(1);
    expect(togglePreset(once, readiness, c, false)).toBe('');
  });

  it('refuses to edit text that is not a list or not YAML', () => {
    expect(togglePreset('a: 1', readiness, c, true)).toBeUndefined();
    expect(togglePreset('- [', readiness, c, true)).toBeUndefined();
    expect(parseSlos('a: 1')).toBeUndefined();
    expect(presetOn('a: 1', readiness, c)).toBe(false);
  });

  it('names the entry the same way every time', () => {
    expect(presetName(readiness, c)).toBe('boarding-api-readiness-availability');
  });
});
