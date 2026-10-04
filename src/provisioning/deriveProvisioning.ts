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
  /**
   * No XR exists yet: this is a request PR that is open, or merged and not yet applied by Argo.
   * `createdAt` is then the PR's own creation time, and the steps after "request" wait.
   */
  pending?: boolean;
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
  createdAt?: number;
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

export interface ArgoSnapshot {
  name: string;
  health?: string;
  sync?: string;
}

export interface CatalogSnapshot {
  /** A Component named after the service exists in the Backstage catalog. */
  found: boolean;
}

/** A deploy to a cloud target (ECS, Lambda, Container Apps), read from the app's deploy runs. */
export interface CloudDeploySnapshot {
  state: 'running' | 'succeeded' | 'failed';
  /** "AWS Lambda", "AWS ECS", "Azure Container Apps". */
  label: string;
  /** "Lambda function resize-fn", for the step's detail. */
  resource?: string;
  completedAt?: number;
  /** For a failed deploy: the task and what Tekton said. */
  failure?: string;
  consoleUrl?: string;
}

/**
 * XRs for a container-image function (Lambda, Azure Functions). They have no GitOps repo and no
 * Rollout: one onboarding PR on the source repo, and "deployed" means the cloud deploy ran.
 */
export const FUNCTION_KINDS = new Set(['LambdaFunction', 'AzureFunction']);

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

/**
 * When Tower itself watched a step change, for the steps the cluster keeps no timestamp for (the
 * catalog sync, a rollout turning healthy). Only trusted when the step was seen running first: a
 * step first seen already done says nothing about how long it took.
 */
export interface StepObservation {
  sawRunning?: boolean;
  startedAt?: number;
  endedAt?: number;
}

export interface ProvisioningInputs {
  xr: XrSnapshot;
  created?: CreatedResource[];
  build?: BuildSnapshot;
  rollout?: RolloutSnapshot;
  managed?: ManagedSnapshot[];
  secrets?: SecretsSnapshot;
  /** Undefined until the catalog lookup has answered (or when it could not). */
  catalog?: CatalogSnapshot;
  /** The ArgoCD app that installs the pipeline namespace. Undefined when ArgoCD cannot be read. */
  cicdApp?: ArgoSnapshot;
  /** Undefined when the app has no deploy to a cloud target. */
  cloudDeploy?: CloudDeploySnapshot;
  links?: ProvisioningLinks;
  /** Step id to what Tower watched; see StepObservation. */
  observed?: Record<string, StepObservation>;
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
  /** Epoch ms the step began and finished, when known. Feeds the events log and the history. */
  startedAt?: number;
  endedAt?: number;
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
  // A person merging the request PR, then ArgoCD's repo poll (about every 3 minutes) applying it.
  merge: 60,
  request: 180,
  cluster: 10,
  cicd: 30,
  repos: 45,
  // The ingestor picks the new XR up on its next sync, so this is a guess at one cycle.
  catalog: 60,
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

/**
 * `typical` overrides the built-in estimates, step id to seconds: Tower passes the median of the
 * recent real provisions once it has some.
 */
export function deriveProvisioning(
  input: ProvisioningInputs,
  now: number,
  typical?: Record<string, number>,
): Provisioning {
  const { xr, build, rollout, managed, secrets, catalog, cicdApp, cloudDeploy, links, observed } = input;
  const isFunction = FUNCTION_KINDS.has(xr.kind);
  // A function, or any app that deploys to a cloud target, has no Rollout to wait for.
  const cloudFinal = isFunction || Boolean(cloudDeploy);
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
  ) => {
    const obs = observed?.[s.id];
    const trusted = obs?.sawRunning ? obs : undefined;
    const startedAt = s.startedAt ?? trusted?.startedAt;
    const endedAt = s.endedAt ?? (s.state === 'done' ? trusted?.endedAt : undefined);
    const seconds =
      s.seconds ?? (s.state === 'done' && startedAt !== undefined && endedAt !== undefined ? secBetween(startedAt, endedAt) : undefined);
    steps.push({
      typicalSec: typical?.[s.id] ?? TYPICAL_SEC[s.id],
      fraction: s.state === 'done' ? 1 : 0,
      ...s,
      startedAt,
      endedAt,
      seconds,
    });
  };

  // 1. The request PR is merged, by a person. 2. ArgoCD applies it (it polls the repo about every
  // 3 minutes), which creates the resource. Normally the XR already exists, so both are done and
  // only their durations are left to show; they are known only when the PR's times were seen.
  const pending = Boolean(xr.pending);
  const reqPr = links?.requestPr;
  const requestMerged = !pending || reqPr?.state === 'merged';
  const dur = (from?: number, to?: number) => (from !== undefined && to !== undefined ? secBetween(from, to) : undefined);
  push({
    id: 'merge',
    title: 'Request PR merged',
    desc: 'A person merges the request PR in the tenants repo',
    state: requestMerged ? 'done' : 'run',
    startedAt: reqPr?.createdAt,
    endedAt: requestMerged ? reqPr?.mergedAt : undefined,
    seconds: requestMerged ? dur(reqPr?.createdAt, reqPr?.mergedAt) : secBetween(reqPr?.createdAt ?? created, now),
    detail: requestMerged ? undefined : 'Merge the request PR to start provisioning',
    links: prLink('Request PR', reqPr),
  });
  const appliedState: StepState = !pending ? 'done' : requestMerged ? 'run' : 'pend';
  push({
    id: 'request',
    title: 'Request applied',
    desc: 'ArgoCD applies the merged request, which creates the resource',
    state: appliedState,
    startedAt: reqPr?.mergedAt,
    endedAt: !pending ? created : undefined,
    seconds: !pending ? dur(reqPr?.mergedAt, created) : requestMerged ? dur(reqPr?.mergedAt, now) : undefined,
    detail:
      appliedState === 'run' ? 'Merged. ArgoCD polls the repo about every 3 minutes, then creates the resource' : undefined,
  });

  // 2. Dev cluster resolved. Nothing to resolve until the XR exists.
  const clusterDone = clusterC?.status === 'True';
  let clusterStepState: StepState = clusterDone ? 'done' : 'run';
  if (pending) clusterStepState = 'pend';
  push({
    id: 'cluster',
    title: 'Dev cluster chosen',
    desc: 'A registered, ready dev cluster is selected for onboarding',
    state: clusterStepState,
    startedAt: pending ? undefined : created,
    endedAt: clusterDone ? ts(clusterC?.lastTransitionTime) : undefined,
    seconds: clusterDone ? secBetween(created, ts(clusterC?.lastTransitionTime)) : undefined,
    detail: !clusterDone && clusterC?.message ? clusterC.message : undefined,
  });
  if (!clusterDone && !pending) steps[steps.length - 1].seconds = secBetween(created, now);

  // 3. CI/CD onboarded (parallel with repositories).
  // The condition only says the manifests were committed. The namespace exists once ArgoCD has
  // synced them, so the step waits for that app to be Synced and Healthy when ArgoCD can be read.
  const cicdCommitted = cicdC?.status === 'True';
  const cicdSettled = !cicdApp || (cicdApp.sync === 'Synced' && cicdApp.health === 'Healthy');
  const cicdDone = cicdCommitted && cicdSettled;
  const cicdWaiting =
    cicdCommitted && cicdApp && !cicdSettled
      ? `Committed. ArgoCD app ${cicdApp.name} is ${cicdApp.sync ?? 'unknown'} / ${cicdApp.health ?? 'unknown'}${
          cicdApp.health === 'Degraded' ? ' (a sync hook failed; see the app in ArgoCD)' : ''
        }`
      : undefined;
  push({
    id: 'cicd',
    title: 'CI/CD onboarded',
    desc: 'Tenant identity committed; the pipeline namespace is stood up',
    state: stateOf(cicdDone, clusterDone),
    startedAt: ts(clusterC?.lastTransitionTime),
    endedAt: cicdDone ? ts(cicdC?.lastTransitionTime) : undefined,
    seconds: cicdDone ? secBetween(ts(clusterC?.lastTransitionTime), ts(cicdC?.lastTransitionTime)) : undefined,
    detail: cicdWaiting ?? (!cicdDone && cicdC?.message ? cicdC.message : undefined),
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
  if (pending) reposState = 'pend';
  if (syncFailed && reposState !== 'done') reposState = 'fail';
  let reposSeconds: number | undefined;
  if (reposState === 'done') reposSeconds = secBetween(created, reposEnd);
  else if (reposState !== 'pend') reposSeconds = secBetween(created, now);
  push({
    id: 'repos',
    title: 'Repositories and starter files',
    desc: isFunction
      ? 'Source repo created, starter files committed'
      : 'Source and GitOps repos created, starter files committed',
    state: reposState,
    fraction: reposFraction,
    startedAt: pending ? undefined : created,
    endedAt: reposState === 'done' ? reposEnd : undefined,
    seconds: reposSeconds,
    detail: reposState === 'fail' ? synced?.message : undefined,
    parallel: true,
    links: [
      ...(links?.sourceRepoUrl ? [{ label: 'Source repo', url: links.sourceRepoUrl }] : []),
      ...(links?.gitopsRepoUrl ? [{ label: 'GitOps repo', url: links.gitopsRepoUrl }] : []),
    ],
  });

  // CI/CD and repositories both done, by id so a new step ahead of them cannot shift it.
  const front = steps.filter(s => s.id === 'cicd' || s.id === 'repos').every(s => s.state === 'done');
  // The app's own build run (not Glidepath's onboarding runs, see pickFirstBuild) or a rollout
  // cannot exist before the source repo's onboarding PR merged (the .tekton files arrive with
  // it), so either is proof of the step.
  const builtOrDeployed = Boolean(build) || Boolean(rollout) || Boolean(cloudDeploy);

  // 4b. Visible in the Backstage catalog. The catalog ingestor turns the XR into a Component on
  // its next sync; until then Tower's other tabs have no entity to open. Runs alongside the
  // steps above, since it only needs the XR.
  let catalogState: StepState = 'pend';
  if (catalog?.found) catalogState = 'done';
  else if (catalog) catalogState = 'run';
  // The lookup never answered (no catalog access) and a build already ran: do not hold the
  // whole provision open on something Tower cannot see.
  else if (builtOrDeployed) catalogState = 'done';
  push({
    id: 'catalog',
    title: 'Available in the Backstage catalog',
    desc: 'The catalog ingestor has picked the service up, so it can be opened in Tower',
    state: catalogState,
    startedAt: pending ? undefined : created,
    seconds: catalogState === 'run' ? secBetween(created, now) : undefined,
    detail: catalogState === 'run' ? "Waiting for the catalog ingestor's next sync" : undefined,
    parallel: true,
  });

  // 5. Application onboarding PRs: one against the source repo, one against the
  // GitOps repo. Nothing builds until the source one is merged; Glidepath opens
  // them but a person merges them.
  const ob = links?.onboarding;
  // A function has only the source repo, so one PR; an app has the source and GitOps ones.
  const obPrs = isFunction ? [ob?.source] : [ob?.source, ob?.gitops];
  const expectedPrs = obPrs.length;
  const merged = obPrs.filter(pr => pr?.state === 'merged');
  let onboardingState: StepState = 'pend';
  let onboardingFraction = 0;
  let onboardingDetail: string | undefined;
  let onboardingEnd: number | undefined;
  const mergePrompt = isFunction
    ? 'Merge the onboarding PR to start the first build'
    : 'Merge the two onboarding PRs to start the first build';
  if (builtOrDeployed || (ob && merged.length === expectedPrs)) {
    onboardingState = 'done';
    onboardingFraction = 1;
    onboardingEnd = merged.length ? Math.max(...merged.map(pr => pr?.mergedAt ?? 0)) || undefined : undefined;
  } else if (front) {
    onboardingState = 'run';
    if (!ob) {
      onboardingDetail = mergePrompt;
    } else if (isFunction) {
      onboardingFraction = merged.length / expectedPrs;
      onboardingDetail = ob.source ? mergePrompt : 'Waiting for onboarding to open its PR';
    } else {
      onboardingFraction = merged.length / expectedPrs;
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
    title: isFunction ? 'Application onboarding PR' : 'Application onboarding PRs',
    desc: isFunction
      ? 'One PR on the source repo adds the pipeline files. Merging it starts the build'
      : 'Two PRs, source repo and GitOps repo, add the pipeline files. Merging the source one starts the build',
    state: onboardingState,
    fraction: onboardingFraction,
    startedAt: onboardingStart || undefined,
    endedAt: onboardingState === 'done' ? onboardingEnd : undefined,
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
    startedAt: ts(cicdC?.lastTransitionTime),
    endedAt: secretsState === 'done' ? secrets?.readyAt : undefined,
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
    startedAt: build?.startedAt,
    endedAt: buildState === 'done' ? build?.completedAt : undefined,
    seconds: buildSec,
    detail: buildDetail,
  });

  // 8. The last step. For an app on Kubernetes: running healthy in dev (new apps get
  // platform/envs/dev.yaml and a deploy stage from onboarding, so this follows the build without
  // anyone's help). For a function, or any app that deploys to a cloud target, there is no Rollout:
  // the deploy stage updating the cloud resource is the step.
  let runState: StepState = 'pend';
  let runFraction = 0;
  let runSec: number | undefined;
  let runDetail: string | undefined;
  let runTitle = 'Running healthy in dev';
  let runDesc = 'Rollout reaches its desired replicas on the dev cluster';
  let runLinks: StepLink[] | undefined;
  if (cloudFinal) {
    const where = cloudDeploy?.label ?? 'the cloud target';
    runTitle = `Deployed to ${where}`;
    runDesc = 'The deploy stage updates the existing cloud resource to the new image';
    if (cloudDeploy?.consoleUrl) runLinks = [{ label: 'Open in console', url: cloudDeploy.consoleUrl }];
    if (cloudDeploy?.state === 'succeeded') {
      runState = 'done';
      runFraction = 1;
    } else if (cloudDeploy?.state === 'failed') {
      runState = 'fail';
      runDetail = cloudDeploy.failure ?? 'The deploy failed';
    } else if (cloudDeploy?.state === 'running') {
      runState = 'run';
      runSec = secBetween(build?.completedAt, now);
    } else if (buildState === 'done') {
      runState = 'run';
      runDetail = 'Waiting for the deploy stage to start';
      runSec = secBetween(build?.completedAt, now);
    }
  } else if (rollout) {
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
    title: runTitle,
    desc: runDesc,
    state: runState,
    fraction: runState === 'done' ? 1 : runFraction,
    startedAt: build?.completedAt ?? rollout?.createdAt,
    endedAt: cloudFinal && runState === 'done' ? cloudDeploy?.completedAt : undefined,
    seconds: runSec,
    detail: runDetail,
    links: runLinks,
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
    remaining('merge') +
      remaining('request') +
      remaining('cluster') +
      Math.max(remaining('cicd'), remaining('repos'), remaining('catalog')) +
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
      cloudDeploy?.completedAt,
    ].filter((x): x is number => x !== undefined);
    completedAt = ends.length ? Math.max(...ends) : now;
  }
  const deployed = Boolean(rollout) || cloudDeploy?.state === 'succeeded';
  const stalled = !complete && !failed && !deployed && build?.phase === 'succeeded' && now - created > STALL_AFTER_MS;
  return { steps, complete, failed, elapsedSec, etaSec, percent, completedAt, stalled };
}
