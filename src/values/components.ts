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
