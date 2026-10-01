// Turns what Tower can actually read about a freshly requested service into
// an ordered list of steps with state, timing and progress. Pure on purpose:
// every input is a plain snapshot, so this is testable against real objects
// captured from a cluster and the hook that fetches them stays thin.
//
// The steps are the observable milestones of an Airframe application XR, not
// an idealised flow:
//   - the XR's own conditions (DevClusterReady, CicdOnboarded, Synced, Ready),
//     which the composition writes with real transition timestamps;
//   - the first Tekton PipelineRun in the app's `app-<name>-cicd` namespace;
//   - the Argo Rollout in `app-<name>-dev`.
// Tower's read-only identity cannot read the Crossplane managed resources
// (Repository, RepositoryFile) or ArgoCD Applications, so "Repositories and
// starter files" is inferred from the XR becoming Ready unless the caller
// supplies per-resource readiness in `managed`.

export type StepState = 'done' | 'run' | 'pend' | 'fail';

export interface XrCondition {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

export interface XrSnapshot {
  kind: string;
  name: string;
  namespace: string;
  cluster: string;
  createdAt: number;
  conditions: XrCondition[];
}

export interface BuildSnapshot {
  name: string;
  phase: 'pending' | 'running' | 'succeeded' | 'failed';
  startedAt?: number;
  completedAt?: number;
  tasksDone: number;
  tasksTotal: number;
}

export interface RolloutSnapshot {
  phase?: string;
  desired: number;
  available: number;
  createdAt?: number;
}

export interface ManagedSnapshot {
  name: string;
  ready: boolean;
  readyAt?: number;
}

export interface ProvisioningInputs {
  xr: XrSnapshot;
  build?: BuildSnapshot;
  rollout?: RolloutSnapshot;
  managed?: ManagedSnapshot[];
}

export interface ProvisioningStep {
  id: string;
  title: string;
  desc: string;
  state: StepState;
  /** Seconds this step took, or has been running. Undefined if unknown or not started. */
  seconds?: number;
  /** Typical seconds for this step. An estimate until Tower records history. */
  typicalSec: number;
  /** 0..1 within the step while running. */
  fraction: number;
  /** Failure or waiting detail, in plain words. */
  detail?: string;
  /** True when this step ran alongside the previous one. */
  parallel?: boolean;
}

export interface Provisioning {
  steps: ProvisioningStep[];
  complete: boolean;
  failed: boolean;
  elapsedSec: number;
  etaSec: number;
  percent: number;
  /** Epoch ms of the last finished step, once complete. */
  completedAt?: number;
}

// Estimates from watching real provisions, not recorded history. The UI
// labels them "typical" until a history store replaces them.
export const TYPICAL_SEC: Record<string, number> = {
  request: 2,
  cluster: 10,
  cicd: 30,
  repos: 45,
  build: 150,
  running: 60,
};

const ts = (iso?: string) => (iso ? Date.parse(iso) : undefined);
const secBetween = (a?: number, b?: number) =>
  a !== undefined && b !== undefined ? Math.max(0, Math.round((b - a) / 1000)) : undefined;

// done if finished, running if its prerequisite is met, otherwise waiting.
const stateOf = (done: boolean, ready: boolean): StepState => {
  if (done) return 'done';
  return ready ? 'run' : 'pend';
};

function cond(xr: XrSnapshot, type: string): XrCondition | undefined {
  return xr.conditions.find(c => c.type === type);
}

export function deriveProvisioning(input: ProvisioningInputs, now: number): Provisioning {
  const { xr, build, rollout, managed } = input;
  const created = xr.createdAt;
  const synced = cond(xr, 'Synced');
  const ready = cond(xr, 'Ready');
  const clusterC = cond(xr, 'DevClusterReady');
  const cicdC = cond(xr, 'CicdOnboarded');
  const syncFailed = synced?.status === 'False';

  const steps: ProvisioningStep[] = [];
  const push = (
    s: Omit<ProvisioningStep, 'typicalSec' | 'fraction'> & {
      fraction?: number;
    },
  ) =>
    steps.push({
      typicalSec: TYPICAL_SEC[s.id],
      fraction: s.state === 'done' ? 1 : 0,
      ...s,
    });

  // 1. The XR exists, so the request was accepted.
  push({
    id: 'request',
    title: 'Request accepted',
    desc: 'Claim validated against the Airframe schema',
    state: 'done',
    seconds: 0,
  });

  // 2. Dev cluster resolved.
  const clusterDone = clusterC?.status === 'True';
  push({
    id: 'cluster',
    title: 'Dev cluster chosen',
    desc: 'A registered, ready dev cluster is selected for onboarding',
    state: clusterDone ? 'done' : 'run',
    seconds: clusterDone ? secBetween(created, ts(clusterC?.lastTransitionTime)) : secBetween(created, now),
    detail: !clusterDone && clusterC?.message ? clusterC.message : undefined,
  });

  // 3. CI/CD onboarded (parallel with repositories).
  const cicdDone = cicdC?.status === 'True';
  push({
    id: 'cicd',
    title: 'CI/CD onboarded',
    desc: 'Tenant identity committed; the pipeline namespace is stood up',
    state: stateOf(cicdDone, clusterDone),
    seconds: cicdDone ? secBetween(ts(clusterC?.lastTransitionTime), ts(cicdC?.lastTransitionTime)) : undefined,
    detail: !cicdDone && cicdC?.message ? cicdC.message : undefined,
  });

  // 4. Repositories and starter files.
  let reposState: StepState;
  let reposFraction = 0;
  let reposEnd: number | undefined;
  if (managed && managed.length > 0) {
    const nReady = managed.filter(m => m.ready).length;
    reposFraction = nReady / managed.length;
    reposState = nReady === managed.length ? 'done' : 'run';
    reposEnd = Math.max(...managed.map(m => m.readyAt ?? 0)) || undefined;
  } else {
    reposState = ready?.status === 'True' ? 'done' : 'run';
    reposEnd = ts(ready?.lastTransitionTime);
    reposFraction = reposState === 'done' ? 1 : 0;
  }
  if (syncFailed && reposState !== 'done') reposState = 'fail';
  push({
    id: 'repos',
    title: 'Repositories and starter files',
    desc: 'Source and GitOps repos created, starter files committed',
    state: reposState,
    fraction: reposFraction,
    seconds: reposState === 'done' ? secBetween(created, reposEnd) : secBetween(created, now),
    detail: reposState === 'fail' ? synced?.message : undefined,
    parallel: true,
  });

  const front = steps.slice(2, 4).every(s => s.state === 'done');

  // 5. First build.
  let buildState: StepState = 'pend';
  let buildFraction = 0;
  let buildSec: number | undefined;
  let buildDetail: string | undefined;
  if (build) {
    buildFraction = build.tasksTotal > 0 ? Math.min(1, build.tasksDone / build.tasksTotal) : 0;
    if (build.phase === 'succeeded') buildState = 'done';
    else if (build.phase === 'failed') buildState = 'fail';
    else buildState = 'run';
    buildSec = secBetween(build.startedAt, build.completedAt ?? now);
    if (buildState === 'fail') buildDetail = `${build.name} failed`;
  } else if (rollout) {
    // Pipeline runs get pruned, but a rollout cannot exist without a built
    // image, so a rollout is proof the build happened.
    buildState = 'done';
  } else if (front) {
    buildState = 'run';
    buildDetail = 'Waiting for the first pipeline run to start';
  }
  push({
    id: 'build',
    title: 'First build and checks',
    desc: 'Test, image build, scan, SBOM and signature',
    state: buildState,
    fraction: buildState === 'done' ? 1 : buildFraction,
    seconds: buildSec,
    detail: buildDetail,
  });

  // 6. Running healthy in dev.
  let runState: StepState = 'pend';
  let runFraction = 0;
  let runSec: number | undefined;
  if (rollout) {
    const healthy = rollout.phase === 'Healthy' && rollout.available >= rollout.desired && rollout.desired > 0;
    if (healthy) runState = 'done';
    else if (rollout.phase === 'Degraded') runState = 'fail';
    else runState = 'run';
    runFraction = rollout.desired > 0 ? Math.min(1, rollout.available / rollout.desired) : 0;
    // No record of when a rollout turned healthy, so a finished step has no duration.
    runSec = healthy ? undefined : secBetween(build?.completedAt ?? rollout.createdAt, now);
  } else if (buildState === 'done') {
    runState = 'run';
  }
  push({
    id: 'running',
    title: 'Running healthy in dev',
    desc: 'Rollout reaches its desired replicas on the dev cluster',
    state: runState,
    fraction: runState === 'done' ? 1 : runFraction,
    seconds: runSec,
    detail: runState === 'fail' ? 'The rollout reports Degraded' : undefined,
  });

  const complete = steps.every(s => s.state === 'done');
  const failed = steps.some(s => s.state === 'fail');

  // Remaining time: the parallel pair counts as the slower of the two.
  const remaining = (s: ProvisioningStep) => (s.state === 'done' ? 0 : s.typicalSec * (1 - s.fraction));
  const etaSec = Math.round(
    remaining(steps[0]) +
      remaining(steps[1]) +
      Math.max(remaining(steps[2]), remaining(steps[3])) +
      remaining(steps[4]) +
      remaining(steps[5]),
  );
  const elapsedSec = Math.round((now - created) / 1000);
  const percent = complete ? 100 : Math.min(99, Math.round((100 * elapsedSec) / Math.max(1, elapsedSec + etaSec)));

  let completedAt: number | undefined;
  if (complete) {
    const ends = [
      ts(clusterC?.lastTransitionTime),
      ts(cicdC?.lastTransitionTime),
      reposEnd,
      build?.completedAt,
      rollout?.createdAt,
    ].filter((x): x is number => x !== undefined);
    completedAt = ends.length ? Math.max(...ends) : now;
  }
  return { steps, complete, failed, elapsedSec, etaSec, percent, completedAt };
}
