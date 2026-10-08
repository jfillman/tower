import { ENVS_ROOT } from '../types';
// The editing model behind the Environments tab (glidepath docs/admin/envs-overhaul-requirements.md,
// section 4): edits are STAGED, shown together in the pending-changes panel, and only then turned
// into one change to cicd.yaml. Everything here is pure so the rules can be tested exhaustively.
//
// An app declares its environments in deploy.environments (ADR-0019; unset = one Ground environment, dev).
// The older lowerEnvironments / upperEnvironments / promotionOrder were removed 2026-10-07.

export type Tier = 'ground' | 'flight';
export type CloudBlock = 'ecs' | 'lambda' | 'azureContainerApps';

export const CLOUD_BLOCKS: readonly CloudBlock[] = ['ecs', 'lambda', 'azureContainerApps'];

const TARGET_BLOCK: Record<string, CloudBlock> = {
  'aws-ecs': 'ecs',
  'aws-lambda': 'lambda',
  'azure-container-apps': 'azureContainerApps',
};

const ENV_NAME = /^[a-z][a-z0-9-]{0,30}$/;

type Block = Record<string, unknown>;

export interface EnvDef {
  name: string;
  tier: Tier;
  /** Flight only: the cluster when it is not the app's own. */
  cluster?: string;
  ecs?: Block;
  lambda?: Block;
  azureContainerApps?: Block;
}

export type Shape = 'new' | 'old';

export type Deploy = Record<string, unknown>;

const asBlock = (v: unknown): Block | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Block) : undefined;

/** The environments of a cicd.yaml `deploy:` block (`shape` is 'old' only when nothing is declared: Tower then writes the list). */
export function readEnvironments(deploy: Deploy | undefined): { shape: Shape; envs: EnvDef[] } {
  const d = deploy ?? {};
  const declared = d.environments;
  if (Array.isArray(declared) && declared.length > 0) {
    const envs: EnvDef[] = [];
    for (const raw of declared) {
      const e = asBlock(raw);
      if (!e || typeof e.name !== 'string') continue;
      const env: EnvDef = { name: e.name, tier: e.tier === 'flight' ? 'flight' : 'ground' };
      if (typeof e.cluster === 'string' && e.cluster) env.cluster = e.cluster;
      for (const b of CLOUD_BLOCKS) {
        const v = asBlock(e[b]);
        if (v) env[b] = v;
      }
      envs.push(env);
    }
    return { shape: 'new', envs };
  }

  // Nothing declared: Glidepath's default, one Ground environment.
  return { shape: 'old', envs: [{ name: 'dev', tier: 'ground' }] };
}

export type Staged =
  /** releaseStep: also add a `release` step for this (Flight) environment to the app's main pipeline. */
  | { kind: 'add'; env: EnvDef; releaseStep?: boolean; copyValuesFrom?: string }
  | { kind: 'move'; name: string; direction: 'up' | 'down' }
  | { kind: 'setBlock'; name: string; block: CloudBlock; value: Block | undefined }
  | { kind: 'remove'; name: string };

const firstIndexOfTier = (envs: EnvDef[], tier: Tier) => envs.findIndex(e => e.tier === tier);

export function applyStaged(envs: EnvDef[], staged: Staged[]): EnvDef[] {
  let out = envs.map(e => ({ ...e }));
  for (const s of staged) {
    if (s.kind === 'add') {
      // Ground environments go after the last Ground one (before any Flight one); Flight at the end.
      const at = s.env.tier === 'ground' ? firstIndexOfTier(out, 'flight') : -1;
      if (at === -1) out.push({ ...s.env });
      else out.splice(at, 0, { ...s.env });
    } else if (s.kind === 'remove') {
      out = out.filter(e => e.name !== s.name);
    } else if (s.kind === 'setBlock') {
      out = out.map(e => {
        if (e.name !== s.name) return e;
        const next = { ...e };
        if (s.value && Object.keys(s.value).length > 0) next[s.block] = s.value;
        else delete next[s.block];
        return next;
      });
    } else {
      const i = out.findIndex(e => e.name === s.name);
      if (i === -1) continue;
      const j = i + (s.direction === 'up' ? -1 : 1);
      // Only swap within the same tier: a Ground environment never jumps past a Flight one.
      if (out[j] && out[j].tier === out[i].tier) {
        [out[i], out[j]] = [out[j], out[i]];
      }
    }
  }
  return out;
}

/**
 * Stages a cloud-block edit, replacing any earlier staged edit of the same block of the same
 * environment, so typing in a field leaves one entry in the pending list instead of one per keystroke.
 */
export function stageSetBlock(staged: Staged[], name: string, block: CloudBlock, value: Block | undefined): Staged[] {
  return [
    ...staged.filter(s => !(s.kind === 'setBlock' && s.name === name && s.block === block)),
    { kind: 'setBlock', name, block, value },
  ];
}

/** Why this environment list would not be accepted: the same rules as the chart and the schema. */
export function validateEnvironments(envs: EnvDef[], target: string | undefined): string[] {
  const problems: string[] = [];
  const t = target || 'k8s-rollout';
  const wantBlock = TARGET_BLOCK[t];
  const cloud = t !== 'k8s-rollout';
  if (envs.length === 0) problems.push('An app needs at least one environment.');
  const seen = new Set<string>();
  for (const e of envs) {
    if (!ENV_NAME.test(e.name)) {
      problems.push(`"${e.name}" is not a valid environment name (lowercase letters, digits and "-", starting with a letter, at most 31 characters).`);
    }
    if (seen.has(e.name)) problems.push(`Environment "${e.name}" is listed twice.`);
    seen.add(e.name);
    if (e.tier === 'ground' && e.cluster) {
      problems.push(`Ground environment "${e.name}" sets a cluster. Ground environments on other clusters are not supported yet.`);
    }
    // A cloud Flight environment is approved by a release pin PR on the source repo (glidepath ADR-0020) and deploys
    // through its cloud settings, never to a cluster.
    if (e.tier === 'flight' && cloud && e.cluster) {
      problems.push(`Flight environment "${e.name}" sets a cluster, but ${t} has none: it deploys through its own ${wantBlock} settings.`);
    }
    for (const b of CLOUD_BLOCKS) {
      if (e[b] && b !== wantBlock) {
        problems.push(`Environment "${e.name}" sets ${b}, but this app's target is ${t}.`);
      }
    }
  }
  return problems;
}

/** The `deploy:` block to write: the original with its environments replaced. */
export function buildDeploy(originalDeploy: Deploy | undefined, envs: EnvDef[]): Deploy {
  const { environments: _e, ...rest } = originalDeploy ?? {};
  const serialize = (e: EnvDef) => {
    const o: Record<string, unknown> = { name: e.name, tier: e.tier };
    if (e.cluster) o.cluster = e.cluster;
    for (const b of CLOUD_BLOCKS) if (e[b]) o[b] = e[b];
    return o;
  };
  return { ...rest, environments: envs.map(serialize) };
}

export interface ChangeLine {
  kind: 'add' | 'remove' | 'edit' | 'reorder' | 'migrate';
  title: string;
  detail?: string;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What the staged changes amount to, one line each, for the pending-changes panel. */
export function describeChanges(before: EnvDef[], after: EnvDef[], shape: Shape): ChangeLine[] {
  const lines: ChangeLine[] = [];
  const beforeBy = new Map(before.map(e => [e.name, e]));
  const afterBy = new Map(after.map(e => [e.name, e]));

  after.forEach((e, i) => {
    if (!beforeBy.has(e.name)) {
      const prev = after[i - 1];
      lines.push({
        kind: 'add',
        title: `Add environment ${e.name}`,
        detail: `${e.tier === 'flight' ? 'Flight' : 'Ground'}${prev ? `, after ${prev.name}` : ''}`,
      });
    }
  });
  before.forEach(e => {
    if (!afterBy.has(e.name)) lines.push({ kind: 'remove', title: `Remove environment ${e.name}` });
  });

  for (const e of after) {
    const old = beforeBy.get(e.name);
    if (!old) continue;
    for (const b of CLOUD_BLOCKS) {
      const keys = new Set([...Object.keys(old[b] ?? {}), ...Object.keys(e[b] ?? {})]);
      for (const k of [...keys].sort()) {
        const was = old[b]?.[k];
        const now = e[b]?.[k];
        if (!same(was, now)) {
          lines.push({
            kind: 'edit',
            title: `${e.name}: ${b}.${k}`,
            detail: now === undefined ? `${String(was)} removed (the app-level value applies)` : `${was === undefined ? 'app-level value' : String(was)} to ${String(now)}`,
          });
        }
      }
    }
  }

  // Order among the environments that exist both before and after.
  const keptBefore = before.filter(e => afterBy.has(e.name)).map(e => e.name);
  const keptAfter = after.filter(e => beforeBy.has(e.name)).map(e => e.name);
  if (!same(keptBefore, keptAfter)) {
    lines.push({ kind: 'reorder', title: 'Change the promotion order', detail: after.map(e => e.name).join(' to ') });
  }

  if (lines.length > 0 && shape === 'old') {
    lines.unshift({
      kind: 'migrate',
      title: 'Declare the environment list in deploy.environments',
      detail: 'This app relied on the default (one Ground environment, dev); the list is now written out. Nothing else changes.',
    });
  }
  return lines;
}

/**
 * The files Glidepath keeps for one Ground environment on the source repo (backstage's environmentFiles.ts allows
 * exactly these paths). A missing file is skipped.
 */
export function envFilePaths(env: string): string[] {
  return [`${ENVS_ROOT}/envs/${env}.yaml`, `${ENVS_ROOT}/envs/${env}.release.yaml`];
}

/** Names of the pipelines that still have a step for this environment (either list or map form). */
export function pipelinesNamingEnv(pipelines: unknown, env: string): string[] {
  let entries: Array<[string, unknown]> = [];
  if (Array.isArray(pipelines)) entries = pipelines.map((p, i) => [String((p as { name?: unknown })?.name ?? i), p]);
  else if (pipelines && typeof pipelines === 'object') entries = Object.entries(pipelines as Record<string, unknown>);
  return entries
    .filter(([, p]) => {
      const steps = Array.isArray(p) ? p : (p as { steps?: unknown })?.steps;
      return Array.isArray(steps) && steps.some(st => (st as { env?: unknown })?.env === env);
    })
    .map(([name]) => name);
}

/** Environments the staged changes remove, in their original order. */
export function removedEnvs(before: EnvDef[], after: EnvDef[]): EnvDef[] {
  const kept = new Set(after.map(e => e.name));
  return before.filter(e => !kept.has(e.name));
}

/** Why removals could not be submitted. Only a Ground environment on a Kubernetes app can be removed here. */
export function validateRemovals(before: EnvDef[], after: EnvDef[], pipelines: unknown): string[] {
  const problems: string[] = [];
  for (const e of removedEnvs(before, after)) {
    if (e.tier === 'flight') {
      problems.push(`Flight environment "${e.name}" cannot be removed from here: removing it by hand is described in its row.`);
    }
    for (const p of pipelinesNamingEnv(pipelines, e.name)) {
      problems.push(`Pipeline "${p}" still has a step for "${e.name}". Remove that step in the Glidepath tab first.`);
    }
  }
  return problems;
}

/** The files to delete in the same pull request: those of removed Ground environments of a Kubernetes app. */
export function deleteFilesFor(before: EnvDef[], after: EnvDef[], target: string | undefined): string[] {
  if ((target || 'k8s-rollout') !== 'k8s-rollout') return [];
  return removedEnvs(before, after)
    .filter(e => e.tier === 'ground')
    .flatMap(e => envFilePaths(e.name));
}

/** What happens after the cicd.yaml PR merges, so the panel can say it up front. */
export function followUps(before: EnvDef[], after: EnvDef[], target: string | undefined, appName?: string): string[] {
  const out: string[] = [];
  const had = new Set(before.map(e => e.name));
  const cloud = (target || 'k8s-rollout') !== 'k8s-rollout';
  for (const e of removedEnvs(before, after)) {
    if (e.tier !== 'ground') continue;
    out.push(
      cloud
        ? `${e.name} is removed from cicd.yaml only. The ${target} resource it deployed to is not deleted: remove it in your cloud account.`
        : `The pull request also deletes ${ENVS_ROOT}/envs/${e.name}.yaml. After it merges Argo CD removes ${appName ? `${appName}-${e.name}` : `the ${e.name} Application`} and everything running in the ${appName ? `app-${appName}-${e.name}` : e.name} namespace.`,
    );
  }
  for (const e of after) {
    if (had.has(e.name)) continue;
    if (e.tier === 'flight' && cloud) {
      out.push(
        `${e.name} is approved by release pin pull requests on the source repo: each release to it opens one changing glidepath/releases/${e.name}.yaml, and merging it deploys exactly that image. Onboarding adds the promote-${e.name} flow and the release gates after the cicd.yaml change merges.`,
      );
    }
    if (e.tier === 'flight' && !cloud) {
      out.push(
        `${e.name} is created by an ApplicationEnvironment request on the tenants repo, opened first. Merge that one before the cicd.yaml change, so the environment exists when cicd.yaml names it. Crossplane then adds its gitops directory and the Application.`,
      );
    }
    if (e.tier === 'ground' && !cloud) {
      out.push(`Glidepath then opens a pull request on the source repo adding ${ENVS_ROOT}/envs/${e.name}.yaml. Merge it to finish creating ${e.name}.`);
    }
  }
  return out;
}

/** The Flight environments staged as new: each needs the ApplicationEnvironment request as well as the cicd.yaml entry. */
export function addedFlightEnvs(before: EnvDef[], after: EnvDef[]): EnvDef[] {
  const had = new Set(before.map(e => e.name));
  return after.filter(e => e.tier === 'flight' && !had.has(e.name));
}

/**
 * Problems specific to creating a Flight environment (existing Flight environments are not re-checked: an
 * older one may legitimately name no cluster, meaning the app's own). The request that creates it needs a
 * registered upper cluster and a Kubernetes app.
 */
export function validateAddedFlight(before: EnvDef[], after: EnvDef[], target: string | undefined): string[] {
  const out: string[] = [];
  const cloud = (target || 'k8s-rollout') !== 'k8s-rollout';
  for (const e of addedFlightEnvs(before, after)) {
    if (cloud) continue; // no cluster and no ApplicationEnvironment request: a cloud Flight environment is a release pin
    if (!e.cluster) out.push(`Flight environment "${e.name}" needs the cluster it runs on, for example kind-prod.`);
  }
  return out;
}

/** True when staging changed nothing about the environment list. */
export function isUnchanged(before: EnvDef[], after: EnvDef[]): boolean {
  return same(before, after);
}

// ---- release steps -------------------------------------------------------------------------------------------
// A Flight environment only receives releases through a `release` step in a pipeline. Creating the environment
// without one leaves it unreachable from CI, so adding a Flight environment can add the step too.

export interface ReleaseStepPlan {
  /** The `pipelines` value to write: the original with the steps inserted (the same object when nothing was added). */
  pipelines: unknown;
  added: Array<{ env: string; pipeline: string; after?: string }>;
  skipped: Array<{ env: string; reason: string }>;
}

type Step = Record<string, unknown>;
type PipelineSlot = { name: string; steps: Step[]; get: () => unknown; set: (steps: Step[]) => void };

const isStage = (st: Step, ...stages: string[]) => stages.includes(String(st.stage));

/** The pipelines of a cicd.yaml in map or legacy list form, as slots whose steps can be replaced on a copy. */
function pipelineSlots(pipelines: unknown): { copy: unknown; slots: PipelineSlot[] } {
  const clone = JSON.parse(JSON.stringify(pipelines ?? null));
  const slots: PipelineSlot[] = [];
  const add = (name: string, holder: Record<string, unknown>) => {
    const steps = holder.steps;
    if (!Array.isArray(steps)) return;
    slots.push({
      name,
      steps: steps as Step[],
      get: () => holder.steps,
      set: next => {
        holder.steps = next;
      },
    });
  };
  if (Array.isArray(clone)) {
    clone.forEach((p, i) => {
      if (p && typeof p === 'object' && !Array.isArray(p)) add(String((p as { name?: unknown }).name ?? i), p as Record<string, unknown>);
    });
  } else if (clone && typeof clone === 'object') {
    for (const [name, p] of Object.entries(clone as Record<string, unknown>)) {
      if (p && typeof p === 'object' && !Array.isArray(p)) add(name, p as Record<string, unknown>);
    }
  }
  return { copy: clone, slots };
}

/**
 * Adds a `release` step for each named environment to the app's main pipeline: the one with the most deploy and
 * release steps (the same rule Tower uses to infer the promotion order), the first on a tie. The step goes right
 * after the last step for the environment before it in promotion order, else at the end. An environment that
 * already has a step in any pipeline is left alone.
 */
export function planReleaseSteps(pipelines: unknown, envs: EnvDef[], names: string[]): ReleaseStepPlan {
  const { copy, slots } = pipelineSlots(pipelines);
  const plan: ReleaseStepPlan = { pipelines, added: [], skipped: [] };
  if (names.length === 0) return plan;
  if (slots.length === 0) {
    plan.skipped = names.map(env => ({ env, reason: 'the service has no pipeline with steps to add it to' }));
    return plan;
  }
  const weight = (sl: PipelineSlot) => sl.steps.filter(st => isStage(st, 'deploy', 'release')).length;
  const main = slots.reduce((best, sl) => (weight(sl) > weight(best) ? sl : best), slots[0]);
  for (const env of names) {
    if (slots.some(sl => sl.steps.some(st => st.env === env))) {
      plan.skipped.push({ env, reason: 'a pipeline already has a step for it' });
      continue;
    }
    const i = envs.findIndex(e => e.name === env);
    const prev = i > 0 ? envs[i - 1].name : undefined;
    const steps = [...(main.get() as Step[])];
    let at = steps.length;
    if (prev) {
      for (let k = steps.length - 1; k >= 0; k--) {
        if (steps[k].env === prev) {
          at = k + 1;
          break;
        }
      }
    }
    steps.splice(at, 0, { stage: 'release', env });
    main.set(steps);
    plan.added.push({ env, pipeline: main.name, ...(prev && at > 0 && steps[at - 1].env === prev ? { after: prev } : {}) });
  }
  if (plan.added.length > 0) plan.pipelines = copy;
  return plan;
}

/** Flight environments whose add was staged with the release step switched on and that survive in `after`. */
export function releaseStepEnvs(staged: Staged[], after: EnvDef[]): string[] {
  const alive = new Set(after.filter(e => e.tier === 'flight').map(e => e.name));
  return staged.flatMap(s => (s.kind === 'add' && s.releaseStep && alive.has(s.env.name) ? [s.env.name] : []));
}

/** Added environments that were staged as a copy of another, with the environment they copy. */
export function copiedEnvs(staged: Staged[], after: EnvDef[]): Array<{ env: EnvDef; from: string }> {
  return staged.flatMap(s => {
    if (s.kind !== 'add' || !s.copyValuesFrom) return [];
    const env = after.find(e => e.name === s.env.name);
    return env ? [{ env, from: s.copyValuesFrom }] : [];
  });
}
