// The editing model behind the Environments tab (glidepath docs/admin/envs-overhaul-requirements.md,
// section 4): edits are STAGED, shown together in the pending-changes panel, and only then turned
// into one change to cicd.yaml. Everything here is pure so the rules can be tested exhaustively.
//
// An app declares its environments either in the new shape (deploy.environments) or the older one
// (lowerEnvironments / upperEnvironments / promotionOrder). Tower always writes the new shape, so
// the first staged change to an old-shape app also converts it; that conversion is shown to the user
// as a change of its own and never happens silently.

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

/** The environments of a cicd.yaml `deploy:` block in either shape, plus which shape it was. */
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

  const lower = Array.isArray(d.lowerEnvironments) ? (d.lowerEnvironments as string[]) : ['dev'];
  const upper = (Array.isArray(d.upperEnvironments) ? d.upperEnvironments : []).map(u =>
    typeof u === 'string' ? { name: u } : (u as { name: string; cluster?: string }),
  );
  const envs: EnvDef[] = [
    ...lower.map(name => ({ name, tier: 'ground' as const })),
    ...upper.map(u => (u.cluster ? { name: u.name, tier: 'flight' as const, cluster: u.cluster } : { name: u.name, tier: 'flight' as const })),
  ];
  // promotionOrder is the declared sequence; keep it when it names exactly these environments, so a
  // conversion does not silently reorder the app.
  const order = Array.isArray(d.promotionOrder) ? (d.promotionOrder as string[]) : [];
  const names = envs.map(e => e.name);
  if (order.length === names.length && new Set(order).size === order.length && order.every(n => names.includes(n))) {
    return { shape: 'old', envs: order.map(n => envs.find(e => e.name === n) as EnvDef) };
  }
  return { shape: 'old', envs };
}

export type Staged =
  | { kind: 'add'; env: EnvDef }
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
    if (e.tier === 'flight' && cloud) {
      problems.push(`Flight environment "${e.name}" is not supported for ${t} yet: cloud targets have no approval path for Flight environments.`);
    }
    for (const b of CLOUD_BLOCKS) {
      if (e[b] && b !== wantBlock) {
        problems.push(`Environment "${e.name}" sets ${b}, but this app's target is ${t}.`);
      }
    }
  }
  return problems;
}

/** The `deploy:` block to write: the original with the three older fields replaced by environments. */
export function buildDeploy(originalDeploy: Deploy | undefined, envs: EnvDef[]): Deploy {
  const {
    lowerEnvironments: _l,
    upperEnvironments: _u,
    promotionOrder: _p,
    environments: _e,
    ...rest
  } = originalDeploy ?? {};
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
      title: 'Convert the environment list to deploy.environments',
      detail: 'lowerEnvironments, upperEnvironments and promotionOrder are replaced by one list. Nothing else changes.',
    });
  }
  return lines;
}

/** What happens after the cicd.yaml PR merges, so the panel can say it up front. */
export function followUps(before: EnvDef[], after: EnvDef[], target: string | undefined): string[] {
  const out: string[] = [];
  const had = new Set(before.map(e => e.name));
  const cloud = (target || 'k8s-rollout') !== 'k8s-rollout';
  for (const e of after) {
    if (had.has(e.name)) continue;
    if (e.tier === 'ground' && !cloud) {
      out.push(`Glidepath then opens a pull request on the source repo adding platform/envs/${e.name}.yaml. Merge it to finish creating ${e.name}.`);
    }
  }
  return out;
}

/** True when staging changed nothing about the environment list. */
export function isUnchanged(before: EnvDef[], after: EnvDef[]): boolean {
  return same(before, after);
}
