import { dump } from 'js-yaml';
import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';

const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function useChartValues(owner) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [chart, setChart] = useState(void 0);
  useEffect(() => {
    if (!owner) return void 0;
    let cancelled = false;
    (async () => {
      try {
        const base = await discoveryApi.getBaseUrl("glidepath");
        const res = await fetchApi.fetch(`${base}/config/chart?${new URLSearchParams({ owner })}`);
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled && body.schema && body.defaults) setChart(body);
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [discoveryApi, fetchApi, owner]);
  return chart;
}
function mergeValues(base, over) {
  if (isObj(base) && isObj(over)) {
    const out = { ...base };
    for (const [k, v] of Object.entries(over)) out[k] = k in base ? mergeValues(base[k], v) : v;
    return out;
  }
  return over;
}
function resolve(schema, root) {
  let node = isObj(schema) ? schema : {};
  for (let i = 0; i < 5 && typeof node.$ref === "string"; i++) {
    const name = node.$ref.replace("#/definitions/", "");
    const target = root.definitions?.[name];
    node = { ...isObj(target) ? target : {}, ...Object.fromEntries(Object.entries(node).filter(([k]) => k !== "$ref")) };
  }
  return node;
}
function childSchema(node, key, root) {
  const props = isObj(node.properties) ? node.properties : {};
  if (key in props) return resolve(props[key], root);
  return isObj(node.additionalProperties) ? resolve(node.additionalProperties, root) : {};
}
function wrap(text, width) {
  const out = [];
  for (const para of text.split(/\n\s*\n/)) {
    let line = "";
    for (const word of para.replace(/\s+/g, " ").trim().split(" ")) {
      if (line && line.length + word.length + 1 > width) {
        out.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) out.push(line);
  }
  return out;
}
function origin(layers, key) {
  for (let i = layers.length - 1; i >= 0; i--) {
    const v = layers[i].values;
    if (v !== void 0 && key in v) return layers[i].mark;
  }
  return void 0;
}
function emit(node, effective, layers, root, indent, lines) {
  const pad = " ".repeat(indent);
  const props = isObj(node.properties) ? Object.keys(node.properties) : [];
  const keys = [...props.filter((k) => k in effective), ...Object.keys(effective).filter((k) => !props.includes(k))];
  for (const key of keys) {
    const value = effective[key];
    const child = childSchema(node, key, root);
    const from = origin(layers, key);
    const description = typeof child.description === "string" ? child.description : "";
    if (description) for (const l of wrap(description, Math.max(40, 100 - indent))) lines.push(`${pad}# ${l}`);
    if (isObj(value) && Object.keys(value).length > 0) {
      const setWhole = from !== void 0 && layers.some((l) => l.mark === from && l.values && key in l.values && !isObj(l.values[key]));
      lines.push(`${pad}${key}:${setWhole ? `  # ${from}` : ""}`);
      const inner = layers.map((l) => ({ mark: l.mark, values: l.values && isObj(l.values[key]) ? l.values[key] : void 0 }));
      emit(child, value, inner, root, indent + 2, lines);
    } else {
      const body = dump({ [key]: value }, { indent: 2, lineWidth: 100, noRefs: true }).trimEnd().split("\n");
      body.forEach((l, i) => lines.push(`${pad}${l}${i === 0 && from ? `  # ${from}` : ""}`));
    }
    lines.push("");
  }
}
function annotateLayers(chart, layers, header) {
  const defaults = chart?.defaults ?? {};
  const effective = layers.reduce((acc, l) => mergeValues(acc, l.values), defaults);
  const root = chart?.schema ?? {};
  const lines = [...header.map((h) => `# ${h}`), ""];
  emit(resolve(root, root), effective, layers.map((l) => ({ mark: l.mark, values: l.values })), root, 0, lines);
  return `${lines.join("\n").trimEnd()}
`;
}
function annotateValues(chart, values) {
  return annotateLayers(chart, [{ mark: "set here", values }], [
    "Effective values: the chart defaults with this file laid over them.",
    'Fields marked "# set here" come from the file; everything else is the chart default.'
  ]);
}
function useEnvValueLayers(owner, appName, target, enabled, refreshKey) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({});
  const key = owner && appName && target ? `${owner}/${appName}/${target.env}/${target.tier}/${target.cluster ?? ""}/${target.argoApp ?? ""}` : "";
  useEffect(() => {
    if (!key || !target) return void 0;
    let live = true;
    (async () => {
      try {
        const base = await discoveryApi.getBaseUrl("glidepath");
        const q = new URLSearchParams({
          owner,
          appName,
          env: target.env,
          tier: target.tier,
          ...target.cluster ? { cluster: target.cluster } : {},
          ...target.argoApp ? { argoApp: target.argoApp } : {}
        });
        const res = await fetchApi.fetch(`${base}/environment/values-layers?${q}`);
        const body = await res.json().catch(() => void 0);
        if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
        if (live) setState(body);
      } catch (e) {
        if (live) setState({ error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      live = false;
    };
  }, [discoveryApi, fetchApi, key, enabled, refreshKey]);
  return state;
}
function fileName(label) {
  return label.split("/").pop() ?? label;
}
function composeEnvLayers(backend, own) {
  const out = [];
  let ownPlaced = false;
  const placeOwn = () => {
    if (!ownPlaced) out.push({ mark: "set here", values: own });
    ownPlaced = true;
  };
  for (const l of backend ?? []) {
    if (l.kind === "env") {
      placeOwn();
      continue;
    }
    if (l.kind !== "shared") placeOwn();
    out.push({ mark: l.kind === "platform" ? "set by the platform (Argo CD Application)" : `from ${fileName(l.label)}`, values: l.values });
  }
  placeOwn();
  return out;
}

export { annotateLayers, annotateValues, composeEnvLayers, mergeValues, useChartValues, useEnvValueLayers };
//# sourceMappingURL=annotatedValues.esm.js.map
