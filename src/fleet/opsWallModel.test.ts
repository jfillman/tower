import type { RawPipelineRun } from '../tekton/useTektonPipelineRuns';
import type { EnvironmentSummary } from '../types';
import type { FleetApp } from '../useFleetEnvironments';
import { parseProgress, toFleetRun, needsTaskRuns } from './fleetRuns';
import { buildOpsWallModel, isSlow, type OpsWallInputs } from './opsWallModel';
import { toReleaseEvent, toReleaseRecord, type RawConfigMap } from './releaseRecords';

const NOW = Date.parse('2026-10-07T18:00:00Z');
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

// Shapes follow the live objects on kiac-dev (2026-10-07): PaC annotations, hangar.io labels and
// Tekton's own condition message.
function rawRun(o: {
  name: string;
  app: string;
  stage: string;
  pipeline?: string;
  reason: 'Running' | 'Succeeded' | 'Failed' | 'PipelineRunPending';
  startedMinAgo: number;
  durationMin?: number;
  message?: string;
  env?: string;
  tasks?: string[];
}): RawPipelineRun {
  let status: 'True' | 'False' | 'Unknown' = 'Unknown';
  if (o.reason === 'Succeeded') status = 'True';
  if (o.reason === 'Failed') status = 'False';
  return {
    metadata: {
      name: o.name,
      namespace: `app-${o.app}-cicd`,
      labels: {
        'hangar.io/app': o.app,
        'hangar.io/stage': o.stage,
        'hangar.io/flow': 'ci',
        'tekton.dev/pipeline': o.pipeline ?? o.stage,
        'pipelinesascode.tekton.dev/check-run-id': '112926487806',
      },
      annotations: {
        'pipelinesascode.tekton.dev/repo-url': `https://github.com/jfillman/${o.app}`,
        'pipelinesascode.tekton.dev/sha': '658e550c08dcd1636a6af127008a58d9415eaa8d',
        'pipelinesascode.tekton.dev/sha-title': 'glidepath migration\n\nbody',
        'pipelinesascode.tekton.dev/sha-url': `https://github.com/jfillman/${o.app}/commit/658e550`,
        'pipelinesascode.tekton.dev/sender': 'jfillman',
      },
    },
    spec: { params: o.env ? [{ name: 'env', value: o.env }] : [] },
    status: {
      conditions: [{ type: 'Succeeded', status, reason: o.reason, message: o.message }],
      startTime: iso(o.startedMinAgo),
      completionTime: o.durationMin !== undefined ? iso(o.startedMinAgo - o.durationMin) : undefined,
      pipelineSpec: { tasks: (o.tasks ?? ['start-flow', 'build']).map(name => ({ name })) },
      childReferences: [],
    },
  };
}

const run = (o: Parameters<typeof rawRun>[0]) => toFleetRun(rawRun(o), new Map());

function record(data: Record<string, string>): RawConfigMap {
  const id = data.releaseId?.split(':')[0] ?? 'x';
  return {
    metadata: {
      name: `release-tracking-${id}`,
      namespace: `app-${data.appName}-cicd`,
      labels: { 'hangar.io/subcomponent': 'release-tracking' },
    },
    data: { cluster: 'kind-prod', kind: 'promote', ...data },
  };
}

function env(o: Partial<EnvironmentSummary> & { env: string }): EnvironmentSummary {
  return {
    key: o.env,
    cluster: 'kind-prod',
    namespace: `app-x-${o.env}`,
    drift: false,
    pods: [],
    services: [],
    resources: [],
    ...o,
  };
}

const app = (appName: string, environments: EnvironmentSummary[]): FleetApp => ({
  entityRef: `component:default/${appName}`,
  appName,
  environments,
  loading: false,
});

function inputs(o: Partial<OpsWallInputs>): OpsWallInputs {
  return {
    now: NOW,
    windowMs: 24 * 3600_000,
    apps: [],
    runs: [],
    records: [],
    events: [],
    slos: [],
    provisioning: [],
    towerHref: (a, tab, params) => `/tower?entity=${a}&tab=${tab}${params ? `&${new URLSearchParams(params)}` : ''}`,
    ...o,
  };
}

describe('parseProgress', () => {
  it('reads a running run', () => {
    expect(parseProgress('Tasks Completed: 7 (Failed: 0, Cancelled 0), Incomplete: 11, Skipped: 1')).toEqual({
      done: 7,
      failed: 0,
      total: 18,
    });
  });
  it('reads a finished run (no Incomplete), skipped tasks not counted', () => {
    expect(parseProgress('Tasks Completed: 13 (Failed: 0, Cancelled 0), Skipped: 6')).toEqual({
      done: 13,
      failed: 0,
      total: 13,
    });
  });
  it('is undefined for anything else', () => {
    expect(parseProgress('PipelineRun is pending')).toBeUndefined();
    expect(parseProgress(undefined)).toBeUndefined();
  });
});

describe('toFleetRun', () => {
  it('pulls links and stage from PaC and hangar.io metadata', () => {
    const r = run({
      name: 'ci-0-build-q484x',
      app: 'travel-agent-api',
      stage: 'build',
      reason: 'Running',
      startedMinAgo: 3,
    });
    expect(r.key).toBe('app-travel-agent-api-cicd/ci-0-build-q484x');
    expect(r.stage).toBe('build');
    expect(r.title).toBe('glidepath migration');
    expect(r.checkRunUrl).toBe('https://github.com/jfillman/travel-agent-api/runs/112926487806');
  });
  it('reads TaskRuns only for live, failed or cloud-capable runs', () => {
    expect(
      needsTaskRuns(
        rawRun({ name: 'a', app: 'x', stage: 'build', reason: 'Succeeded', startedMinAgo: 9, durationMin: 2 }),
      ),
    ).toBe(false);
    expect(needsTaskRuns(rawRun({ name: 'b', app: 'x', stage: 'build', reason: 'Running', startedMinAgo: 1 }))).toBe(
      true,
    );
    expect(
      needsTaskRuns(
        rawRun({
          name: 'c',
          app: 'x',
          stage: 'deploy',
          reason: 'Succeeded',
          startedMinAgo: 9,
          durationMin: 2,
          tasks: ['deploy', 'deploy-aws-lambda'],
        }),
      ),
    ).toBe(true);
  });
});

describe('isSlow', () => {
  it('uses 3x typical, never less than 10 minutes', () => {
    expect(isSlow(29 * 60, 10 * 60)).toBe(false);
    expect(isSlow(31 * 60, 10 * 60)).toBe(true);
    expect(isSlow(9 * 60, 60)).toBe(false);
  });
  it('falls back to 45 minutes with no history', () => {
    expect(isSlow(44 * 60, undefined)).toBe(false);
    expect(isSlow(46 * 60, undefined)).toBe(true);
  });
});

describe('buildOpsWallModel', () => {
  it('lists running pipelines and flags a slow one against typical duration', () => {
    const history = [1, 2, 3].map(i =>
      run({
        name: `old-${i}`,
        app: 'backstage',
        stage: 'build',
        reason: 'Succeeded',
        startedMinAgo: 60 + i,
        durationMin: 10,
      }),
    );
    const slow = run({
      name: 'ci-0-build-w825h',
      app: 'backstage',
      stage: 'build',
      reason: 'Running',
      startedMinAgo: 40,
      message: 'Tasks Completed: 7 (Failed: 0, Cancelled 0), Incomplete: 11, Skipped: 1',
    });
    const m = buildOpsWallModel(inputs({ runs: [slow, ...history] }));
    expect(m.kpis.pipelinesRunning).toBe(1);
    expect(m.pipelines[0].progress).toEqual({ done: 7, failed: 0, total: 18 });
    expect(m.pipelines[0].typicalSec).toBe(600);
    expect(m.pipelines[0].slow).toBe(true);
    expect(m.attention.map(a => a.rule)).toEqual(['pipeline-slow']);
    expect(m.attention[0].links[0].href).toBe('/tower?entity=backstage&tab=pipelines&run=ci-0-build-w825h');
    expect(m.pipelineStats).toEqual({ runs: 3, failedRuns: 0, p50Sec: 600 });
  });

  it('flags the latest failed run of a pipeline, but not one fixed by a newer success', () => {
    const failedThenFixed = [
      run({ name: 'f1', app: 'gate-api', stage: 'build', reason: 'Failed', startedMinAgo: 30, durationMin: 2 }),
      run({ name: 'f2', app: 'gate-api', stage: 'build', reason: 'Succeeded', startedMinAgo: 20, durationMin: 2 }),
    ];
    const stillBroken = run({
      name: 'b1',
      app: 'flight-api',
      stage: 'test',
      reason: 'Failed',
      startedMinAgo: 10,
      durationMin: 1,
    });
    const m = buildOpsWallModel(inputs({ runs: [...failedThenFixed, stillBroken] }));
    expect(m.attention.filter(a => a.rule === 'pipeline-failed').map(a => a.app)).toEqual(['flight-api']);
  });

  it('puts a proposed release in the approval queue and warns once it has waited 4h', () => {
    // checkin-api staging, live on 2026-10-07: proposed since the day before.
    const rec = toReleaseRecord(
      record({
        appName: 'checkin-api',
        env: 'staging',
        releaseId: 'c19a8a89:kind-prod/staging',
        state: 'proposed',
        prCreatedAt: '2026-10-06T06:04:28Z',
        stateAt: '2026-10-06T06:04:45Z',
        prUrl: 'https://github.com/jfillman/gitops-checkin-api/pull/9',
      }),
    );
    const fresh = toReleaseRecord(
      record({
        appName: 'gate-api',
        env: 'staging',
        releaseId: 'g1:kind-prod/staging',
        state: 'proposed',
        prCreatedAt: iso(30),
      }),
    );
    const m = buildOpsWallModel(inputs({ records: [rec, fresh] }));
    expect(m.kpis.awaitingApproval).toBe(2);
    expect(m.kpis.oldestApprovalSince).toBe('2026-10-06T06:04:28Z');
    expect(m.attention.map(a => `${a.rule}:${a.app}`)).toEqual(['release-awaiting-merge:checkin-api']);
    expect(m.attention[0].links[0]).toEqual({
      label: 'PR',
      href: 'https://github.com/jfillman/gitops-checkin-api/pull/9',
      external: true,
    });
  });

  it('shows a deploying release with its canary, and a sync failure as critical', () => {
    const progressing = toReleaseRecord(
      record({
        appName: 'gate-api',
        env: 'staging',
        releaseId: 'p:kind-prod/staging',
        state: 'progressing',
        mergedAt: iso(3),
      }),
    );
    const syncFailed = toReleaseRecord(
      record({
        appName: 'baggage-api',
        env: 'staging',
        releaseId: 's:kind-prod/staging',
        state: 'sync-failed',
        stateAt: iso(5),
        lastError: 'one or more objects failed to apply',
      }),
    );
    const canaryEnv = env({
      env: 'staging',
      rolloutPhase: 'Paused',
      workload: {
        kind: 'Rollout',
        name: 'gate-api',
        strategyKind: 'canary',
        canaryProgress: {
          steps: [{ kind: 'setWeight', weight: 25 }, { kind: 'pause' }, { kind: 'setWeight', weight: 100 }],
          currentStepIndex: 1,
          currentWeight: 25,
        },
      } as EnvironmentSummary['workload'],
    });
    const m = buildOpsWallModel(inputs({ records: [progressing, syncFailed], apps: [app('gate-api', [canaryEnv])] }));
    expect(m.deployments.map(d => `${d.kind}:${d.app}:${d.state}`)).toEqual([
      'release:gate-api:progressing',
      'release:baggage-api:sync failed',
    ]);
    expect(m.deployments[0].canary).toEqual({ weight: 25, step: 1, steps: 3 });
    expect(m.attention[0]).toMatchObject({ rule: 'release-sync-failed', severity: 'critical', app: 'baggage-api' });
    expect(m.kpis.canaries).toBe(1);
  });

  it('shows ground and cloud deploy runs, and a rollout with nothing behind it', () => {
    const ground = run({
      name: 'ci-1-deploy-calm-grebe',
      app: 'travel-agent-api',
      stage: 'deploy',
      reason: 'Running',
      startedMinAgo: 8,
      env: 'dev',
    });
    const rolling = env({ env: 'test', rolloutPhase: 'Progressing' });
    const m = buildOpsWallModel(inputs({ runs: [ground], apps: [app('order-api', [rolling])] }));
    expect(m.deployments.map(d => `${d.kind}:${d.app}:${d.env}`)).toEqual([
      'ground:travel-agent-api:dev',
      'rollout:order-api:test',
    ]);
  });

  it('only raises a stall while the release is still deploying', () => {
    const stuck = toReleaseRecord(
      record({
        appName: 'gate-api',
        env: 'staging',
        releaseId: 'a:kind-prod/staging',
        state: 'merged',
        mergedAt: iso(120),
      }),
    );
    const moved = toReleaseRecord(
      record({
        appName: 'flight-api',
        env: 'staging',
        releaseId: 'b:kind-prod/staging',
        state: 'healthy',
        stateAt: iso(10),
      }),
    );
    const events = [
      {
        reason: 'ReleaseStalled',
        involvedObject: { name: stuck.name, namespace: stuck.namespace },
        metadata: { namespace: stuck.namespace },
        lastTimestamp: iso(60),
      },
      {
        reason: 'ReleaseStalled',
        involvedObject: { name: moved.name, namespace: moved.namespace },
        metadata: { namespace: moved.namespace },
        lastTimestamp: iso(60),
      },
      { reason: 'Scheduled', metadata: { namespace: 'x' } },
    ]
      .map(toReleaseEvent)
      .filter(<T>(e: T | undefined): e is T => e !== undefined);
    expect(events).toHaveLength(2);
    const m = buildOpsWallModel(inputs({ records: [stuck, moved], events }));
    expect(m.attention.filter(a => a.rule === 'release-stalled').map(a => a.app)).toEqual(['gate-api']);
  });

  it('does not repeat a failed release that a newer healthy one replaced', () => {
    const failed = toReleaseRecord(
      record({
        appName: 'gate-api',
        env: 'staging',
        releaseId: 'f:kind-prod/staging',
        state: 'aborted',
        stateAt: iso(60),
      }),
    );
    const fixed = toReleaseRecord(
      record({
        appName: 'gate-api',
        env: 'staging',
        releaseId: 'h:kind-prod/staging',
        state: 'healthy',
        stateAt: iso(30),
      }),
    );
    const other = toReleaseRecord(
      record({
        appName: 'boarding-api',
        env: 'prod',
        releaseId: 'd:kind-prod/prod',
        state: 'degraded',
        stateAt: iso(15),
      }),
    );
    const m = buildOpsWallModel(inputs({ records: [failed, fixed, other] }));
    expect(m.attention.filter(a => a.rule === 'release-failed').map(a => a.app)).toEqual(['boarding-api']);
    expect(m.landed.map(l => `${l.app}:${l.ok}`)).toEqual(['boarding-api:false', 'gate-api:true', 'gate-api:false']);
  });

  it('reports degraded envs once, not also their pods and sync', () => {
    const degraded = env({
      env: 'pre-prod',
      rolloutPhase: 'Degraded',
      rolloutMessage: 'RolloutAborted: metric "error-rate" assessed Failed',
      argoSyncStatus: 'OutOfSync',
      pods: [{ name: 'p', ready: false, restarts: 9, containers: [] }],
    });
    const outOfSync = env({
      env: 'dev',
      rolloutPhase: 'Healthy',
      argoSyncStatus: 'OutOfSync',
      argoHealthStatus: 'Healthy',
    });
    const m = buildOpsWallModel(inputs({ apps: [app('boarding-api', [degraded, outOfSync])] }));
    expect(m.attention.map(a => `${a.rule}:${a.env}`)).toEqual(['env-degraded:pre-prod', 'argo-out-of-sync:dev']);
    expect(m.kpis).toMatchObject({ envsFailing: 1, envsTotal: 2, outOfSync: 2 });
  });

  it('raises SLO budget alerts and applies the owner filter to everything', () => {
    const m = buildOpsWallModel(
      inputs({
        slos: [
          {
            cluster: 'kind-prod',
            service: 'flight-api',
            slo: 'availability',
            periodBurnRate: 1.4,
            budgetRemaining: -0.4,
          },
          { cluster: 'kind-prod', service: 'gate-api', slo: 'latency', periodBurnRate: 0.9, budgetRemaining: 0.1 },
        ],
        appFilter: new Set(['gate-api']),
      }),
    );
    expect(m.attention.map(a => `${a.rule}:${a.app}`)).toEqual(['slo-budget-low:gate-api']);
  });
});
