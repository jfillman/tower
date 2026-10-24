import { apiSpecPredicateOf, diffSpecs, findApiSpec, operationForSpan, specOperations, API_SPEC_PREDICATE } from './apiSpec';
import { apiCompatCheck, apiCompatOf, gateIdOf, parseApiCompat } from './apiCompat';
import { pendingApiCompat, prRefOf, waitingReleases } from './apiCompatPending';
import type { Attestation } from '../types';
import type { ReleaseRecord } from '../fleet/releaseRecords';
import type { PrCheckRun, PullRequestSummary } from '../pullRequests/usePullRequests';

// flight-api's real openapi.yaml (commit 50b3557), as the attestation carries it (JSON): the baseline for the diffs.
const FLIGHT: Record<string, any> = {
  openapi: '3.1.0',
  info: { title: 'flight-api', version: '1.0.0' },
  paths: {
    '/api/flights': { get: { operationId: 'listFlights', summary: 'Every flight', responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/FlightView' } } } } } } } },
    '/api/flights/{flightNumber}': {
      parameters: [{ $ref: '#/components/parameters/FlightNumber' }],
      get: { summary: 'One flight', responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/FlightView' } } } }, '401': { description: 'no' } } },
    },
    '/api/flights/{flightNumber}/events': {
      parameters: [{ $ref: '#/components/parameters/FlightNumber' }],
      get: { summary: 'Events', parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }], responses: { '200': { description: 'ok' } } },
    },
    '/api/flights/{flightNumber}/gate': {
      parameters: [{ $ref: '#/components/parameters/FlightNumber' }],
      put: {
        summary: 'Move gate',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['gate'], properties: { gate: { type: 'string' } } } } } },
        responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/FlightView' } } } } },
      },
    },
    '/api/flights/{flightNumber}/delay': { parameters: [{ $ref: '#/components/parameters/FlightNumber' }], put: { summary: 'Delay', responses: { '200': { description: 'ok' } } } },
    '/api/whoami': { get: { summary: 'Who', responses: { '200': { description: 'ok' } } } },
  },
  components: {
    parameters: { FlightNumber: { name: 'flightNumber', in: 'path', required: true, schema: { type: 'string' } } },
    schemas: {
      FlightView: {
        type: 'object',
        properties: { flight: { type: 'string' }, gate: { type: 'string' }, delayMinutes: { type: 'integer' }, seats: { type: 'array', items: { type: 'object', properties: { row: { type: 'integer' }, gate: { type: 'string' } } } } },
      },
    },
  },
};
const clone = () => JSON.parse(JSON.stringify(FLIGHT));

const att = (over: Partial<Attestation>): Attestation => ({
  predicateType: API_SPEC_PREDICATE,
  predicate: { apiType: 'openapi', path: 'openapi.yaml', sha256: 'abc', specVersion: '3.1.0', title: 'flight-api', version: '1.0.0', spec: FLIGHT },
  verified: true,
  verificationCode: 'verified',
  ...over,
});

describe('api-spec attestations', () => {
  it('reads the predicate and ignores other attestation types', () => {
    expect(apiSpecPredicateOf(att({}))?.title).toBe('flight-api');
    expect(apiSpecPredicateOf(att({ predicateType: 'https://slsa.dev/provenance/v0.2' }))).toBeUndefined();
    expect(apiSpecPredicateOf(att({ predicate: { title: 'x' } }))).toBeUndefined();
  });

  it('prefers a verified spec, and never calls an unverified one verified', () => {
    const unverified = att({ verified: false, verificationCode: 'no-log-entry', predicate: { ...att({}).predicate!, sha256: 'old' } });
    expect(findApiSpec({ digest: 'd', attestations: [unverified, att({})] })?.predicate.sha256).toBe('abc');
    const only = findApiSpec({ digest: 'd', attestations: [unverified] });
    expect(only?.verdict).toBe('unverified');
    expect(findApiSpec({ digest: 'd', attestations: [] })).toBeUndefined();
  });

  it('lists flight-api operations', () => {
    const ops = specOperations(FLIGHT);
    expect(ops).toHaveLength(6);
    expect(ops.map(o => o.key)).toContain('PUT /api/flights/{flightNumber}/gate');
  });
});

describe('diffSpecs', () => {
  it('finds nothing between a spec and itself', () => {
    const d = diffSpecs(FLIGHT, clone());
    expect(d.operations).toHaveLength(0);
    expect(d.unchangedCount).toBe(6);
  });

  it('a removed operation is breaking, an added one is not', () => {
    const b = clone();
    delete b.paths['/api/whoami'];
    b.paths['/api/flights/{flightNumber}/delays'] = { get: { responses: { '200': { description: 'ok' } } } };
    const d = diffSpecs(FLIGHT, b);
    expect(d.operations.find(o => o.key === 'GET /api/whoami')).toMatchObject({ kind: 'removed', breaking: true });
    expect(d.operations.find(o => o.key === 'GET /api/flights/{flightNumber}/delays')).toMatchObject({ kind: 'added', breaking: false });
    expect(d.breakingCount).toBe(1);
    expect(d.operations[0].breaking).toBe(true);
  });

  it('a response field removed through a $ref, even inside an array, is breaking; one added is not', () => {
    const b = clone();
    delete b.components.schemas.FlightView.properties.seats.items.properties.gate;
    b.components.schemas.FlightView.properties.boardingZone = { type: 'string' };
    const d = diffSpecs(FLIGHT, b);
    const one = d.operations.find(o => o.key === 'GET /api/flights/{flightNumber}')!;
    expect(one.breaking).toBe(true);
    expect(one.changes.map(c => c.text)).toEqual(
      expect.arrayContaining(['response field seats[].gate removed', 'response field boardingZone added']),
    );
    expect(d.operations.find(o => o.key === 'GET /api/flights')!.changes.map(c => c.text)).toContain('response field [].seats[].gate removed');
  });

  it('request rules: a new required field or parameter breaks, an optional one does not', () => {
    const b = clone();
    const gate = b.paths['/api/flights/{flightNumber}/gate'].put;
    gate.requestBody.content['application/json'].schema.properties.reason = { type: 'string' };
    gate.requestBody.content['application/json'].schema.required.push('reason');
    b.paths['/api/flights/{flightNumber}/events'].get.parameters[0].required = true;
    b.paths['/api/flights'].get.parameters = [{ name: 'date', in: 'query', schema: { type: 'string' } }];
    const d = diffSpecs(FLIGHT, b);
    expect(d.operations.find(o => o.key === 'PUT /api/flights/{flightNumber}/gate')!.changes).toContainEqual({ text: 'request field reason added, required', breaking: true });
    expect(d.operations.find(o => o.key === 'GET /api/flights/{flightNumber}/events')!.changes).toContainEqual({ text: 'query parameter limit now required', breaking: true });
    expect(d.operations.find(o => o.key === 'GET /api/flights')!).toMatchObject({ breaking: false, changes: [{ text: 'query parameter date added', breaking: false }] });
  });

  it('a retyped field and a removed success response break; a removed error response does not', () => {
    const b = clone();
    b.components.schemas.FlightView.properties.delayMinutes = { type: 'string' };
    delete b.paths['/api/flights/{flightNumber}'].get.responses['401'];
    delete b.paths['/api/whoami'].get.responses['200'];
    b.paths['/api/whoami'].get.responses['204'] = { description: 'none' };
    const d = diffSpecs(FLIGHT, b);
    const one = d.operations.find(o => o.key === 'GET /api/flights/{flightNumber}')!;
    expect(one.changes).toEqual(expect.arrayContaining([
      { text: 'response delayMinutes: type integer → string', breaking: true },
      { text: 'response 401 removed', breaking: false },
    ]));
    expect(d.operations.find(o => o.key === 'GET /api/whoami')!.changes).toEqual(expect.arrayContaining([
      { text: 'response 200 removed', breaking: true },
      { text: 'response 204 added', breaking: false },
    ]));
  });

  it('survives a $ref cycle', () => {
    const a = clone();
    a.components.schemas.Node = { type: 'object', properties: { next: { $ref: '#/components/schemas/Node' } } };
    a.paths['/api/whoami'].get.responses['200'].content = { 'application/json': { schema: { $ref: '#/components/schemas/Node' } } };
    expect(() => diffSpecs(a, JSON.parse(JSON.stringify(a)))).not.toThrow();
  });
});

describe('operationForSpan', () => {
  const ops = specOperations(FLIGHT);
  it('matches a route span to its operation whatever the parameter names', () => {
    expect(operationForSpan('GET /api/flights/{flightNumber}', ops)?.key).toBe('GET /api/flights/{flightNumber}');
    expect(operationForSpan('PUT /api/flights/{id}/gate', ops)?.key).toBe('PUT /api/flights/{flightNumber}/gate');
    expect(operationForSpan('GET /api/flights/:id/events', ops)?.key).toBe('GET /api/flights/{flightNumber}/events');
  });
  it('a bare method or a catch-all matches nothing', () => {
    expect(operationForSpan('GET', ops)).toBeUndefined();
    expect(operationForSpan('GET /**', ops)).toBeUndefined();
  });
});

describe('api-compat report', () => {
  const report = {
    version: 1,
    verdict: 'warn',
    env: 'prod',
    candidate: { image: 'ghcr.io/o/flight-api:2.0.2', digest: 'sha256:new', specSha256: 'n', title: 'flight-api', version: '1.1.0' },
    baseline: { image: 'ghcr.io/o/flight-api:2.0.1', digest: 'sha256:old', specSha256: 'o', title: 'flight-api', version: '1.0.0' },
    breaking: [
      { id: 'response-property-removed', level: 'error', text: 'removed seats/items/gate', operation: { method: 'get', path: '/api/flights/{flightNumber}' }, inUse: true, rate: 0.37 },
      { id: 'api-path-removed', level: 'error', text: 'removed /api/whoami', operation: { method: 'GET', path: '/api/whoami' }, inUse: null, rate: null },
    ],
    nonBreakingCount: 2,
    usage: { source: 'prometheus', window: '7d', callers: ['boarding-api'] },
    override: null,
  };
  const comment = (json: unknown) => `<!-- glidepath:gate:api-compat -->\n**api-compat** found 2 breaking changes\n\n<!-- glidepath:api-compat ${JSON.stringify(json)} -->\n`;

  it('parses the hidden block', () => {
    const r = parseApiCompat(comment(report))!;
    expect(r.verdict).toBe('warn');
    expect(r.breaking[0]).toMatchObject({ inUse: true, rate: 0.37, operation: { method: 'GET', path: '/api/flights/{flightNumber}' } });
    expect(r.breaking[1].inUse).toBeNull();
    expect(r.usage).toEqual({ source: 'prometheus', window: '7d', callers: ['boarding-api'] });
  });

  it('tolerates a missing, malformed or foreign block', () => {
    expect(parseApiCompat(undefined)).toBeUndefined();
    expect(parseApiCompat('just a comment')).toBeUndefined();
    expect(parseApiCompat('<!-- glidepath:api-compat {not json} -->')).toBeUndefined();
    expect(parseApiCompat(comment({ ...report, version: 2 }))).toBeUndefined();
    expect(parseApiCompat(comment({ ...report, verdict: 'maybe' }))).toBeUndefined();
  });

  it('reads an override and fills defaults for missing fields', () => {
    const r = parseApiCompat(comment({ version: 1, verdict: 'overridden', override: { by: 'jfillman', reason: 'clients updated' } }))!;
    expect(r).toMatchObject({ env: '', breaking: [], nonBreakingCount: 0, baseline: null, override: { by: 'jfillman', reason: 'clients updated' } });
    expect(r.usage.source).toBe('unknown');
  });

  it('finds the gate among the release PR checks by gate id', () => {
    expect(gateIdOf('Pipelines as Code CI / api-compat-')).toBe('api-compat');
    const checks = [
      { name: 'Pipelines as Code CI / provenance-', status: 'completed' as const, conclusion: 'success' },
      { name: 'Pipelines as Code CI / api-compat-', status: 'completed' as const, conclusion: 'neutral', message: comment(report) },
    ];
    expect(apiCompatCheck(checks)?.conclusion).toBe('neutral');
    expect(apiCompatOf(checks)?.report?.verdict).toBe('warn');
    expect(apiCompatOf([checks[0]])).toBeUndefined();
  });
});

describe('pending api-compat verdicts', () => {
  const rec = (o: Partial<ReleaseRecord>): ReleaseRecord => ({ name: 'r', namespace: 'app-flight-api-cicd', appName: 'flight-api', env: 'prod', cluster: 'hangar-prod', state: 'proposed', ...o });
  const msg = `<!-- glidepath:gate:api-compat -->\nx\n<!-- glidepath:api-compat {"version":1,"verdict":"warn","env":"prod","breaking":[]} -->`;

  it('parses a PR url', () => {
    expect(prRefOf('https://github.com/jfillman/gitops-flight-api/pull/12')).toEqual({ owner: 'jfillman', repo: 'gitops-flight-api', number: 12 });
    expect(prRefOf(undefined)).toBeUndefined();
  });

  it('keeps proposed releases with a PR, once each', () => {
    const url = 'https://github.com/o/gitops-flight-api/pull/12';
    const w = waitingReleases([rec({ prUrl: url }), rec({ prUrl: url, name: 'r2' }), rec({ state: 'healthy', prUrl: url.replace('12', '11') }), rec({})]);
    expect(w).toHaveLength(1);
    expect(w[0].pr.number).toBe(12);
  });

  it('joins a waiting release with its open PR and that PR’s api-compat check', () => {
    const w = waitingReleases([rec({ prUrl: 'https://github.com/o/gitops-flight-api/pull/12' })]);
    const pr = (checks: PrCheckRun[], state: 'open' | 'merged' = 'open') =>
      [{ repo: 'gitops', number: 12, state, ci: { state: 'success', totalChecks: checks.length, passedChecks: 0, checks } }] as unknown as PullRequestSummary[];
    const check: PrCheckRun = { name: 'Pipelines as Code CI / api-compat-', status: 'completed', conclusion: 'neutral', message: msg };
    expect(pendingApiCompat(w, new Map([['flight-api', pr([check])]]))).toEqual([
      expect.objectContaining({ app: 'flight-api', env: 'prod', prNumber: 12, conclusion: 'neutral', report: expect.objectContaining({ verdict: 'warn' }) }),
    ]);
    expect(pendingApiCompat(w, new Map([['flight-api', pr([])]]))).toEqual([]);
    expect(pendingApiCompat(w, new Map([['flight-api', pr([check], 'merged')]]))).toEqual([]);
    expect(pendingApiCompat(w, new Map())).toEqual([]);
  });
});
