import { MIN_SAMPLES, toRunRecord, typicalFor, type TypicalDurations } from './provisioningHistory';
import { toItems } from './shared';
import type { ProvisioningInputs } from './deriveProvisioning';

const m = (median: number, samples: number) => ({ median, samples });

describe('typicalFor', () => {
  const t: TypicalDurations = {
    all: { build: m(150, 10), catalog: m(400, 10), secrets: m(30, 2) },
    byKind: { LambdaFunction: { build: m(40, MIN_SAMPLES), catalog: m(60, 1) } },
  };
  it('uses the kind\'s own median once it has enough runs', () => {
    expect(typicalFor(t, 'LambdaFunction')?.build).toBe(40);
  });
  it('falls back to all kinds when the kind has too few runs of its own', () => {
    expect(typicalFor(t, 'LambdaFunction')?.catalog).toBe(400);
  });
  it('leaves out a step with too few runs anywhere, so the built-in estimate stays', () => {
    expect(typicalFor(t, 'LambdaFunction')?.secrets).toBeUndefined();
  });
  it('is undefined with no history at all', () => {
    expect(typicalFor(undefined, 'X')).toBeUndefined();
    expect(typicalFor({ all: {}, byKind: {} }, 'X')).toBeUndefined();
  });
});

describe('toRunRecord', () => {
  const T0 = Date.parse('2026-10-04T10:00:00Z');
  const complete = (): ProvisioningInputs => ({
    xr: {
      kind: 'PythonApplication',
      name: 'air-traffic-api',
      namespace: 'app-air-traffic-api-cicd',
      cluster: 'kind-dev',
      createdAt: T0,
      conditions: [
        { type: 'DevClusterReady', status: 'True', lastTransitionTime: new Date(T0 + 10_000).toISOString() },
        { type: 'CicdOnboarded', status: 'True', lastTransitionTime: new Date(T0 + 60_000).toISOString() },
        { type: 'Synced', status: 'True' },
        { type: 'Ready', status: 'True', lastTransitionTime: new Date(T0 + 70_000).toISOString() },
      ],
    },
    secrets: { found: true, ready: true, readyAt: T0 + 90_000 },
    catalog: { found: true },
    links: {
      requestPr: { number: 1, url: 'u', state: 'merged', createdAt: T0 - 120_000, mergedAt: T0 - 30_000 },
      onboarding: {
        source: { number: 1, url: 'u', state: 'merged', mergedAt: T0 + 200_000 },
        gitops: { number: 1, url: 'u', state: 'merged', mergedAt: T0 + 205_000 },
      },
    },
    build: { name: 'b', phase: 'succeeded', startedAt: T0 + 210_000, completedAt: T0 + 400_000, tasksDone: 6, tasksTotal: 6 },
    rollout: { phase: 'Healthy', desired: 2, available: 2, createdAt: T0 + 420_000 },
    observed: { running: { sawRunning: true, startedAt: T0 + 400_000, endedAt: T0 + 460_000 } },
  });
  const item = (i: ProvisioningInputs) => toItems([i], T0 + 600_000)[0];

  it('records a finished provision with per-step seconds and the start of the whole thing', () => {
    const r = toRunRecord(item(complete()))!;
    expect(r.service).toBe('air-traffic-api');
    expect(r.kind).toBe('PythonApplication');
    expect(r.startedAt).toBe(T0 - 120_000); // the request PR opening, before the XR existed
    expect(r.steps.find(s => s.id === 'merge')?.seconds).toBe(90);
    expect(r.steps.find(s => s.id === 'build')?.seconds).toBe(190);
    expect(r.steps.find(s => s.id === 'running')?.seconds).toBe(60); // from the observed healthy time
    expect(r.totalSeconds).toBe(Math.round((r.completedAt - r.startedAt) / 1000));
  });
  it('records nothing for a provision that is not finished', () => {
    const c = complete();
    c.rollout = { phase: 'Progressing', desired: 2, available: 1 };
    expect(toRunRecord(item(c))).toBeUndefined();
  });
  it('leaves out a step whose duration was never known rather than recording zero', () => {
    const c = complete();
    delete c.observed; // never watched the rollout turn healthy
    const r = toRunRecord(item(c))!;
    expect(r.steps.find(s => s.id === 'running')).toBeUndefined();
    expect(r.steps.find(s => s.id === 'catalog')).toBeUndefined();
  });
});
