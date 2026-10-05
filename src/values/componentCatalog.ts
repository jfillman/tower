import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';

// The attachable components as the Components form needs them, read from airframe's own XRDs through the backend
// (GET /config/components), so a new component or field appears without a Tower release. The conventions this relies on are
// airframe's own: a field's description starts with the mode it applies to, `(broker)` or `(attach)`, and the XRD's validation
// messages say what is required per mode ("brokerRef is required when mode == attach").

export interface SchemaNode {
  type?: string;
  enum?: Array<string | number>;
  default?: unknown;
  description?: string;
  required?: string[];
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  minimum?: number;
  maximum?: number;
  'x-kubernetes-validations'?: Array<{ rule?: string; message?: string }>;
}

export interface ComponentDefinition {
  type: string;
  kind: string;
  summary: string;
  spec: SchemaNode;
  outputs: Record<string, { kind: string; secret?: string; configMap?: string; key?: string }>;
}

export type Spec = Record<string, unknown>;

/** Set by the chart from the environment, never by the developer. */
const CHART_STAMPED = new Set(['environmentRef']);

export function useComponentCatalog(owner: string | undefined): ComponentDefinition[] | undefined {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [defs, setDefs] = useState<ComponentDefinition[] | undefined>(undefined);
  useEffect(() => {
    if (!owner) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const base = await discoveryApi.getBaseUrl('glidepath');
        const res = await fetchApi.fetch(`${base}/config/components?${new URLSearchParams({ owner })}`);
        if (!res.ok) return;
        const body = (await res.json()) as { components?: ComponentDefinition[] };
        if (!cancelled) setDefs(body.components ?? []);
      } catch {
        // The form falls back to the raw YAML editor when the catalog cannot be read.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [discoveryApi, fetchApi, owner]);
  return defs;
}

/** The fields the developer sets, in the XRD's order. */
export function fieldNames(def: ComponentDefinition): string[] {
  return Object.keys(def.spec.properties ?? {}).filter(k => !CHART_STAMPED.has(k));
}

export const modesOf = (def: ComponentDefinition): string[] => (def.spec.properties?.mode?.enum ?? []).map(String);

/** The mode a field belongs to, from the `(mode)` its description starts with; undefined for a field that applies to every mode. */
export function fieldMode(def: ComponentDefinition, field: string): string | undefined {
  const m = /^\(([a-z]+)\)/.exec(def.spec.properties?.[field]?.description ?? '');
  return m && modesOf(def).includes(m[1]) ? m[1] : undefined;
}

/** The mode in force: the one set, else the schema default, else the first (a component without modes has none). */
export function currentMode(def: ComponentDefinition, spec: Spec): string | undefined {
  const modes = modesOf(def);
  if (modes.length === 0) return undefined;
  const set = spec.mode;
  if (typeof set === 'string' && modes.includes(set)) return set;
  const d = def.spec.properties?.mode?.default;
  return typeof d === 'string' ? d : undefined;
}

export function visibleFields(def: ComponentDefinition, spec: Spec): string[] {
  const mode = currentMode(def, spec);
  return fieldNames(def).filter(f => {
    const own = fieldMode(def, f);
    return own === undefined || own === mode;
  });
}

/** Fields required now: the schema's `required`, plus those a validation message makes required for the current mode. */
export function requiredFields(def: ComponentDefinition, spec: Spec): string[] {
  const mode = currentMode(def, spec);
  const out = new Set((def.spec.required ?? []).filter(f => !CHART_STAMPED.has(f)));
  for (const v of def.spec['x-kubernetes-validations'] ?? []) {
    const m = /^(\w+) is required when mode == (\w+)$/.exec(v.message ?? '');
    if (m && m[2] === mode) out.add(m[1]);
  }
  return [...out];
}

/** The spec with every field that belongs to another mode removed (what changing the mode should do, so nothing stale is left behind). */
export function pruneForMode(def: ComponentDefinition, spec: Spec): Spec {
  const keep = new Set(visibleFields(def, spec));
  return Object.fromEntries(Object.entries(spec).filter(([k]) => k === 'mode' || keep.has(k) || !fieldNames(def).includes(k)));
}

/** A fresh spec for a new component: the mode set (attach when offered, since apps attach to shared infrastructure), nothing else. */
export function newSpec(def: ComponentDefinition): Spec {
  const modes = modesOf(def);
  if (modes.length === 0) return {};
  return { mode: modes.includes('attach') ? 'attach' : modes[0] };
}

export const COMPONENT_NAME = /^[a-z][a-z0-9-]{0,40}$/;

export interface ComponentRow {
  name: string;
  type: string;
  spec: Spec;
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** What is wrong with the components, worded for the pending-changes panel. Empty when all is well. */
export function componentProblems(defs: ComponentDefinition[], rows: ComponentRow[]): string[] {
  const out: string[] = [];
  const names = new Map<string, number>();
  rows.forEach(r => names.set(r.name, (names.get(r.name) ?? 0) + 1));
  for (const r of rows) {
    const label = `Component ${r.name || '(unnamed)'}`;
    if (!r.name) out.push(`${label}: needs a name.`);
    else if (!COMPONENT_NAME.test(r.name)) out.push(`${label}: the name must be lowercase letters, digits and "-", starting with a letter, at most 41 characters.`);
    if ((names.get(r.name) ?? 0) > 1) out.push(`${label}: the name is used by more than one component.`);
    const def = defs.find(d => d.type === r.type);
    if (!def) {
      out.push(`${label}: "${r.type}" is not a component type airframe knows.`);
      continue;
    }
    for (const f of requiredFields(def, r.spec)) {
      if (isEmpty(r.spec[f])) out.push(`${label}: ${f} is required${currentMode(def, r.spec) ? ` when mode is ${currentMode(def, r.spec)}` : ''}.`);
    }
    for (const f of visibleFields(def, r.spec)) {
      const node = def.spec.properties?.[f];
      const v = r.spec[f];
      if (!node || isEmpty(v)) continue;
      if (node.enum && !node.enum.map(String).includes(String(v))) out.push(`${label}: ${f} must be one of ${node.enum.join(', ')}.`);
      if ((node.type === 'integer' || node.type === 'number') && (typeof v !== 'number' || Number.isNaN(v) || (node.type === 'integer' && !Number.isInteger(v)))) {
        out.push(`${label}: ${f} must be a ${node.type === 'integer' ? 'whole ' : ''}number.`);
      }
      if (node.type === 'object' && node.required) {
        for (const sub of node.required) if (isEmpty((v as Spec)[sub])) out.push(`${label}: ${f}.${sub} is required.`);
      }
    }
  }
  return out;
}

/** Output names for fromComponent: the catalog's when it has the type, else undefined (the caller falls back). */
export const catalogOutputs = (defs: ComponentDefinition[] | undefined, type: string): string[] | undefined => {
  const def = defs?.find(d => d.type === type);
  return def ? Object.keys(def.outputs) : undefined;
};
