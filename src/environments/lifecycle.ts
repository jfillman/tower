import type { ManagedSnapshot, PrSnapshot, SecretsSnapshot, StepLink, StepState } from '../provisioning/deriveProvisioning';
import { ENVS_ROOT } from '../types';

// What happens to a new environment between "the pull request is open" and "it is running", as ordered steps. The
// facts come from places Tower can read (GitHub through the backend, the ApplicationEnvironment XR and the objects it
// composes on the dev cluster, the live environment list); this turns them into the same step vocabulary the
// Provisioning tab uses. Pure, so it is tested against plain snapshots.

export interface EnvLifecycleStep {
  id: string;
  title: string;
  desc: string;
  state: StepState;
  detail?: string;
  links?: StepLink[];
}

export interface EnvLifecycleInputs {
  tier: 'ground' | 'flight';
  env: string;
  appName: string;
  owner: string;
  /** cicd.yaml names the environment: the pull request that adds it has merged. */
  declared: boolean;
  /** The cicd.yaml pull request, while it is the one being waited for. */
  cicdPrUrl?: string;
  /** Flight: the ApplicationEnvironment request on the tenants repo. */
  requestPr?: PrSnapshot;
  /** Ground: the onboarding pull request that adds glidepath/envs/<env>.yaml. */
  onboardingPr?: PrSnapshot;
  xr?: { found: boolean; synced?: boolean; failed?: string; workloadDeployed?: boolean; workloadReason?: string };
  files?: ManagedSnapshot[];
  secrets?: SecretsSnapshot;
  infisicalUrl?: string;
  /** The environment's values file exists (gitops values.yaml, or glidepath/envs/<env>.yaml). */
  valuesFileExists?: boolean;
  /** The environment is live in the cluster (a workload was discovered). */
  deployed?: boolean;
  tenantsRepoUrl?: string;
  gitopsRepoUrl?: string;
  valuesFileUrl?: string;
  /** Ground: the values file's path in the source repo (under glidepath/). */
  valuesFilePath?: string;
  /** Ground: a pipeline has a deploy step for the environment. Undefined = unknown. */
  pipelineStep?: boolean;
  /**
   * 'infra' for an InfraService: no onboarding pull request (its environment file is added with the cicd.yaml change
   * or by hand) and no build or deploy step (Argo CD deploys the values file; the component's operator runs it).
   */
  appType?: 'app' | 'infra';
}

const prLink = (label: string, pr?: PrSnapshot): StepLink[] | undefined =>
  pr ? [{ label, url: pr.url, state: pr.state }] : undefined;

function prStep(id: string, title: string, desc: string, pr: PrSnapshot | undefined, waiting: string): EnvLifecycleStep {
  if (!pr) return { id, title, desc, state: 'pend', detail: waiting };
  if (pr.state === 'merged') return { id, title, desc, state: 'done', links: prLink(`PR #${pr.number}`, pr) };
  if (pr.state === 'closed') return { id, title, desc, state: 'fail', detail: 'The pull request was closed without merging.', links: prLink(`PR #${pr.number}`, pr) };
  return { id, title, desc, state: 'run', detail: 'Waiting for the pull request to be merged.', links: prLink(`PR #${pr.number}`, pr) };
}

export function deriveEnvLifecycle(i: EnvLifecycleInputs): EnvLifecycleStep[] {
  const cicd: EnvLifecycleStep = i.declared
    ? { id: 'cicd', title: 'cicd.yaml declares it', desc: `${i.env} is in the service's environment list.`, state: 'done' }
    : {
        id: 'cicd',
        title: 'cicd.yaml change merged',
        desc: `Adds ${i.env} to the service's environment list.`,
        state: i.cicdPrUrl ? 'run' : 'pend',
        detail: i.cicdPrUrl ? 'Waiting for the pull request to be merged.' : undefined,
        links: i.cicdPrUrl ? [{ label: 'Pull request', url: i.cicdPrUrl, state: 'open' }] : undefined,
      };

  if (i.tier === 'ground') {
    const valuesPath = i.valuesFilePath ?? `${ENVS_ROOT}/envs/${i.env}.yaml`;
    const file: EnvLifecycleStep = {
      id: 'values',
      title: `${valuesPath} exists`,
      desc: 'The values file the environment deploys from.',
      state: i.valuesFileExists ? 'done' : 'pend',
      links: i.valuesFileUrl && i.valuesFileExists ? [{ label: 'View file', url: i.valuesFileUrl }] : undefined,
    };
    const onboarding = prStep(
      'onboarding',
      'Onboarding pull request',
      `Glidepath opens a pull request that adds ${valuesPath} once cicd.yaml has merged.`,
      i.onboardingPr,
      i.declared ? 'Not opened yet: Glidepath opens it shortly after the merge.' : 'Opens after the cicd.yaml change merges.',
    );
    if (!i.declared) onboarding.state = 'pend';
    // Argo CD creates the namespace as soon as the values file exists, but nothing runs in it until a pipeline's deploy
    // step puts an image there - and a pipeline only has such a step if one was added (2026-10-12: a new test
    // environment sat at "Deployed: waiting" for good, since the ci pipeline only deployed to dev).
    if (i.appType === 'infra') {
      let infraWaiting: string | undefined;
      if (!i.deployed) {
        infraWaiting = i.valuesFileExists
          ? `Waiting for Argo CD app ${i.appName}-${i.env} and the component it declares to come up.`
          : `Nothing builds an InfraService: create ${valuesPath} from this environment's Values sub-tab and Argo CD deploys it.`;
      }
      const live: EnvLifecycleStep = {
        id: 'workload',
        title: 'Deployed',
        desc: 'Argo CD deploys the values file; the component it declares (a broker, say) is brought up by its operator.',
        state: i.deployed ? 'done' : 'pend',
        detail: infraWaiting,
      };
      return [cicd, file, live];
    }
    let waiting: string | undefined;
    if (!i.deployed) {
      if (i.pipelineStep === false) {
        waiting = `No pipeline has a deploy step for ${i.env}: nothing deploys here until one is added in the Glidepath tab (Add environment can add it next time).`;
      } else if (!i.valuesFileExists) {
        waiting = 'Starts with the image of the environment before it when the onboarding pull request merges; after that, the pipeline\'s deploy step (a push to the default branch) puts each new image here.';
      } else {
        waiting = 'Deploys on the pipeline\'s next run (a push to the default branch).';
      }
    }
    const live: EnvLifecycleStep = {
      id: 'workload',
      title: 'Deployed',
      desc: 'Argo CD creates the namespace and the first deploy puts the service in it.',
      state: i.deployed ? 'done' : 'pend',
      detail: waiting,
    };
    return [cicd, onboarding, file, live];
  }

  // Flight
  let request = prStep(
    'request',
    'ApplicationEnvironment request',
    'A pull request on the tenants repo that requests the environment.',
    i.requestPr,
    'Not found yet: Add environment opens it together with the cicd.yaml change.',
  );
  // The XR exists only once its request has merged and Argo CD applied it, so a found XR settles this step even when
  // the pull request cannot be looked up (another tenants repo, a hand-applied XR, GitHub unreachable).
  if (i.xr?.found && request.state !== 'done') {
    request = {
      ...request,
      state: 'done',
      detail: undefined,
      links: request.links
        ?.filter(l => l.state !== 'closed')
        .map(l => ({ ...l, state: 'merged' as const })),
    };
  }
  if (i.tenantsRepoUrl && !request.links) request.links = [{ label: 'Tenants repo', url: i.tenantsRepoUrl }];

  let applied: EnvLifecycleStep = {
    id: 'applied',
    title: 'Applied by Crossplane',
    desc: 'Argo CD applies the merged request and Crossplane creates the environment.',
    state: 'pend',
  };
  if (i.xr?.found) {
    if (i.xr.failed) applied = { ...applied, state: 'fail', detail: i.xr.failed };
    else applied = { ...applied, state: i.xr.synced ? 'done' : 'run', detail: i.xr.synced ? undefined : 'Reconciling.' };
  }

  const ready = (i.files ?? []).filter(f => f.ready).length;
  const total = (i.files ?? []).length;
  let filesState: StepState = 'pend';
  if (total > 0) filesState = ready === total ? 'done' : 'run';
  const files: EnvLifecycleStep = {
    id: 'files',
    title: 'Files written to GitHub',
    desc: 'The identity, secret store requests and values.yaml are committed.',
    state: filesState,
    detail: total > 0 && ready < total ? `${ready} of ${total} written.` : undefined,
    links: i.gitopsRepoUrl ? [{ label: 'GitOps repo', url: i.gitopsRepoUrl }] : undefined,
  };

  let secrets: EnvLifecycleStep = {
    id: 'secrets',
    title: 'Secret store (Infisical)',
    desc: 'A project for this environment, and the identity that reads it.',
    state: 'pend',
  };
  if (i.secrets?.found) {
    if (i.secrets.failed) secrets = { ...secrets, state: 'fail', detail: i.secrets.failed };
    else secrets = { ...secrets, state: i.secrets.ready ? 'done' : 'run', detail: i.secrets.ready ? undefined : 'Creating the project.' };
  }
  if (i.infisicalUrl && i.secrets?.ready) secrets.links = [{ label: 'Infisical project', url: i.infisicalUrl }];

  const values: EnvLifecycleStep = {
    id: 'values',
    title: 'Values file ready',
    desc: `${i.env}'s values can be edited here once values.yaml exists.`,
    state: i.valuesFileExists ? 'done' : 'pend',
    links: i.valuesFileUrl && i.valuesFileExists ? [{ label: 'View file', url: i.valuesFileUrl }] : undefined,
  };

  const deployed = i.deployed || i.xr?.workloadDeployed;
  const first: EnvLifecycleStep = {
    id: 'workload',
    title: 'First deploy',
    desc: 'The first release to this environment.',
    state: deployed ? 'done' : 'pend',
    detail: !deployed && i.xr?.workloadReason === 'NoImageYet' ? 'Waiting for the first release: nothing has been released to this environment yet.' : undefined,
  };
  return [cicd, request, applied, files, secrets, values, first];
}

/** The first step that is not done, or undefined when the environment is fully provisioned. */
export function currentStep(steps: EnvLifecycleStep[]): EnvLifecycleStep | undefined {
  return steps.find(s => s.state !== 'done');
}
