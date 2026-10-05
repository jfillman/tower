import { dump } from 'js-yaml';
import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';

// The full, annotated values of one environment: the chart's defaults, then this environment's file (and any change staged in
// the form) laid over them, each field carrying the description airframe's schema gives it. A value that comes from the file
// is marked, so "what did I set" and "what is just the default" are one glance apart.

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

function emit(node: Obj, effective: Obj, own: Obj | undefined, root: Obj, indent: number, lines: string[]) {
  const pad = ' '.repeat(indent);
  const props = isObj(node.properties) ? Object.keys(node.properties) : [];
  const keys = [...props.filter(k => k in effective), ...Object.keys(effective).filter(k => !props.includes(k))];
  for (const key of keys) {
    const value = effective[key];
    const child = childSchema(node, key, root);
    const fromFile = own !== undefined && key in own;
    const description = typeof child.description === 'string' ? child.description : '';
    if (description) for (const l of wrap(description, Math.max(40, 100 - indent))) lines.push(`${pad}# ${l}`);
    if (isObj(value) && Object.keys(value).length > 0) {
      lines.push(`${pad}${key}:${fromFile && !isObj(own?.[key]) ? '  # set here' : ''}`);
      emit(child, value, isObj(own?.[key]) ? (own[key] as Obj) : undefined, root, indent + 2, lines);
    } else {
      const body = dump({ [key]: value }, { indent: 2, lineWidth: 100, noRefs: true }).trimEnd().split('\n');
      body.forEach((l, i) => lines.push(`${pad}${l}${i === 0 && fromFile ? '  # set here' : ''}`));
    }
    lines.push('');
  }
}

/** The annotated YAML: `chart` defaults overlaid with `values` (the file, plus anything staged). */
export function annotateValues(chart: ChartValues | undefined, values: Obj): string {
  const defaults = chart?.defaults ?? {};
  const effective = mergeValues(defaults, values) as Obj;
  const root = chart?.schema ?? {};
  const lines: string[] = [
    '# Effective values: the chart defaults with this environment\'s file laid over them.',
    '# Fields marked "# set here" come from the file; everything else is the chart default.',
    '',
  ];
  emit(resolve(root, root), effective, values, root, 0, lines);
  return `${lines.join('\n').trimEnd()}\n`;
}
