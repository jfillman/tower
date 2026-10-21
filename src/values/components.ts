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

/** `board-mq` + `password` -> `BOARD_MQ_PASSWORD`: the env var name Tower suggests for an output no naming profile covers. */
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
 * Which env var names the app's own framework or driver reads with no code: `spring-boot` for a SpringBootApplication
 * (Spring's relaxed binding turns SPRING_DATASOURCE_URL into spring.datasource.url, and an env var outranks the
 * packaged application.properties), `drivers` for the Node.js, Python and Go apps (libpq's PG* variables, which
 * node-postgres, psycopg, pgx and lib/pq all read). `<COMPONENT>_<OUTPUT>` names were read by no app unless it
 * happened to use them (flight-api dev, 2026-10-19: POSTGRESQL_* while the app read DB_*, so it connected to localhost).
 */
export type EnvProfile = 'spring-boot' | 'drivers';

/** The app-tier kind (airframe XRD, lower case, as in the catalog's `kind:<kind>` tag) -> its naming profile. */
export function envProfileFor(appKind: string | undefined): EnvProfile | undefined {
  if (appKind === 'springbootapplication') return 'spring-boot';
  if (appKind === 'nodejsapplication' || appKind === 'pythonapplication' || appKind === 'goapplication') return 'drivers';
  return undefined;
}

// Profile -> component type -> output -> the env var names that carry it. A type a profile lists is covered: its
// outputs not listed here are already inside one that is (SPRING_DATASOURCE_URL carries host, port and database), so
// adding the component leaves them unwired rather than adding variables nothing reads. A type a profile does not list
// (Dex for Spring: client or resource server is the app's call) gets <COMPONENT>_<OUTPUT> for every output.
// Property names checked against Spring Boot 4.1.1's configuration metadata. Boot 4 moved spring.data.mongodb.* to
// spring.mongodb.* and stopped binding the old name, so the Mongo URI goes out under both for Boot 3 and Boot 4 apps.
// Redis's url output is left out on purpose: it has no password, and Spring ignores spring.data.redis.password once
// spring.data.redis.url is set.
export const PROFILE_ENV: Record<EnvProfile, Record<string, Record<string, string[]>>> = {
  'spring-boot': {
    postgresql: {
      jdbcUri: ['SPRING_DATASOURCE_URL'],
      username: ['SPRING_DATASOURCE_USERNAME'],
      password: ['SPRING_DATASOURCE_PASSWORD'],
    },
    rabbitmq: {
      host: ['SPRING_RABBITMQ_HOST'],
      port: ['SPRING_RABBITMQ_PORT'],
      username: ['SPRING_RABBITMQ_USERNAME'],
      password: ['SPRING_RABBITMQ_PASSWORD'],
      vhost: ['SPRING_RABBITMQ_VIRTUAL_HOST'],
    },
    redis: {
      host: ['SPRING_DATA_REDIS_HOST'],
      port: ['SPRING_DATA_REDIS_PORT'],
      password: ['SPRING_DATA_REDIS_PASSWORD'],
    },
    mongodb: { uri: ['SPRING_MONGODB_URI', 'SPRING_DATA_MONGODB_URI'] },
  },
  drivers: {
    postgresql: {
      host: ['PGHOST'],
      port: ['PGPORT'],
      username: ['PGUSER'],
      password: ['PGPASSWORD'],
      database: ['PGDATABASE'],
      uri: ['DATABASE_URL'],
    },
  },
};

// The words an env var name ends in for each output, and the words its prefix ends in for each component type, for
// matching an output to a name the app's code reads (`RABBITMQ_USER` is rabbitmq's username, `DB_NAME` a database's).
// The component's own name (`board-mq` -> `BOARD_MQ`) counts as a prefix too, ahead of the type's words.
const OUTPUT_WORDS: Record<string, string[]> = {
  username: ['USER', 'USERNAME', 'LOGIN'],
  password: ['PASSWORD', 'PASS', 'PWD'],
  host: ['HOST', 'HOSTNAME', 'SERVER', 'ADDR', 'ADDRESS'],
  port: ['PORT'],
  vhost: ['VHOST', 'VIRTUAL_HOST'],
  url: ['URL', 'URI'],
  uri: ['URI', 'URL'],
  database: ['DATABASE', 'DB', 'DBNAME', 'NAME'],
  jdbcUri: ['JDBC_URL', 'JDBC_URI'],
  uriSrv: ['SRV_URI', 'SRV_URL', 'URI_SRV'],
  clientId: ['CLIENT_ID'],
  clientSecret: ['CLIENT_SECRET'],
  issuer: ['ISSUER', 'ISSUER_URL', 'ISSUER_URI'],
  tokenUrl: ['TOKEN_URL', 'TOKEN_URI', 'TOKEN_ENDPOINT'],
  jwksUrl: ['JWKS_URL', 'JWKS_URI', 'JWK_SET_URI'],
};
const TYPE_WORDS: Record<string, string[]> = {
  rabbitmq: ['RABBITMQ', 'RABBIT', 'AMQP', 'MQ', 'BROKER'],
  redis: ['REDIS', 'CACHE'],
  postgresql: ['POSTGRESQL', 'POSTGRES', 'PG', 'DB', 'DATABASE'],
  mongodb: ['MONGODB', 'MONGO', 'DB', 'DATABASE'],
  dex: ['OAUTH', 'OAUTH2', 'OIDC', 'AUTH', 'DEX', 'SSO'],
};

/**
 * Output -> the env var name the app's code reads for it, from the names the source scan found (the backend's
 * /app/env-reads). A name is `<PREFIX>_<WORD>`: WORD one of the output's words, PREFIX ending in the component's own
 * name or one of its type's words. The closest prefix wins (the component's name, then the type's words in order), and
 * no name is given to two outputs. Outputs with no such name are absent.
 */
export function matchReadNames(component: string, type: string | undefined, outputs: string[], reads: string[]): Record<string, string> {
  const prefixes = [envNameFor(component, '').replace(/_$/, ''), ...(TYPE_WORDS[type ?? ''] ?? [])].filter(Boolean);
  const pairs: Array<{ output: string; name: string; score: number }> = [];
  for (const output of outputs) {
    (OUTPUT_WORDS[output] ?? []).forEach((word, w) => {
      for (const name of reads) {
        if (!name.endsWith(`_${word}`)) continue;
        const prefix = name.slice(0, -word.length - 1);
        const p = prefixes.findIndex(x => prefix === x || prefix.endsWith(`_${x}`));
        // An exact prefix beats a longer one ending in it; the output's earlier words beat its later ones.
        if (p >= 0) pairs.push({ output, name, score: p * 100 + (prefix === prefixes[p] ? 0 : 50) + w });
      }
    });
  }
  pairs.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  const out: Record<string, string> = {};
  const used = new Set<string>();
  for (const { output, name } of pairs) {
    if (out[output] || used.has(name)) continue;
    out[output] = name;
    used.add(name);
  }
  return out;
}

/**
 * fromComponent env rows for the outputs of a component that nothing reads yet. Names come, in order, from what the
 * app's code reads (`reads`, the source scan: see matchReadNames), from the naming profile (`profile` + the component's
 * `type`, see PROFILE_ENV), or `<COMPONENT>_<OUTPUT>`. A name already in use is never overwritten: a profile name in use
 * (a second PostgreSQL in a Spring app) falls back to `<COMPONENT>_<OUTPUT>`, and a name still in use after that comes
 * back as `skipped`. When the profile covers the type, or the code reads some of the component's outputs, the outputs
 * not named come back as `left` (unwired) unless `all` asks for every output, as the card's "+ Add environment
 * variables" does. With `reads`, `fromCode` lists the names taken from the code and `unread` the added names the code
 * does not read (each one a guess the app may never see).
 */
export function componentEnvRows(
  rows: Array<{ name: string; kind: string; component: string; output: string }>,
  component: string,
  outputs: string[],
  opts: { type?: string; profile?: EnvProfile; all?: boolean; reads?: string[] } = {},
): {
  add: Array<{ name: string; component: string; output: string }>;
  skipped: string[];
  left: string[];
  fromCode: string[];
  unread: string[];
} {
  const add: Array<{ name: string; component: string; output: string }> = [];
  const skipped: string[] = [];
  const left: string[] = [];
  const fromCode: string[] = [];
  const taken = new Set(rows.map(r => r.name.trim()));
  const covered = opts.profile && opts.type ? PROFILE_ENV[opts.profile][opts.type] : undefined;
  const fromReads = opts.reads ? matchReadNames(component, opts.type, outputs, opts.reads) : {};
  const codeReadsSome = Object.keys(fromReads).length > 0;
  for (const output of outputs) {
    if (rows.some(r => r.kind === 'component' && r.component.trim() === component && r.output.trim() === output)) continue;
    const read = fromReads[output];
    if (read) {
      if (taken.has(read)) skipped.push(read);
      else {
        taken.add(read);
        add.push({ name: read, component, output });
        fromCode.push(read);
      }
      continue;
    }
    if (codeReadsSome && !opts.all) {
      left.push(output);
      continue;
    }
    const native = (covered?.[output] ?? []).filter(n => !taken.has(n));
    if (covered && !covered[output] && !opts.all) {
      left.push(output);
      continue;
    }
    const names = native.length > 0 ? native : [envNameFor(component, output)];
    for (const name of names) {
      if (taken.has(name)) {
        skipped.push(name);
        continue;
      }
      taken.add(name);
      add.push({ name, component, output });
    }
  }
  // A profile name is read by the framework or driver, not by the app's own code, so it is never "unread".
  const read = new Set([...(opts.reads ?? []), ...Object.values(covered ?? {}).flat()]);
  const unread = opts.reads ? add.map(a => a.name).filter(n => !read.has(n)) : [];
  return { add, skipped, left, fromCode, unread };
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
