import { dump } from 'js-yaml';
import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';

// The full, annotated values of one environment, as Argo CD renders it: the chart's defaults, then the shared base, this
// environment's file (and any change staged in the form), its release file and the values its Argo CD Application sets,
// each field carrying the description airframe's schema gives it and a mark naming where its value came from. Before
// 2026-10-22 only the environment's file was laid over the defaults, so everything the shared base, the release file or
// the platform sets (appName, cluster, envName, clusterType, the image) showed as the chart's empty default.

export interface ChartValues {
  schema: Record<string, unknown>;
  defaults: Record<string, unknown>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export function useChartValues(owner: string | undefined): ChartValues | undefined {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [chart, setChart] = useState<ChartValues | undefined>(undefined);
  useEffect(() => {
    if (!owner) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const base = await discoveryApi.getBaseUrl('glidepath');
        const res = await fetchApi.fetch(`${base}/config/chart?${new URLSearchParams({ owner })}`);
        if (!res.ok) return;
        const body = (await res.json()) as ChartValues;
        if (!cancelled && body.schema && body.defaults) setChart(body);
      } catch {
        // The view says the chart could not be read; the committed file is still shown.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [discoveryApi, fetchApi, owner]);
  return chart;
}

/** Helm's own merge: maps merge key by key, everything else (lists included) is replaced whole. */
export function mergeValues(base: unknown, over: unknown): unknown {
  if (isObj(base) && isObj(over)) {
    const out: Obj = { ...base };
    for (const [k, v] of Object.entries(over)) out[k] = k in base ? mergeValues(base[k], v) : v;
    return out;
  }
  return over;
}

function resolve(schema: unknown, root: Obj): Obj {
  let node = isObj(schema) ? schema : {};
  for (let i = 0; i < 5 && typeof node.$ref === 'string'; i++) {
    const name = node.$ref.replace('#/definitions/', '');
    const target = (root.definitions as Obj | undefined)?.[name];
    node = { ...(isObj(target) ? target : {}), ...Object.fromEntries(Object.entries(node).filter(([k]) => k !== '$ref')) };
  }
  return node;
}

function childSchema(node: Obj, key: string, root: Obj): Obj {
  const props = isObj(node.properties) ? node.properties : {};
  if (key in props) return resolve(props[key], root);
  return isObj(node.additionalProperties) ? resolve(node.additionalProperties, root) : {};
}

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n\s*\n/)) {
    let line = '';
    for (const word of para.replace(/\s+/g, ' ').trim().split(' ')) {
      if (line && line.length + word.length + 1 > width) {
        out.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) out.push(line);
  }
  return out;
}

/**
 * One source of values, lowest first, as Argo CD layers them: the shared base, the environment's own file (plus what is
 * staged), its release file, the values its Argo CD Application sets. `mark` is what a value from it is annotated with.
 */
export interface ValueLayer {
  mark: string;
  values: Obj;
}

/** The mark of the last layer that sets `key` in `layers` (each already narrowed to the current map), if any. */
function origin(layers: Array<{ mark: string; values: Obj | undefined }>, key: string): string | undefined {
  for (let i = layers.length - 1; i >= 0; i--) {
    const v = layers[i].values;
    if (v !== undefined && key in v) return layers[i].mark;
  }
  return undefined;
}

function emit(
  node: Obj,
  effective: Obj,
  layers: Array<{ mark: string; values: Obj | undefined }>,
  root: Obj,
  indent: number,
  lines: string[],
) {
  const pad = ' '.repeat(indent);
  const props = isObj(node.properties) ? Object.keys(node.properties) : [];
  const keys = [...props.filter(k => k in effective), ...Object.keys(effective).filter(k => !props.includes(k))];
  for (const key of keys) {
    const value = effective[key];
    const child = childSchema(node, key, root);
    const from = origin(layers, key);
    const description = typeof child.description === 'string' ? child.description : '';
    if (description) for (const l of wrap(description, Math.max(40, 100 - indent))) lines.push(`${pad}# ${l}`);
    if (isObj(value) && Object.keys(value).length > 0) {
      // A map is marked only when one layer replaced it whole (it set a non-map there); otherwise its leaves say.
      const setWhole = from !== undefined && layers.some(l => l.mark === from && l.values && key in l.values && !isObj(l.values[key]));
      lines.push(`${pad}${key}:${setWhole ? `  # ${from}` : ''}`);
      const inner = layers.map(l => ({ mark: l.mark, values: l.values && isObj(l.values[key]) ? (l.values[key] as Obj) : undefined }));
      emit(child, value, inner, root, indent + 2, lines);
    } else {
      const body = dump({ [key]: value }, { indent: 2, lineWidth: 100, noRefs: true }).trimEnd().split('\n');
      body.forEach((l, i) => lines.push(`${pad}${l}${i === 0 && from ? `  # ${from}` : ''}`));
    }
    lines.push('');
  }
}

/**
 * The annotated YAML: `chart` defaults, then each layer merged over them in order. A value is marked with the layer it
 * comes from; an unmarked value is the chart default.
 */
export function annotateLayers(chart: ChartValues | undefined, layers: ValueLayer[], header: string[]): string {
  const defaults = chart?.defaults ?? {};
  const effective = layers.reduce<unknown>((acc, l) => mergeValues(acc, l.values), defaults) as Obj;
  const root = chart?.schema ?? {};
  const lines = [...header.map(h => `# ${h}`), ''];
  emit(resolve(root, root), effective, layers.map(l => ({ mark: l.mark, values: l.values })), root, 0, lines);
  return `${lines.join('\n').trimEnd()}\n`;
}

/** The annotated YAML of one file over the chart defaults: `values` (the file, plus anything staged) marked "set here". */
export function annotateValues(chart: ChartValues | undefined, values: Obj): string {
  return annotateLayers(chart, [{ mark: 'set here', values }], [
    "Effective values: the chart defaults with this file laid over them.",
    'Fields marked "# set here" come from the file; everything else is the chart default.',
  ]);
}

/** An environment's values as the layers Argo CD renders it with (backstage glidepathWorkload.ts fetchEffectiveLayers). */
export interface EnvValueLayer {
  kind: 'shared' | 'env' | 'release' | 'platform';
  label: string;
  values: Obj;
}

export interface EnvLayersTarget {
  env: string;
  tier: 'ground' | 'flight';
  cluster?: string;
  argoApp?: string;
}

/**
 * Read only while the full view is open (`enabled`): the shared base, the environment's file, its release file and
 * the values its Argo CD Application sets. Re-read when `refreshKey` changes (the file was re-read after a merge).
 */
export function useEnvValueLayers(
  owner: string | undefined,
  appName: string | undefined,
  target: EnvLayersTarget | undefined,
  enabled: boolean,
  refreshKey?: unknown,
) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ layers?: EnvValueLayer[]; platformFrom?: 'application' | 'missing'; error?: string }>({});
  const key = owner && appName && target ? `${owner}/${appName}/${target.env}/${target.tier}/${target.cluster ?? ''}/${target.argoApp ?? ''}` : '';
  useEffect(() => {
    if (!enabled || !key || !target) return undefined;
    let live = true;
    (async () => {
      try {
        const base = await discoveryApi.getBaseUrl('glidepath');
        const q = new URLSearchParams({
          owner: owner as string,
          appName: appName as string,
          env: target.env,
          tier: target.tier,
          ...(target.cluster ? { cluster: target.cluster } : {}),
          ...(target.argoApp ? { argoApp: target.argoApp } : {}),
        });
        const res = await fetchApi.fetch(`${base}/environment/values-layers?${q}`);
        const body = await res.json().catch(() => undefined);
        if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
        if (live) setState(body);
      } catch (e) {
        if (live) setState({ error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoveryApi, fetchApi, key, enabled, refreshKey]);
  return state;
}

function fileName(label: string): string {
  return label.split('/').pop() ?? label;
}

/**
 * The layers to annotate for an environment: the backend's, with the environment's own file replaced by what the form
 * holds (`own`: the file plus anything staged), so staged changes show. With no backend layers, just `own`.
 */
export function composeEnvLayers(backend: EnvValueLayer[] | undefined, own: Obj): ValueLayer[] {
  const out: ValueLayer[] = [];
  let ownPlaced = false;
  const placeOwn = () => {
    if (!ownPlaced) out.push({ mark: 'set here', values: own });
    ownPlaced = true;
  };
  for (const l of backend ?? []) {
    if (l.kind === 'env') {
      placeOwn();
      continue;
    }
    if (l.kind !== 'shared') placeOwn(); // the environment's file sits right after the shared base, even when it does not exist yet
    out.push({ mark: l.kind === 'platform' ? 'set by the platform (Argo CD Application)' : `from ${fileName(l.label)}`, values: l.values });
  }
  placeOwn();
  return out;
}
