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
function emit(node, effective, own, root, indent, lines) {
  const pad = " ".repeat(indent);
  const props = isObj(node.properties) ? Object.keys(node.properties) : [];
  const keys = [...props.filter((k) => k in effective), ...Object.keys(effective).filter((k) => !props.includes(k))];
  for (const key of keys) {
    const value = effective[key];
    const child = childSchema(node, key, root);
    const fromFile = own !== void 0 && key in own;
    const description = typeof child.description === "string" ? child.description : "";
    if (description) for (const l of wrap(description, Math.max(40, 100 - indent))) lines.push(`${pad}# ${l}`);
    if (isObj(value) && Object.keys(value).length > 0) {
      lines.push(`${pad}${key}:${fromFile && !isObj(own?.[key]) ? "  # set here" : ""}`);
      emit(child, value, isObj(own?.[key]) ? own[key] : void 0, root, indent + 2, lines);
    } else {
      const body = dump({ [key]: value }, { indent: 2, lineWidth: 100, noRefs: true }).trimEnd().split("\n");
      body.forEach((l, i) => lines.push(`${pad}${l}${i === 0 && fromFile ? "  # set here" : ""}`));
    }
    lines.push("");
  }
}
function annotateValues(chart, values) {
  const defaults = chart?.defaults ?? {};
  const effective = mergeValues(defaults, values);
  const root = chart?.schema ?? {};
  const lines = [
    "# Effective values: the chart defaults with this environment's file laid over them.",
    '# Fields marked "# set here" come from the file; everything else is the chart default.',
    ""
  ];
  emit(resolve(root, root), effective, values, root, 0, lines);
  return `${lines.join("\n").trimEnd()}
`;
}

export { annotateValues, mergeValues, useChartValues };
//# sourceMappingURL=annotatedValues.esm.js.map
