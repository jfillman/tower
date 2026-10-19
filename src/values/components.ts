// What an attached component (components[] in the values file) hands to the app, per type: the outputs an env entry can
// take with `fromComponent: {name, output}` instead of hand-writing the Secret or ConfigMap name the component generates.
// Mirrors airframe's xrds/<type>.meta.yaml `outputs:` (the chart resolves `fromComponent` from the same files and fails
// the render on a wrong name). Static here, with a test that pins the shape; if a component gains an output, add it here.

export type OutputKind = 'secretKeyRef' | 'configMapKeyRef' | 'literal';

export interface ComponentOutput {
  kind: OutputKind;
  /** Secret or ConfigMap name template, `{name}` being the component's own name. Absent for a literal. */
  object?: string;
  key?: string;
}

export const COMPONENT_OUTPUTS: Record<string, Record<string, ComponentOutput>> = {
  redis: {
    host: { kind: 'literal' },
    port: { kind: 'literal' },
    url: { kind: 'literal' },
    password: { kind: 'secretKeyRef', object: '{name}-connection', key: 'password' },
  },
  postgresql: {
    host: { kind: 'secretKeyRef', object: '{name}-app', key: 'host' },
    port: { kind: 'secretKeyRef', object: '{name}-app', key: 'port' },
    username: { kind: 'secretKeyRef', object: '{name}-app', key: 'username' },
    password: { kind: 'secretKeyRef', object: '{name}-app', key: 'password' },
    database: { kind: 'secretKeyRef', object: '{name}-app', key: 'dbname' },
    uri: { kind: 'secretKeyRef', object: '{name}-app', key: 'uri' },
    jdbcUri: { kind: 'secretKeyRef', object: '{name}-app', key: 'jdbc-uri' },
  },
  rabbitmq: {
    username: { kind: 'secretKeyRef', object: '{name}-user-credentials', key: 'username' },
    password: { kind: 'secretKeyRef', object: '{name}-user-credentials', key: 'password' },
    host: { kind: 'configMapKeyRef', object: '{name}-connection', key: 'host' },
    port: { kind: 'configMapKeyRef', object: '{name}-connection', key: 'port' },
    vhost: { kind: 'configMapKeyRef', object: '{name}-connection', key: 'vhost' },
  },
  mongodb: {
    username: { kind: 'secretKeyRef', object: '{name}-app', key: 'username' },
    password: { kind: 'secretKeyRef', object: '{name}-app', key: 'password' },
    uri: { kind: 'secretKeyRef', object: '{name}-app', key: 'connectionString.standard' },
    uriSrv: { kind: 'secretKeyRef', object: '{name}-app', key: 'connectionString.standardSrv' },
  },
  dex: {
    clientId: { kind: 'secretKeyRef', object: '{name}-oauth-credentials', key: 'client-id' },
    clientSecret: { kind: 'secretKeyRef', object: '{name}-oauth-credentials', key: 'client-secret' },
    issuer: { kind: 'secretKeyRef', object: '{name}-oauth-credentials', key: 'issuer' },
    tokenUrl: { kind: 'secretKeyRef', object: '{name}-oauth-credentials', key: 'token-url' },
    jwksUrl: { kind: 'secretKeyRef', object: '{name}-oauth-credentials', key: 'jwks-url' },
  },
};

export interface DeclaredComponent {
  name: string;
  type: string;
}

/** The output names a component type offers, in the order its meta file lists them. Empty for a type Tower does not know. */
export const outputsOf = (type: string): string[] => Object.keys(COMPONENT_OUTPUTS[type] ?? {});

/** The components of a values file's `components:` list that have a name and a type. */
export function declaredComponents(value: unknown): DeclaredComponent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(c => {
    const name = (c as { name?: unknown })?.name;
    const type = (c as { type?: unknown })?.type;
    return typeof name === 'string' && name && typeof type === 'string' && type ? [{ name, type }] : [];
  });
}

/**
 * A hand-written Secret or ConfigMap reference that is really one component's own output (airframe-validate's
 * AF-COMP-003 warning): returns the `fromComponent` that says the same thing, or undefined when it is not one.
 */
export function matchComponentOutput(
  components: DeclaredComponent[],
  kind: 'secretKeyRef' | 'configMapKeyRef',
  refName: string,
  refKey: string,
): { name: string; output: string } | undefined {
  for (const c of components) {
    for (const [output, o] of Object.entries(COMPONENT_OUTPUTS[c.type] ?? {})) {
      if (o.kind === kind && o.object?.replace('{name}', c.name) === refName && o.key === refKey) return { name: c.name, output };
    }
  }
  return undefined;
}

/**
 * Env rows that still read from a component once it is removed: `fromComponent: {name}` rows, and Secret/ConfigMap refs
 * to one of its outputs by its derived name. Removing a component without them left env vars pointing at objects that
 * are gone (the chart refuses a fromComponent naming an undeclared component). Returns the rows to keep and the names
 * of the ones dropped.
 */
export function withoutComponentEnv<R extends { name: string; kind: string; component: string; refName: string; refKey: string }>(
  rows: R[],
  component: DeclaredComponent,
): { kept: R[]; dropped: string[] } {
  const kept: R[] = [];
  const dropped: string[] = [];
  for (const r of rows) {
    const ref = r.kind === 'configMap' || r.kind === 'secret';
    const belongs =
      (r.kind === 'component' && r.component.trim() === component.name) ||
      (ref &&
        matchComponentOutput([component], r.kind === 'configMap' ? 'configMapKeyRef' : 'secretKeyRef', r.refName.trim(), r.refKey.trim()) !== undefined);
    if (belongs) dropped.push(r.name || '(unnamed)');
    else kept.push(r);
  }
  return { kept, dropped };
}

/** `board-mq` + `password` -> `BOARD_MQ_PASSWORD`: the env var name Tower suggests for a component output. */
export function envNameFor(component: string, output: string): string {
  const snake = (v: string) =>
    v
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
  return `${snake(component)}_${snake(output)}`;
}

/**
 * fromComponent env rows for the outputs of a component that nothing reads yet. An output already read by some row is
 * left alone, and so is a suggested name another row already uses (never overwritten): those come back as `skipped`.
 */
export function componentEnvRows(
  rows: Array<{ name: string; kind: string; component: string; output: string }>,
  component: string,
  outputs: string[],
): { add: Array<{ name: string; component: string; output: string }>; skipped: string[] } {
  const add: Array<{ name: string; component: string; output: string }> = [];
  const skipped: string[] = [];
  const taken = new Set(rows.map(r => r.name.trim()));
  for (const output of outputs) {
    if (rows.some(r => r.kind === 'component' && r.component.trim() === component && r.output.trim() === output)) continue;
    const name = envNameFor(component, output);
    if (taken.has(name)) {
      skipped.push(name);
      continue;
    }
    taken.add(name);
    add.push({ name, component, output });
  }
  return { add, skipped };
}

/** Output -> the env var names reading it with fromComponent, for one component. */
export function wiredOutputs(rows: Array<{ name: string; kind: string; component: string; output: string }>, component: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of rows) {
    if (r.kind !== 'component' || r.component.trim() !== component || !r.name.trim()) continue;
    (out[r.output.trim()] ??= []).push(r.name.trim());
  }
  return out;
}

/** Points fromComponent rows at a component's new name. */
export function renameComponentEnv<R extends { kind: string; component: string }>(rows: R[], from: string, to: string): R[] {
  if (!from || from === to) return rows;
  return rows.map(r => (r.kind === 'component' && r.component.trim() === from ? { ...r, component: to } : r));
}
