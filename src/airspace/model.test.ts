import {
  airspaceValuesOf,
  appOfNamespace,
  appOfService,
  appsInGraph,
  buildAppAirspace,
  buildFleetGraph,
  componentFor,
  fleetDrift,
  formatRate,
  formatSeconds,
  type ServiceGraph,
} from './model';
import { toServiceGraph, serviceGraphQueries } from './queries';
import { byKindThenTitle, contractOf, openApiOperations, refName, titleOf } from './contracts';
import { componentKind } from './model';

// The service graph hangar-dev's Prometheus held on 2026-10-23 (sum by client, server, connection_type of
// rate(traces_service_graph_request_total[15m])), with p95 for two edges and one failing edge added.
const RATE = [
  { metric: { client: 'flight-api-dev', server: 'postgresql-rw', connection_type: 'database' }, value: 0.293 },
  { metric: { client: 'flight-api-dev', server: 'boarding-api-dev', connection_type: 'messaging_system' }, value: 0.033 },
  { metric: { client: 'user', server: 'gate-api-dev', connection_type: 'virtual_node' }, value: 0.233 },
  { metric: { client: 'user', server: 'boarding-api-dev', connection_type: 'virtual_node' }, value: 0.233 },
  { metric: { client: 'user', server: 'flight-api-dev', connection_type: 'virtual_node' }, value: 0.183 },
  { metric: { client: 'boarding-api-dev', server: 'redis', connection_type: 'virtual_node' }, value: 0.033 },
];
const P95 = [
  { metric: { client: 'flight-api-dev', server: 'postgresql-rw' }, value: 0.004 },
  { metric: { client: 'user', server: 'flight-api-dev' }, value: NaN },
];
const ERRORS = [{ metric: { client: 'user', server: 'gate-api-dev' }, value: 0.01 }];
const GRAPH: ServiceGraph = toServiceGraph(RATE, P95, ERRORS);

// gitops values as boarding-api and flight-api's glidepath/envs/dev.yaml had them on 2026-10-23.
const FLIGHT_VALUES = airspaceValuesOf({
  networkPolicy: { allowIngressFrom: [{ namespace: 'app-boarding-api-dev', ports: [8080] }] },
  components: [
    { type: 'postgresql', name: 'postgresql' },
    { type: 'rabbitmq', name: 'rabbitmq', spec: { mode: 'attach' } },
  ],
});
const BOARDING_VALUES = airspaceValuesOf({
  components: [
    { type: 'redis', name: 'redis' },
    { type: 'rabbitmq', name: 'rabbitmq' },
  ],
});

describe('names', () => {
  it('maps service and namespace names back to apps for the env in view', () => {
    expect(appOfService('flight-api-dev', 'dev')).toBe('flight-api');
    expect(appOfService('flight-api-prod', 'dev')).toBeUndefined();
    expect(appOfService('-dev', 'dev')).toBeUndefined();
    expect(appOfNamespace('app-boarding-api-dev', 'dev')).toBe('boarding-api');
    expect(appOfNamespace('infra-skyport-broker-dev', 'dev')).toBe('skyport-broker');
    expect(appOfNamespace('observability', 'dev')).toBeUndefined();
  });

  it('matches operator service names to the component that owns them', () => {
    const comps = [{ type: 'postgresql', name: 'postgresql' }, { type: 'redis', name: 'cache' }];
    expect(componentFor('postgresql-rw', comps)?.name).toBe('postgresql');
    expect(componentFor('cache-master', comps)?.name).toBe('cache');
    expect(componentFor('redis', comps)).toBeUndefined();
  });
});

describe('values', () => {
  it('reads components and peers and tolerates junk', () => {
    expect(FLIGHT_VALUES.components.map(c => c.name)).toEqual(['postgresql', 'rabbitmq']);
    expect(FLIGHT_VALUES.allowIngressFrom).toEqual([{ namespace: 'app-boarding-api-dev', cidr: undefined, ports: [8080] }]);
    expect(airspaceValuesOf({ components: ['x', { name: 1 }], networkPolicy: { allowIngressFrom: 'no' } })).toEqual({
      components: [],
      allowIngressFrom: [],
      allowEgressTo: [],
    });
    expect(airspaceValuesOf(undefined).components).toEqual([]);
  });
});

describe('buildAppAirspace', () => {
  it('flight-api: owned components carry their observed traffic, a declared caller with no traffic is silent', () => {
    const a = buildAppAirspace({ app: 'flight-api', env: 'dev', graph: GRAPH, values: FLIGHT_VALUES });
    expect(a.owned.map(o => [o.name, o.state, o.observed?.rate])).toEqual([
      ['postgresql', 'composed', 0.293],
      ['rabbitmq', 'composed', undefined],
    ]);
    expect(a.owned[0].observed?.p95).toBe(0.004);
    // boarding-api is declared in allowIngressFrom but never called flight-api in the window.
    expect(a.inbound.map(r => [r.name, r.state])).toEqual([
      ['boarding-api', 'silent'],
      ['Ingress', 'ingress'],
    ]);
    expect(a.inbound[0].ports).toEqual([8080]);
    // flight-api publishes to boarding-api through the broker it attaches to: no NetworkPolicy declaration applies.
    expect(a.outbound.map(r => [r.name, r.kind, r.state])).toEqual([['boarding-api', 'messaging', 'broker']]);
    expect(a.drift).toEqual({ undeclared: 0, silent: 1 });
  });

  it('boarding-api: an unmatched peer name stays an outbound peer, not drift', () => {
    const a = buildAppAirspace({ app: 'boarding-api', env: 'dev', graph: GRAPH, values: BOARDING_VALUES });
    // The redis component's service is `redis-master`; the client span names the peer `redis` - matched by name.
    expect(a.owned.find(o => o.name === 'redis')?.observed?.rate).toBe(0.033);
    expect(a.inbound.map(r => [r.name, r.kind, r.state])).toEqual([
      ['flight-api', 'messaging', 'broker'],
      ['Ingress', 'ingress', 'ingress'],
    ]);
  });

  it('an app-to-app RPC with no declaration is undeclared; without values nothing is called drift', () => {
    const g = toServiceGraph(
      [{ metric: { client: 'checkin-api-dev', server: 'flight-api-dev', connection_type: '' }, value: 2 }],
      [],
      [],
    );
    const known = buildAppAirspace({ app: 'flight-api', env: 'dev', graph: g, values: FLIGHT_VALUES });
    expect(known.inbound.find(r => r.name === 'checkin-api')?.state).toBe('undeclared');
    expect(known.drift.undeclared).toBe(1);
    const unknown = buildAppAirspace({ app: 'flight-api', env: 'dev', graph: g });
    expect(unknown.inbound[0].state).toBe('ok');
    expect(unknown.drift).toEqual({ undeclared: 0, silent: 0 });
    expect(unknown.owned).toEqual([]);
  });

  it('carries errors for an edge', () => {
    const a = buildAppAirspace({ app: 'gate-api', env: 'dev', graph: GRAPH, values: airspaceValuesOf({}) });
    expect(a.inbound[0].observed).toEqual({ rate: 0.233, p95: undefined, errorRate: 0.01 });
  });
});

describe('buildFleetGraph', () => {
  it('lays apps out by call depth between ingress and peers', () => {
    const f = buildFleetGraph(GRAPH, 'dev', ['flight-api', 'boarding-api', 'gate-api']);
    const col = Object.fromEntries(f.nodes.map(n => [n.id, n.column]));
    expect(col).toEqual({
      user: 0,
      'flight-api-dev': 1,
      'gate-api-dev': 1,
      'boarding-api-dev': 2,
      'postgresql-rw': 3,
      redis: 3,
    });
    expect(f.columns).toBe(4);
    expect(f.edges).toHaveLength(6);
  });

  it('ignores another env and services that are not catalog apps', () => {
    const g = toServiceGraph(
      [
        { metric: { client: 'user', server: 'flight-api-prod', connection_type: '' }, value: 1 },
        { metric: { client: 'user', server: 'glidepath', connection_type: '' }, value: 1 },
      ],
      [],
      [],
    );
    expect(buildFleetGraph(g, 'dev', ['flight-api']).nodes).toEqual([]);
    expect(appsInGraph(GRAPH, 'dev', ['flight-api', 'gate-api'])).toEqual(['flight-api', 'gate-api']);
  });
});

describe('fleetDrift', () => {
  it('lists undeclared first, busiest first', () => {
    const g = toServiceGraph(
      [
        { metric: { client: 'checkin-api-dev', server: 'flight-api-dev', connection_type: '' }, value: 2 },
        { metric: { client: 'gate-api-dev', server: 'flight-api-dev', connection_type: '' }, value: 5 },
      ],
      [],
      [],
    );
    const flight = buildAppAirspace({ app: 'flight-api', env: 'dev', graph: g, values: FLIGHT_VALUES });
    expect(fleetDrift([flight]).map(d => [d.peer, d.state])).toEqual([
      ['gate-api', 'undeclared'],
      ['checkin-api', 'undeclared'],
      ['boarding-api', 'silent'],
    ]);
  });
});

describe('format', () => {
  it('rates and durations', () => {
    expect(formatRate(0)).toBe('0/s');
    expect(formatRate(0.033)).toBe('2.0/min');
    expect(formatRate(0.001)).toBe('<1/min');
    expect(formatRate(2.5)).toBe('2.5/s');
    expect(formatRate(310)).toBe('310/s');
    expect(formatSeconds(0.004)).toBe('4 ms');
    expect(formatSeconds(1.234)).toBe('1.23 s');
    expect(formatSeconds(undefined)).toBe('—');
  });

  it('builds windowed queries', () => {
    expect(serviceGraphQueries('1h').rate).toContain('[1h]');
  });
});

describe('contracts', () => {
  const OPENAPI = `openapi: 3.1.0
info: {title: flight-api, version: '3'}
paths:
  /flights/{id}:
    get: {summary: One flight}
    patch: {operationId: updateFlight, deprecated: true}
  /flights:
    get: {}
`;
  it('reads OpenAPI operations in document order', () => {
    expect(openApiOperations(OPENAPI)).toEqual([
      { method: 'GET', path: '/flights/{id}', summary: 'One flight', deprecated: false },
      { method: 'PATCH', path: '/flights/{id}', summary: 'updateFlight', deprecated: true },
      { method: 'GET', path: '/flights', summary: '', deprecated: false },
    ]);
    expect(() => openApiOperations('asyncapi: 3.0.0')).toThrow('not an OpenAPI');
  });

  it('turns an API entity into a contract with its relations', () => {
    const c = contractOf({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'API',
      metadata: { name: 'flight-api', title: 'Flight API' },
      spec: { type: 'openapi', lifecycle: 'production', owner: 'team-flight', definition: OPENAPI },
      relations: [
        { type: 'apiProvidedBy', targetRef: 'component:default/flight-api' },
        { type: 'apiConsumedBy', targetRef: 'component:default/checkin-api' },
      ],
    });
    expect(c.ref).toBe('api:default/flight-api');
    expect(c.providers.map(refName)).toEqual(['flight-api']);
    expect(c.consumers.map(refName)).toEqual(['checkin-api']);
    expect(c.operations).toHaveLength(3);
    const bad = contractOf({ apiVersion: 'v', kind: 'API', metadata: { name: 'x' }, spec: { type: 'openapi', definition: 'a: [' } });
    expect(bad.parseError).toBeTruthy();
    expect(bad.operations).toEqual([]);
  });

  it('names XRD-derived APIs by kind, app APIs first', () => {
    expect(titleOf('applicationenvironment-catalog.hangar.io--v1alpha1', undefined, 'crd')).toEqual({
      title: 'applicationenvironment',
      subtitle: 'catalog.hangar.io/v1alpha1',
    });
    expect(titleOf('flight-api', 'Flight API', 'openapi')).toEqual({ title: 'Flight API' });
    expect(titleOf('example-grpc-api', undefined, 'grpc')).toEqual({ title: 'example-grpc-api' });
    const mk = (title: string, type: string) => ({ ...contractOf({ apiVersion: 'v', kind: 'API', metadata: { name: title }, spec: { type } }) });
    expect([mk('a-xrd', 'crd'), mk('zeta', 'grpc')].sort(byKindThenTitle).map(c => c.name)).toEqual(['zeta', 'a-xrd']);
  });

  it('classifies owned components', () => {
    expect(componentKind('rabbitmq')).toBe('messaging');
    expect(componentKind('postgresql')).toBe('database');
    expect(componentKind('dex')).toBe('peer');
  });
});
