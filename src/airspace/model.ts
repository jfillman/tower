// Airspace: who an app talks to, from three sources that disagree on purpose (docs/airspace.md).
//
//   observed  the service graph: traces_service_graph_request_total{client, server, connection_type}, remote-written
//             into the cluster's Prometheus by the OTel collector's servicegraph connector. client/server are
//             OpenTelemetry service names, which Hangar's Instrumentation derives from app.kubernetes.io/instance:
//             `<app>-<env>`. A client of `user` is a request with no traced caller (the gateway, a port-forward).
//             connection_type is "" for an RPC, `messaging_system` for a producer/consumer pair through a broker,
//             `database` for a DB span (Postgres, Redis; named by host) and `virtual_node` for a peer that sends no
//             spans of its own (an external host).
//   declared  The environment's chart values: networkPolicy.allowIngressFrom / allowEgressTo namespace peers, the only
//             place an app says today which other apps may reach it.
//   composed  The environment's chart values: components[] (Redis, PostgreSQL, RabbitMQ, ...), which Crossplane runs for
//             the app. Nothing to declare; the edge exists because the app owns the thing.
//
// Pure: no React, no fetching. The hooks in useAirspace.ts feed it.

export type EdgeKind = 'rpc' | 'messaging' | 'database' | 'ingress' | 'peer';
export type Direction = 'inbound' | 'outbound' | 'owned';
/**
 * ok: declared and seen. undeclared: seen in traffic, not declared. silent: declared, not seen in the window.
 * composed: an owned component. ingress: traffic from outside the mesh (the gateway, probes). broker: through a broker
 * the app attaches to, so no NetworkPolicy declaration applies.
 */
export type EdgeState = 'ok' | 'undeclared' | 'silent' | 'composed' | 'ingress' | 'broker';

export interface ServiceGraphSample {
  client: string;
  server: string;
  connectionType: string;
  /** Requests per second over the window. */
  rate: number;
}

export interface EdgeStats {
  rate: number;
  /** Seconds; undefined when the histogram has no samples in the window. */
  p95?: number;
  /** Failed requests per second. */
  errorRate: number;
}

export interface Counterpart {
  /** Stable key within one app's airspace. */
  id: string;
  /** What the row shows: an app name, a component name, a peer's service name. */
  name: string;
  /** The Hangar app on the other end, when it is one. */
  app?: string;
  direction: Direction;
  kind: EdgeKind;
  state: EdgeState;
  observed?: EdgeStats;
  declared: boolean;
  /** For an owned component: its type (redis, postgresql, rabbitmq, ...). */
  componentType?: string;
  /** Allowed ports from the declaration, when it names any. */
  ports?: number[];
}

export interface AppAirspace {
  app: string;
  env: string;
  inbound: Counterpart[];
  outbound: Counterpart[];
  owned: Counterpart[];
  drift: { undeclared: number; silent: number };
}

export interface DeclaredComponentLite {
  type: string;
  name: string;
}

export interface NetworkPeer {
  namespace?: string;
  cidr?: string;
  ports?: number[];
}

export interface AirspaceValues {
  components: DeclaredComponentLite[];
  allowIngressFrom: NetworkPeer[];
  allowEgressTo: NetworkPeer[];
}

const EMPTY_STATS: EdgeStats = { rate: 0, errorRate: 0 };

/** The OpenTelemetry service name Hangar gives an app's environment. */
export function serviceNameOf(app: string, env: string): string {
  return `${app}-${env}`;
}

/** `<app>-<env>` back to the app, for the env in view; undefined for anything else. */
export function appOfService(service: string, env: string): string | undefined {
  const suffix = `-${env}`;
  return service.endsWith(suffix) && service.length > suffix.length ? service.slice(0, -suffix.length) : undefined;
}

/** `app-<name>-<env>` / `infra-<name>-<env>` back to the app, for the env in view. */
export function appOfNamespace(namespace: string, env: string): string | undefined {
  const m = /^(?:app|infra)-(.+)$/.exec(namespace);
  return m ? appOfService(m[1], env) : undefined;
}

function kindOf(connectionType: string, client: string): EdgeKind {
  if (client === 'user') return 'ingress';
  switch (connectionType) {
    case 'messaging_system':
      return 'messaging';
    case 'database':
      return 'database';
    case 'virtual_node':
      return 'peer';
    default:
      return 'rpc';
  }
}

const DATABASE_TYPES = new Set(['postgresql', 'mongodb', 'redis', 'mysql']);
/** What an owned component is to the app: a broker, a datastore, or another service (Dex). */
export function componentKind(type: string): EdgeKind {
  if (type === 'rabbitmq') return 'messaging';
  return DATABASE_TYPES.has(type) ? 'database' : 'peer';
}

// The Service names a component's operator gives it, which is what a client span names as its peer: CNPG's
// <cluster>-rw / -ro / -r, Bitnami Redis' <name>-master / -headless, the component's own name otherwise.
const COMPONENT_SERVICE_SUFFIXES = ['', '-rw', '-ro', '-r', '-master', '-replicas', '-headless'];

/** The owned component a service-graph server name points at, if any. */
export function componentFor(server: string, components: DeclaredComponentLite[]): DeclaredComponentLite | undefined {
  return components.find(c => COMPONENT_SERVICE_SUFFIXES.some(s => server === `${c.name}${s}`));
}

function asNumberList(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.map(x => Number(x)).filter(n => Number.isFinite(n));
  return out.length ? out : undefined;
}

function asPeers(v: unknown): NetworkPeer[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object')
    .map(p => ({
      namespace: typeof p.namespace === 'string' ? p.namespace : undefined,
      cidr: typeof p.cidr === 'string' ? p.cidr : undefined,
      ports: asNumberList(p.ports),
    }));
}

/** The parts of an environment's chart values Airspace reads. Tolerates anything: a values file is hand-edited. */
export function airspaceValuesOf(values: Record<string, unknown> | undefined): AirspaceValues {
  const np = (values?.networkPolicy ?? {}) as Record<string, unknown>;
  const components = Array.isArray(values?.components)
    ? (values!.components as unknown[])
        .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object')
        .filter(c => typeof c.name === 'string' && typeof c.type === 'string')
        .map(c => ({ type: c.type as string, name: c.name as string }))
    : [];
  return { components, allowIngressFrom: asPeers(np.allowIngressFrom), allowEgressTo: asPeers(np.allowEgressTo) };
}

function statsFor(
  key: string,
  rates: Map<string, number>,
  p95s: Map<string, number>,
  errors: Map<string, number>,
): EdgeStats {
  return { rate: rates.get(key) ?? 0, p95: p95s.get(key), errorRate: errors.get(key) ?? 0 };
}

export const edgeKey = (client: string, server: string) => `${client}→${server}`;

export interface ServiceGraph {
  samples: ServiceGraphSample[];
  /** edgeKey -> p95 seconds. */
  p95: Map<string, number>;
  /** edgeKey -> failed requests per second. */
  errors: Map<string, number>;
}

/**
 * One app environment's airspace: every counterpart it was seen talking to, declared, or owns, with the state of each.
 * `values` undefined means the values file has not loaded (or could not): nothing is declared or composed, and no edge
 * is called undeclared, because that would be a guess.
 */
export function buildAppAirspace(input: {
  app: string;
  env: string;
  graph: ServiceGraph;
  values?: AirspaceValues;
}): AppAirspace {
  const { app, env, graph } = input;
  const values = input.values;
  const self = serviceNameOf(app, env);
  const components = values?.components ?? [];
  const hasBroker = components.some(c => c.type === 'rabbitmq');
  const rates = new Map<string, number>();
  const types = new Map<string, string>();
  for (const s of graph.samples) {
    const k = edgeKey(s.client, s.server);
    rates.set(k, (rates.get(k) ?? 0) + s.rate);
    if (!types.has(k)) types.set(k, s.connectionType);
  }

  const inbound = new Map<string, Counterpart>();
  const outbound = new Map<string, Counterpart>();
  const owned = new Map<string, Counterpart>();

  for (const c of components) {
    owned.set(c.name, {
      id: `owned:${c.name}`,
      name: c.name,
      direction: 'owned',
      kind: componentKind(c.type),
      state: 'composed',
      declared: true,
      componentType: c.type,
    });
  }

  for (const [k, ct] of types) {
    const [client, server] = k.split('→');
    const stats = statsFor(k, rates, graph.p95, graph.errors);
    const kind = kindOf(ct, client);
    if (server === self && client !== self) {
      const peerApp = client === 'user' ? undefined : appOfService(client, env);
      const name = client === 'user' ? 'Ingress' : peerApp ?? client;
      inbound.set(name, {
        id: `in:${client}`,
        name,
        app: peerApp,
        direction: 'inbound',
        kind,
        state: 'undeclared',
        declared: false,
        observed: stats,
      });
    } else if (client === self && server !== self) {
      const component = componentFor(server, components);
      if (component) {
        const row = owned.get(component.name)!;
        owned.set(component.name, { ...row, observed: addStats(row.observed, stats) });
        continue;
      }
      const peerApp = appOfService(server, env);
      const name = peerApp ?? server;
      outbound.set(name, {
        id: `out:${server}`,
        name,
        app: peerApp,
        direction: 'outbound',
        kind,
        state: 'undeclared',
        declared: false,
        observed: stats,
      });
    }
  }

  if (values) {
    for (const peer of values.allowIngressFrom) {
      const peerApp = peer.namespace ? appOfNamespace(peer.namespace, env) : undefined;
      const name = peerApp ?? peer.namespace ?? peer.cidr ?? 'unknown peer';
      const row = inbound.get(name);
      inbound.set(name, {
        ...(row ?? { id: `in:decl:${name}`, name, app: peerApp, direction: 'inbound' as const, kind: 'rpc' as const }),
        state: 'ok',
        declared: true,
        ports: peer.ports,
        observed: row?.observed,
      });
    }
    for (const peer of values.allowEgressTo) {
      const peerApp = peer.namespace ? appOfNamespace(peer.namespace, env) : undefined;
      const name = peerApp ?? peer.namespace ?? peer.cidr ?? 'unknown peer';
      const row = outbound.get(name);
      outbound.set(name, {
        ...(row ?? { id: `out:decl:${name}`, name, app: peerApp, direction: 'outbound' as const, kind: 'rpc' as const }),
        state: 'ok',
        declared: true,
        ports: peer.ports,
        observed: row?.observed,
      });
    }
  }

  const finish = (rows: Map<string, Counterpart>): Counterpart[] =>
    [...rows.values()].map(r => ({ ...r, state: stateOf(r, values !== undefined, hasBroker) })).sort(byState);
  const inboundRows = finish(inbound);
  const outboundRows = finish(outbound);
  const ownedRows = [...owned.values()].sort((a, b) => a.name.localeCompare(b.name));
  const all = [...inboundRows, ...outboundRows];
  return {
    app,
    env,
    inbound: inboundRows,
    outbound: outboundRows,
    owned: ownedRows,
    drift: {
      undeclared: all.filter(r => r.state === 'undeclared').length,
      silent: all.filter(r => r.state === 'silent').length,
    },
  };
}

function addStats(a: EdgeStats | undefined, b: EdgeStats): EdgeStats {
  if (!a) return b;
  return { rate: a.rate + b.rate, errorRate: a.errorRate + b.errorRate, p95: Math.max(a.p95 ?? 0, b.p95 ?? 0) || undefined };
}

function stateOf(r: Counterpart, valuesKnown: boolean, hasBroker: boolean): EdgeState {
  if (r.direction === 'owned') return 'composed';
  if (r.kind === 'ingress') return 'ingress';
  const seen = Boolean(r.observed && r.observed.rate > 0);
  if (r.kind === 'messaging' && hasBroker) return 'broker';
  if (r.declared) return seen ? 'ok' : 'silent';
  // Without the values file nothing can be called undeclared: say ok-but-unknown as "seen" (ok).
  if (!valuesKnown) return 'ok';
  // Only an app-to-app call is a declaration gap: an external host or a component the values file does not list is
  // reported as seen, not as drift.
  return r.app ? 'undeclared' : 'ok';
}

const STATE_ORDER: Record<EdgeState, number> = { undeclared: 0, silent: 1, ok: 2, broker: 3, ingress: 4, composed: 5 };
function byState(a: Counterpart, b: Counterpart): number {
  return STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.name.localeCompare(b.name);
}

// ---- the fleet map ---------------------------------------------------------------------------------------------

export interface FleetNode {
  id: string;
  label: string;
  /** A Hangar app (in the env in view), a component/peer, or the ingress pseudo-node. */
  role: 'app' | 'peer' | 'ingress';
  app?: string;
  /** 0 ingress, 1 entry apps, 2+ apps called by apps, last column peers. */
  column: number;
}

export interface FleetEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  stats: EdgeStats;
}

export interface FleetGraph {
  nodes: FleetNode[];
  edges: FleetEdge[];
  columns: number;
}

/**
 * Every edge of one env on one cluster as a layered graph: ingress, then apps by call depth (an app called only from
 * the gateway is column 1, one called by such an app column 2, ...), then everything that is not an app.
 * `knownApps` are the catalog's Hangar apps: a service name `<app>-<env>` is an app only if `<app>` is one of them.
 */
export function buildFleetGraph(graph: ServiceGraph, env: string, knownApps: string[]): FleetGraph {
  const known = new Set(knownApps);
  const idOf = (service: string) => service;
  const appOf = (service: string) => {
    const a = appOfService(service, env);
    return a && known.has(a) ? a : undefined;
  };
  const inEnv = (service: string) => service === 'user' || Boolean(appOf(service));
  const rates = new Map<string, number>();
  const kinds = new Map<string, EdgeKind>();
  for (const s of graph.samples) {
    // An edge belongs to this env when either end is one of its apps.
    if (!appOf(s.client) && !appOf(s.server)) continue;
    if (!inEnv(s.client) && !appOf(s.server)) continue;
    const k = edgeKey(s.client, s.server);
    rates.set(k, (rates.get(k) ?? 0) + s.rate);
    kinds.set(k, kindOf(s.connectionType, s.client));
  }
  const edges: FleetEdge[] = [...rates.keys()].map(k => {
    const [from, to] = k.split('→');
    return { from: idOf(from), to: idOf(to), kind: kinds.get(k)!, stats: statsFor(k, rates, graph.p95, graph.errors) };
  });

  const ids = new Set<string>();
  edges.forEach(e => {
    ids.add(e.from);
    ids.add(e.to);
  });
  // Depth of each app: longest chain of app-to-app calls ending at it, from an app nobody (but the gateway) calls.
  const appIds = [...ids].filter(id => appOf(id));
  const depth = new Map<string, number>(appIds.map(id => [id, 1]));
  for (let pass = 0; pass < appIds.length; pass++) {
    let changed = false;
    for (const e of edges) {
      if (!appOf(e.from) || !appOf(e.to) || e.from === e.to) continue;
      const d = (depth.get(e.from) ?? 1) + 1;
      if (d > (depth.get(e.to) ?? 1) && d <= appIds.length) {
        depth.set(e.to, d);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const maxAppColumn = Math.max(1, ...depth.values());
  const nodes: FleetNode[] = [...ids]
    .map(id => {
      if (id === 'user') return { id, label: 'Ingress', role: 'ingress' as const, column: 0 };
      const a = appOf(id);
      if (a) return { id, label: a, role: 'app' as const, app: a, column: depth.get(id) ?? 1 };
      return { id, label: id, role: 'peer' as const, column: maxAppColumn + 1 };
    })
    .sort((a, b) => a.column - b.column || a.label.localeCompare(b.label));
  return { nodes, edges, columns: maxAppColumn + 2 };
}

// ---- drift across the fleet -------------------------------------------------------------------------------------

export interface DriftItem {
  /** The app whose declaration is missing or unused: the callee for an inbound gap. */
  app: string;
  peer: string;
  state: 'undeclared' | 'silent';
  direction: 'inbound' | 'outbound';
  rate: number;
}

/** Drift items of several apps' airspaces, worst first: undeclared before silent, busiest first. */
export function fleetDrift(airspaces: AppAirspace[]): DriftItem[] {
  const out: DriftItem[] = [];
  for (const a of airspaces) {
    for (const r of [...a.inbound, ...a.outbound]) {
      if (r.state !== 'undeclared' && r.state !== 'silent') continue;
      out.push({
        app: a.app,
        peer: r.name,
        state: r.state,
        direction: r.direction as 'inbound' | 'outbound',
        rate: r.observed?.rate ?? 0,
      });
    }
  }
  const rank = (d: DriftItem) => (d.state === 'undeclared' ? 0 : 1);
  return out.sort((x, y) => rank(x) - rank(y) || y.rate - x.rate);
}

/** Apps of the env in view that have traffic in the service graph, for loading only the values files that matter. */
export function appsInGraph(graph: ServiceGraph, env: string, knownApps: string[]): string[] {
  const known = new Set(knownApps);
  const out = new Set<string>();
  for (const s of graph.samples) {
    for (const svc of [s.client, s.server]) {
      const a = appOfService(svc, env);
      if (a && known.has(a)) out.add(a);
    }
  }
  return [...out].sort();
}

export function formatRate(rps: number | undefined): string {
  if (rps === undefined || rps <= 0) return '0/s';
  if (rps >= 100) return `${Math.round(rps)}/s`;
  if (rps >= 1) return `${rps.toFixed(1)}/s`;
  const perMin = rps * 60;
  return perMin >= 1 ? `${perMin.toFixed(perMin >= 10 ? 0 : 1)}/min` : '<1/min';
}

export function formatSeconds(s: number | undefined): string {
  if (s === undefined || !Number.isFinite(s)) return '—';
  if (s >= 1) return `${s.toFixed(2)} s`;
  return `${Math.round(s * 1000)} ms`;
}

export { EMPTY_STATS };
