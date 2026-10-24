import type { Attestation, ProvenanceResponse } from '../types';
import { verdictOf, type Verdict } from '../supplyChain';

// The spec an image was built with (Airspace phase 2). Glidepath's build signs the app's cicd.yaml api.spec onto the
// image it pushes (glidepath attest-api-spec.yaml): an in-toto attestation of predicate type API_SPEC_PREDICATE whose
// predicate carries the whole spec as JSON. Tower reads it through the same provenance route as the SLSA provenance and
// the SBOM, so it is verified the same way (supplyChain.ts verdictOf): a spec is only "verified" when its signature is.
//
// The diff below is Tower's own, for reading: a small rule set over operations, parameters, request bodies and success
// responses. The release check's oasdiff result (apiCompat.ts) is the authoritative one; where both exist, show that.

export const API_SPEC_PREDICATE = 'https://hangar.io/attestations/api-spec/v1';

type Json = Record<string, unknown>;

export interface ApiSpecPredicate {
  apiType: string;
  path: string;
  sha256: string;
  specVersion: string;
  title: string;
  version: string;
  spec: Json;
}

export interface DeployedSpec {
  predicate: ApiSpecPredicate;
  verdict: Verdict;
  attestation: Attestation;
}

const isObj = (v: unknown): v is Json => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => {
  if (typeof v === 'string') return v;
  return v === undefined || v === null ? '' : String(v);
};

/** The predicate, or undefined when the attestation is not a well-formed api-spec one. */
export function apiSpecPredicateOf(a: Attestation): ApiSpecPredicate | undefined {
  if (a.predicateType !== API_SPEC_PREDICATE || !isObj(a.predicate) || !isObj(a.predicate.spec)) return undefined;
  const p = a.predicate;
  return {
    apiType: str(p.apiType) || 'openapi',
    path: str(p.path),
    sha256: str(p.sha256),
    specVersion: str(p.specVersion),
    title: str(p.title),
    version: str(p.version),
    spec: p.spec as Json,
  };
}

/**
 * The image's spec. Several can sit on one digest (a rebuild of the same image with an edited file): prefer a verified
 * one, then any. Undefined when the image carries none.
 */
export function findApiSpec(p?: ProvenanceResponse): DeployedSpec | undefined {
  const found = (p?.attestations ?? [])
    .map(attestation => ({ attestation, predicate: apiSpecPredicateOf(attestation) }))
    .filter((x): x is { attestation: Attestation; predicate: ApiSpecPredicate } => Boolean(x.predicate))
    .map(x => ({ ...x, verdict: verdictOf(x.attestation) }));
  return found.find(x => x.verdict === 'verified') ?? found[0];
}

// ---- operations

export const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

export interface SpecOperation {
  key: string;
  method: string;
  path: string;
  summary: string;
  deprecated: boolean;
}

/** `GET /api/flights/{flightNumber}`: an operation's identity across two specs. */
export const opKey = (method: string, path: string) => `${method.toUpperCase()} ${path}`;

export function specOperations(spec: Json): SpecOperation[] {
  const paths = isObj(spec.paths) ? spec.paths : {};
  const out: SpecOperation[] = [];
  for (const [path, item] of Object.entries(paths)) {
    if (!isObj(item)) continue;
    for (const m of HTTP_METHODS) {
      const op = item[m];
      if (!isObj(op)) continue;
      out.push({
        key: opKey(m, path),
        method: m.toUpperCase(),
        path,
        summary: str(op.summary ?? op.operationId),
        deprecated: op.deprecated === true,
      });
    }
  }
  return out;
}

// ---- diff

export interface SpecChange {
  text: string;
  breaking: boolean;
}

export interface OperationDiff {
  key: string;
  method: string;
  path: string;
  kind: 'added' | 'removed' | 'changed';
  breaking: boolean;
  changes: SpecChange[];
}

export interface SpecDiff {
  operations: OperationDiff[];
  breakingCount: number;
  nonBreakingCount: number;
  unchangedCount: number;
}

/** Follows a local `#/...` $ref (cycles and other documents stop the walk: the node is returned as it is). */
function deref(spec: Json, node: unknown, seen: Set<string> = new Set()): unknown {
  if (!isObj(node) || typeof node.$ref !== 'string') return node;
  const ref = node.$ref;
  if (!ref.startsWith('#/') || seen.has(ref)) return node;
  seen.add(ref);
  let cur: unknown = spec;
  for (const part of ref.slice(2).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isObj(cur)) return node;
    cur = cur[key];
  }
  return cur === undefined ? node : deref(spec, cur, seen);
}

interface Param {
  name: string;
  in: string;
  required: boolean;
  type: string;
}

function paramsOf(spec: Json, item: Json, op: Json): Map<string, Param> {
  const out = new Map<string, Param>();
  for (const list of [item.parameters, op.parameters]) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const p = deref(spec, raw);
      if (!isObj(p) || typeof p.name !== 'string') continue;
      const schema = deref(spec, p.schema);
      // Operation-level parameters override path-level ones with the same name and location (OpenAPI 3).
      out.set(`${str(p.in)}:${p.name}`, {
        name: p.name,
        in: str(p.in),
        required: p.required === true || p.in === 'path',
        type: typeOf(spec, schema),
      });
    }
  }
  return out;
}

function typeOf(spec: Json, schema: unknown): string {
  const s = deref(spec, schema);
  if (!isObj(s)) return '';
  if (Array.isArray(s.type)) return s.type.map(str).sort().join('|');
  if (s.type) return str(s.type);
  if (s.properties) return 'object';
  if (s.items) return 'array';
  return '';
}

/** A schema's JSON media type content (application/json, else the first). */
function jsonSchemaOf(spec: Json, holder: unknown): unknown {
  const h = deref(spec, holder);
  if (!isObj(h) || !isObj(h.content)) return undefined;
  const content = h.content;
  const media = content['application/json'] ?? Object.values(content)[0];
  return isObj(media) ? deref(spec, media.schema) : undefined;
}

type Side = 'request' | 'response';

/**
 * Compares two schemas field by field (to depth 4, arrays as `field[]`). Breaking means it can break a client that
 * worked against the old spec: a response field removed or retyped, a request field newly required or retyped.
 */
function schemaChanges(spec: { a: Json; b: Json }, a: unknown, b: unknown, side: Side, at: string, depth: number): SpecChange[] {
  const sa = deref(spec.a, a);
  const sb = deref(spec.b, b);
  if (!isObj(sa) || !isObj(sb) || depth > 4) return [];
  const out: SpecChange[] = [];
  const ta = typeOf(spec.a, sa);
  const tb = typeOf(spec.b, sb);
  if (ta && tb && ta !== tb) {
    out.push({ text: `${side} ${at || 'body'}: type ${ta} → ${tb}`, breaking: true });
    return out;
  }
  if (ta === 'array' || (sa.items && sb.items)) {
    return schemaChanges(spec, sa.items, sb.items, side, `${at}[]`, depth + 1);
  }
  const pa = isObj(sa.properties) ? sa.properties : {};
  const pb = isObj(sb.properties) ? sb.properties : {};
  const reqA = new Set(Array.isArray(sa.required) ? sa.required.map(str) : []);
  const reqB = new Set(Array.isArray(sb.required) ? sb.required.map(str) : []);
  const name = (k: string) => (at ? `${at}.${k}` : k);
  for (const k of Object.keys(pa)) {
    if (!(k in pb)) {
      out.push(
        side === 'response'
          ? { text: `response field ${name(k)} removed`, breaking: true }
          : { text: `request field ${name(k)} removed`, breaking: false },
      );
    }
  }
  for (const k of Object.keys(pb)) {
    if (!(k in pa)) {
      const required = reqB.has(k);
      out.push(
        side === 'request' && required
          ? { text: `request field ${name(k)} added, required`, breaking: true }
          : { text: `${side} field ${name(k)} added`, breaking: false },
      );
    }
  }
  for (const k of Object.keys(pa)) {
    if (!(k in pb)) continue;
    if (side === 'request' && !reqA.has(k) && reqB.has(k)) out.push({ text: `request field ${name(k)} now required`, breaking: true });
    if (side === 'request' && reqA.has(k) && !reqB.has(k)) out.push({ text: `request field ${name(k)} now optional`, breaking: false });
    out.push(...schemaChanges(spec, pa[k], pb[k], side, name(k), depth + 1));
  }
  return out;
}

const isSuccess = (code: string) => /^2\d\d$|^2XX$/i.test(code);

function operationChanges(spec: { a: Json; b: Json }, ia: Json, oa: Json, ib: Json, ob: Json): SpecChange[] {
  const out: SpecChange[] = [];
  const pa = paramsOf(spec.a, ia, oa);
  const pb = paramsOf(spec.b, ib, ob);
  for (const [k, p] of pa) {
    const q = pb.get(k);
    if (!q) {
      out.push({ text: `${p.in} parameter ${p.name} removed`, breaking: true });
      continue;
    }
    if (!p.required && q.required) out.push({ text: `${p.in} parameter ${p.name} now required`, breaking: true });
    if (p.required && !q.required) out.push({ text: `${p.in} parameter ${p.name} now optional`, breaking: false });
    if (p.type && q.type && p.type !== q.type) out.push({ text: `${p.in} parameter ${p.name}: type ${p.type} → ${q.type}`, breaking: true });
  }
  for (const [k, q] of pb) {
    if (!pa.has(k)) {
      out.push(
        q.required
          ? { text: `${q.in} parameter ${q.name} added, required`, breaking: true }
          : { text: `${q.in} parameter ${q.name} added`, breaking: false },
      );
    }
  }

  const ba = deref(spec.a, oa.requestBody);
  const bb = deref(spec.b, ob.requestBody);
  if (!isObj(ba) && isObj(bb) && bb.required === true) out.push({ text: 'request body added, required', breaking: true });
  else if (isObj(ba) && isObj(bb)) {
    if (ba.required !== true && bb.required === true) out.push({ text: 'request body now required', breaking: true });
    out.push(...schemaChanges(spec, jsonSchemaOf(spec.a, ba), jsonSchemaOf(spec.b, bb), 'request', '', 0));
  }

  const ra = isObj(oa.responses) ? oa.responses : {};
  const rb = isObj(ob.responses) ? ob.responses : {};
  for (const code of Object.keys(ra)) {
    if (!(code in rb)) out.push({ text: `response ${code} removed`, breaking: isSuccess(code) });
  }
  for (const code of Object.keys(rb)) {
    if (!(code in ra)) out.push({ text: `response ${code} added`, breaking: false });
  }
  for (const code of Object.keys(ra)) {
    if (!(code in rb) || !isSuccess(code)) continue;
    out.push(...schemaChanges(spec, jsonSchemaOf(spec.a, ra[code]), jsonSchemaOf(spec.b, rb[code]), 'response', '', 0));
  }
  if (oa.deprecated !== true && ob.deprecated === true) out.push({ text: 'marked deprecated', breaking: false });
  return out;
}

/** What changed from `a` (the running spec) to `b` (the newer one), per operation. */
export function diffSpecs(a: Json, b: Json): SpecDiff {
  const spec = { a, b };
  const pathsA = isObj(a.paths) ? a.paths : {};
  const pathsB = isObj(b.paths) ? b.paths : {};
  const opsA = new Map(specOperations(a).map(o => [o.key, o]));
  const opsB = new Map(specOperations(b).map(o => [o.key, o]));
  const operations: OperationDiff[] = [];
  let unchangedCount = 0;
  for (const [key, o] of opsA) {
    if (!opsB.has(key)) {
      operations.push({ key, method: o.method, path: o.path, kind: 'removed', breaking: true, changes: [{ text: 'operation removed', breaking: true }] });
      continue;
    }
    const ia = pathsA[o.path] as Json;
    const ib = pathsB[o.path] as Json;
    const m = o.method.toLowerCase();
    const changes = operationChanges(spec, ia, ia[m] as Json, ib, ib[m] as Json);
    if (changes.length === 0) {
      unchangedCount++;
      continue;
    }
    operations.push({ key, method: o.method, path: o.path, kind: 'changed', breaking: changes.some(c => c.breaking), changes });
  }
  for (const [key, o] of opsB) {
    if (!opsA.has(key)) operations.push({ key, method: o.method, path: o.path, kind: 'added', breaking: false, changes: [{ text: 'operation added', breaking: false }] });
  }
  const rank = (d: OperationDiff) => (d.breaking ? 0 : 1);
  operations.sort((x, y) => rank(x) - rank(y) || x.path.localeCompare(y.path) || x.method.localeCompare(y.method));
  return {
    operations,
    breakingCount: operations.filter(d => d.breaking).length,
    nonBreakingCount: operations.filter(d => !d.breaking).length,
    unchangedCount,
  };
}

// ---- matching observed traffic to operations

/**
 * A server span name (`GET /api/flights/{flightNumber}`, or a framework's own route form like `GET /api/flights/:id`)
 * to the spec operation it serves, by method and path template with every parameter treated alike. Spans that carry
 * only a method (`GET`) match nothing: usage is per operation where the framework reports a route, never per field.
 */
export function operationForSpan(span: string, ops: SpecOperation[]): SpecOperation | undefined {
  const m = /^([A-Z]+)\s+(\S+)$/.exec(span.trim());
  if (!m) return undefined;
  const norm = (p: string) => p.replace(/\{[^}]+\}|:[A-Za-z0-9_]+|\*\*?/g, '{}').replace(/\/+$/, '');
  const path = norm(m[2]);
  return ops.find(o => o.method === m[1] && norm(o.path) === path);
}
