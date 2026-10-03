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
//   - the two onboarding PRs (source repo + GitOps repo) and the request PR,
//     which the caller looks up on GitHub and passes in `links`;
//   - the app's SecretStore XR (Infisical project + identity).
// Tower's read-only identity cannot read ArgoCD Applications, so "Repositories
// and starter files" is inferred from the XR becoming Ready unless the caller
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

export interface PrSnapshot {
  number: number;
  url: string;
  state: 'open' | 'merged' | 'closed';
  mergedAt?: number;
}

export interface SecretsSnapshot {
  /** The SecretStore XR exists. */
  found: boolean;
  ready: boolean;
  readyAt?: number;
  /** Set when the XR reports a failed sync. */
  failed?: string;
}

export interface ProvisioningLinks {
  /** The PR that requested the service (against the cluster's tenants repo). */
  requestPr?: PrSnapshot;
  sourceRepoUrl?: string;
  gitopsRepoUrl?: string;
  /**
   * The onboarding PRs, one per repo. The object is undefined until the GitHub
   * lookup has answered; a repo's entry is undefined when that PR was not found.
   */
  onboarding?: { source?: PrSnapshot; gitops?: PrSnapshot };
  /** Infisical project id, when Tower can read the Project resource. */
  infisicalProjectId?: string;
}

/** One object the XR composes, for the "What gets created" list. `ready` is undefined when Tower cannot read that kind. */
export interface CreatedResource {
  kind: string;
  name: string;
  ready?: boolean;
}

export interface ProvisioningInputs {
  xr: XrSnapshot;
  created?: CreatedResource[];
  build?: BuildSnapshot;
  rollout?: RolloutSnapshot;
  managed?: ManagedSnapshot[];
  secrets?: SecretsSnapshot;
  links?: ProvisioningLinks;
}

export interface StepLink {
  label: string;
  url: string;
  state?: PrSnapshot['state'];
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
  /** Where to look at what this step made (PRs, repos, the Infisical project). */
  links?: StepLink[];
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
  /**
   * Built hours ago but never got a rollout on the dev cluster. Either it
   * deploys somewhere else (Backstage itself deploys to kind-prod) or the
   * deploy is stuck; either way it is not "being provisioned" any more.
   */
  stalled: boolean;
}

// How long a service may wait for its first rollout after the build before
// it stops counting as in flight. A normal deploy appears within minutes.
export const STALL_AFTER_MS = 4 * 3600 * 1000;

// Estimates from watching real provisions, not recorded history. The UI
// labels them "typical" until a history store replaces them.
export const TYPICAL_SEC: Record<string, number> = {
  request: 2,
  cluster: 10,
  cicd: 30,
  repos: 45,
  // A person merging two PRs, so this is a guess at a prompt human.
  onboarding: 120,
  secrets: 25,
  build: 150,
  running: 60,
};

// How long after a successful build the first rollout may take before the
// step says it is not coming (the dev environment file or deploy stage is missing).
const DEPLOY_GRACE_MS = 5 * 60 * 1000;

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

const prLink = (label: string, pr?: PrSnapshot): StepLink[] =>
  pr ? [{ label: `${label} #${pr.number}`, url: pr.url, state: pr.state }] : [];

// Same per-cluster hostname convention as Grafana's (kind-dev -> *.dev.kiac.local).
const INFISICAL_HOST_BY_CLUSTER: Record<string, string> = { 'kind-dev': 'infisical.dev.kiac.local' };

/** Public so the view and tests build the same URL. Infisical's UI is served over the gateway's http listener. */
export const infisicalProjectUrl = (cluster: string, projectId: string): string | undefined => {
  const host = INFISICAL_HOST_BY_CLUSTER[cluster];
  return host ? `http://${host}/projects/secret-management/${projectId}/overview` : undefined;
};

export function deriveProvisioning(input: ProvisioningInputs, now: number): Provisioning {
  const { xr, build, rollout, managed, secrets, links } = input;
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
    links: prLink('Request PR', links?.requestPr),
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
    links: [
      ...(links?.sourceRepoUrl ? [{ label: 'Source repo', url: links.sourceRepoUrl }] : []),
      ...(links?.gitopsRepoUrl ? [{ label: 'GitOps repo', url: links.gitopsRepoUrl }] : []),
    ],
  });

  const front = steps.slice(2, 4).every(s => s.state === 'done');
  // A pipeline run or a rollout cannot exist before the source repo's onboarding
  // PR merged (the .tekton files arrive with it), so either is proof of the step.
  const builtOrDeployed = Boolean(build) || Boolean(rollout);

  // 5. Application onboarding PRs: one against the source repo, one against the
  // GitOps repo. Nothing builds until the source one is merged; Glidepath opens
  // them but a person merges them.
  const ob = links?.onboarding;
  const obPrs = [ob?.source, ob?.gitops];
  const merged = obPrs.filter(pr => pr?.state === 'merged');
  let onboardingState: StepState = 'pend';
  let onboardingFraction = 0;
  let onboardingDetail: string | undefined;
  let onboardingEnd: number | undefined;
  if (builtOrDeployed || (ob && merged.length === 2)) {
    onboardingState = 'done';
    onboardingFraction = 1;
    onboardingEnd = merged.length ? Math.max(...merged.map(pr => pr?.mergedAt ?? 0)) || undefined : undefined;
  } else if (front) {
    onboardingState = 'run';
    if (!ob) {
      onboardingDetail = 'Merge the two onboarding PRs to start the first build';
    } else {
      onboardingFraction = merged.length / 2;
      const missing = obPrs.filter(pr => !pr).length;
      if (missing === 2) onboardingDetail = 'Waiting for onboarding to open its two PRs';
      else if (missing === 1) onboardingDetail = 'Waiting for onboarding to open the second PR';
      else onboardingDetail = `Merge the two onboarding PRs to start the first build (${merged.length} of 2 merged)`;
    }
  }
  const onboardingStart = Math.max(
    ts(clusterC?.lastTransitionTime) ?? 0,
    ts(cicdC?.lastTransitionTime) ?? 0,
    reposState === 'done' ? (reposEnd ?? 0) : 0,
  );
  let onboardingSeconds: number | undefined;
  if (onboardingState === 'done') onboardingSeconds = secBetween(onboardingStart || undefined, onboardingEnd);
  else if (onboardingState === 'run') onboardingSeconds = secBetween(onboardingStart || undefined, now);
  push({
    id: 'onboarding',
    title: 'Application onboarding PRs',
    desc: 'Two PRs, source repo and GitOps repo, add the pipeline files. Merging the source one starts the build',
    state: onboardingState,
    fraction: onboardingFraction,
    seconds: onboardingSeconds,
    detail: onboardingDetail,
    links: [...prLink('Source PR', ob?.source), ...prLink('GitOps PR', ob?.gitops)],
  });

  // 6. Infisical secrets resources: the app's SecretStore XR composes an
  // Infisical project, identity and the in-cluster store that reads it.
  let secretsState: StepState = 'pend';
  let secretsDetail: string | undefined;
  if (secrets?.ready) {
    secretsState = 'done';
  } else if (secrets?.failed) {
    secretsState = 'fail';
    secretsDetail = secrets.failed;
  } else if (!secrets?.found && builtOrDeployed) {
    // No SecretStore to wait for (unreadable, or an app that predates this step),
    // and a build already ran, so do not hold the whole provision open on it.
    secretsState = 'done';
  } else if (cicdDone) {
    secretsState = 'run';
    secretsDetail = secrets?.found
      ? 'Creating the Infisical project and identity'
      : 'Waiting for the SecretStore to be created';
  }
  const projectUrl = links?.infisicalProjectId ? infisicalProjectUrl(xr.cluster, links.infisicalProjectId) : undefined;
  let secretsSeconds: number | undefined;
  if (secretsState === 'done') secretsSeconds = secBetween(ts(cicdC?.lastTransitionTime), secrets?.readyAt);
  else if (secretsState === 'run') secretsSeconds = secBetween(ts(cicdC?.lastTransitionTime), now);
  push({
    id: 'secrets',
    title: 'Infisical secrets resources',
    desc: 'Project, machine identity and the cluster secret store that reads it',
    state: secretsState,
    seconds: secretsSeconds,
    detail: secretsDetail,
    parallel: true,
    links: projectUrl ? [{ label: 'Infisical project', url: projectUrl }] : [],
  });

  // 7. First build.
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
  } else if (onboardingState === 'done') {
    buildState = 'run';
    buildDetail = 'Waiting for the first pipeline run to start';
  }
  push({
    id: 'build',
    title: 'First build and checks',
    desc: 'Test, image build, scan, SBOM and signature. Starts by itself when the source onboarding PR merges',
    state: buildState,
    fraction: buildState === 'done' ? 1 : buildFraction,
    seconds: buildSec,
    detail: buildDetail,
  });

  // 8. Running healthy in dev. New apps get platform/envs/dev.yaml and a deploy
  // stage from onboarding, so this follows the build without anyone's help.
  let runState: StepState = 'pend';
  let runFraction = 0;
  let runSec: number | undefined;
  let runDetail: string | undefined;
  if (rollout) {
    const healthy = rollout.phase === 'Healthy' && rollout.available >= rollout.desired && rollout.desired > 0;
    if (healthy) runState = 'done';
    else if (rollout.phase === 'Degraded') runState = 'fail';
    else runState = 'run';
    runFraction = rollout.desired > 0 ? Math.min(1, rollout.available / rollout.desired) : 0;
    // No record of when a rollout turned healthy, so a finished step has no duration.
    runSec = healthy ? undefined : secBetween(build?.completedAt ?? rollout.createdAt, now);
    if (runState === 'fail') runDetail = 'The rollout reports Degraded';
  } else if (buildState === 'done') {
    runState = 'run';
    if (build?.completedAt !== undefined && now - build.completedAt > DEPLOY_GRACE_MS) {
      runDetail =
        'No rollout yet. The deploy stage needs a platform/envs/dev.yaml in the source repo and a deploy stage for dev in cicd.yaml';
    }
  }
  push({
    id: 'running',
    title: 'Running healthy in dev',
    desc: 'Rollout reaches its desired replicas on the dev cluster',
    state: runState,
    fraction: runState === 'done' ? 1 : runFraction,
    seconds: runSec,
    detail: runDetail,
  });

  const complete = steps.every(s => s.state === 'done');
  const failed = steps.some(s => s.state === 'fail');

  // Remaining time: parallel steps count as the slower of the pair.
  const byId = Object.fromEntries(steps.map(s => [s.id, s]));
  const remaining = (id: string) => {
    const s = byId[id];
    return s.state === 'done' ? 0 : s.typicalSec * (1 - s.fraction);
  };
  const etaSec = Math.round(
    remaining('request') +
      remaining('cluster') +
      Math.max(remaining('cicd'), remaining('repos')) +
      Math.max(remaining('onboarding'), remaining('secrets')) +
      remaining('build') +
      remaining('running'),
  );
  const elapsedSec = Math.round((now - created) / 1000);
  const percent = complete ? 100 : Math.min(99, Math.round((100 * elapsedSec) / Math.max(1, elapsedSec + etaSec)));

  let completedAt: number | undefined;
  if (complete) {
    const ends = [
      ts(clusterC?.lastTransitionTime),
      ts(cicdC?.lastTransitionTime),
      reposEnd,
      onboardingEnd,
      secrets?.readyAt,
      build?.completedAt,
      rollout?.createdAt,
    ].filter((x): x is number => x !== undefined);
    completedAt = ends.length ? Math.max(...ends) : now;
  }
  const stalled = !complete && !failed && !rollout && build?.phase === 'succeeded' && now - created > STALL_AFTER_MS;
  return { steps, complete, failed, elapsedSec, etaSec, percent, completedAt, stalled };
}
