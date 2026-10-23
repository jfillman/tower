import yaml from 'js-yaml';
import type { Entity } from '@backstage/catalog-model';

// Contracts: the catalog's `kind: API` entities (Backstage's API model: spec.type openapi | asyncapi | graphql | grpc,
// spec.definition the document itself). Phase 1 reads what the catalog has; the per-environment deployed spec and its
// diff need Glidepath to extract the spec from each signed image (phase 2, docs/airspace.md).

export interface Operation {
  method: string;
  path: string;
  summary: string;
  deprecated: boolean;
}

export interface ApiContract {
  ref: string;
  name: string;
  title: string;
  /** A second line under the title: the group/version of an XRD-derived API. */
  subtitle?: string;
  type: string;
  lifecycle?: string;
  owner?: string;
  description?: string;
  /** Component refs that provide / consume the API (catalog relations). */
  providers: string[];
  consumers: string[];
  operations: Operation[];
  /** Set when the definition could not be read as OpenAPI; the operations list is then empty. */
  parseError?: string;
  definition: string;
}

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

/** An OpenAPI (or Swagger 2) document's operations, in document order. Throws on a document that is not one. */
export function openApiOperations(definition: string): Operation[] {
  const doc = yaml.load(definition) as Record<string, unknown> | undefined;
  if (!doc || typeof doc !== 'object') throw new Error('the definition is empty');
  if (!('openapi' in doc) && !('swagger' in doc)) throw new Error('not an OpenAPI or Swagger document');
  const paths = (doc.paths ?? {}) as Record<string, Record<string, unknown>>;
  const out: Operation[] = [];
  for (const [path, item] of Object.entries(paths)) {
    if (!item || typeof item !== 'object') continue;
    for (const method of METHODS) {
      const op = item[method] as Record<string, unknown> | undefined;
      if (!op || typeof op !== 'object') continue;
      out.push({
        method: method.toUpperCase(),
        path,
        summary: String(op.summary ?? op.operationId ?? ''),
        deprecated: op.deprecated === true,
      });
    }
  }
  return out;
}

// The kubernetes-ingestor publishes every Crossplane XRD as an API entity of type `crd`, named
// <kind>-<group>--<version> (applicationenvironment-catalog.hangar.io--v1alpha1): Airframe's own contracts.
const XRD_NAME = /^([a-z0-9]+)-([a-z0-9.-]+)--(v[0-9a-z]+)$/;

/** A readable title for an API entity: its own title, or an XRD-derived name split into kind and group/version. */
export function titleOf(name: string, title: string | undefined, type: string): { title: string; subtitle?: string } {
  if (title && title !== name) return { title };
  const m = type === 'crd' ? XRD_NAME.exec(name) : null;
  return m ? { title: m[1], subtitle: `${m[2]}/${m[3]}` } : { title: name };
}

/** App APIs first, then the platform's XRD-derived ones, each by title. */
export function byKindThenTitle(a: ApiContract, b: ApiContract): number {
  return Number(a.type === 'crd') - Number(b.type === 'crd') || a.title.localeCompare(b.title);
}

/** The short name of a catalog ref: `component:default/flight-api` -> `flight-api`. */
export function refName(ref: string): string {
  return ref.replace(/^[^:]+:/, '').replace(/^[^/]+\//, '');
}

export function contractOf(entity: Entity): ApiContract {
  const spec = (entity.spec ?? {}) as Record<string, unknown>;
  const relations = entity.relations ?? [];
  const definition = typeof spec.definition === 'string' ? spec.definition : '';
  const type = String(spec.type ?? 'unknown');
  let operations: Operation[] = [];
  let parseError: string | undefined;
  if (type === 'openapi' && definition) {
    try {
      operations = openApiOperations(definition);
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }
  }
  const ns = entity.metadata.namespace ?? 'default';
  return {
    ref: `api:${ns}/${entity.metadata.name}`,
    name: entity.metadata.name,
    ...titleOf(entity.metadata.name, entity.metadata.title, type),
    type,
    lifecycle: typeof spec.lifecycle === 'string' ? spec.lifecycle : undefined,
    owner: typeof spec.owner === 'string' ? spec.owner : undefined,
    description: entity.metadata.description,
    providers: relations.filter(r => r.type === 'apiProvidedBy').map(r => r.targetRef),
    consumers: relations.filter(r => r.type === 'apiConsumedBy').map(r => r.targetRef),
    operations,
    parseError,
    definition,
  };
}

export const API_TYPES = ['openapi', 'asyncapi', 'graphql', 'grpc'] as const;
