import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';

const CHART_STAMPED = /* @__PURE__ */ new Set(["environmentRef"]);
function useComponentCatalog(owner) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [defs, setDefs] = useState(void 0);
  useEffect(() => {
    if (!owner) return void 0;
    let cancelled = false;
    (async () => {
      try {
        const base = await discoveryApi.getBaseUrl("glidepath");
        const res = await fetchApi.fetch(`${base}/config/components?${new URLSearchParams({ owner })}`);
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) setDefs(body.components ?? []);
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [discoveryApi, fetchApi, owner]);
  return defs;
}
function fieldNames(def) {
  return Object.keys(def.spec.properties ?? {}).filter((k) => !CHART_STAMPED.has(k));
}
const modesOf = (def) => (def.spec.properties?.mode?.enum ?? []).map(String);
function fieldMode(def, field) {
  const m = /^\(([a-z]+)\)/.exec(def.spec.properties?.[field]?.description ?? "");
  return m && modesOf(def).includes(m[1]) ? m[1] : void 0;
}
function currentMode(def, spec) {
  const modes = modesOf(def);
  if (modes.length === 0) return void 0;
  const set = spec.mode;
  if (typeof set === "string" && modes.includes(set)) return set;
  const d = def.spec.properties?.mode?.default;
  return typeof d === "string" ? d : void 0;
}
function visibleFields(def, spec) {
  const mode = currentMode(def, spec);
  return fieldNames(def).filter((f) => {
    const own = fieldMode(def, f);
    return own === void 0 || own === mode;
  });
}
function requiredFields(def, spec) {
  const mode = currentMode(def, spec);
  const out = new Set((def.spec.required ?? []).filter((f) => !CHART_STAMPED.has(f)));
  for (const v of def.spec["x-kubernetes-validations"] ?? []) {
    const m = /^(\w+) is required when mode == (\w+)$/.exec(v.message ?? "");
    if (m && m[2] === mode) out.add(m[1]);
  }
  return [...out];
}
function pruneForMode(def, spec) {
  const keep = new Set(visibleFields(def, spec));
  return Object.fromEntries(Object.entries(spec).filter(([k]) => k === "mode" || keep.has(k) || !fieldNames(def).includes(k)));
}
function newSpec(def) {
  const modes = modesOf(def);
  if (modes.length === 0) return {};
  return { mode: modes.includes("attach") ? "attach" : modes[0] };
}
const COMPONENT_NAME = /^[a-z][a-z0-9-]{0,40}$/;
const isEmpty = (v) => v === void 0 || v === null || v === "" || Array.isArray(v) && v.length === 0;
function componentProblems(defs, rows) {
  const out = [];
  const names = /* @__PURE__ */ new Map();
  rows.forEach((r) => names.set(r.name, (names.get(r.name) ?? 0) + 1));
  for (const r of rows) {
    const label = `Component ${r.name || "(unnamed)"}`;
    if (!r.name) out.push(`${label}: needs a name.`);
    else if (!COMPONENT_NAME.test(r.name)) out.push(`${label}: the name must be lowercase letters, digits and "-", starting with a letter, at most 41 characters.`);
    if ((names.get(r.name) ?? 0) > 1) out.push(`${label}: the name is used by more than one component.`);
    const def = defs.find((d) => d.type === r.type);
    if (!def) {
      out.push(`${label}: "${r.type}" is not a component type airframe knows.`);
      continue;
    }
    for (const f of requiredFields(def, r.spec)) {
      if (isEmpty(r.spec[f])) out.push(`${label}: ${f} is required${currentMode(def, r.spec) ? ` when mode is ${currentMode(def, r.spec)}` : ""}.`);
    }
    for (const f of visibleFields(def, r.spec)) {
      const node = def.spec.properties?.[f];
      const v = r.spec[f];
      if (!node || isEmpty(v)) continue;
      if (node.enum && !node.enum.map(String).includes(String(v))) out.push(`${label}: ${f} must be one of ${node.enum.join(", ")}.`);
      if ((node.type === "integer" || node.type === "number") && (typeof v !== "number" || Number.isNaN(v) || node.type === "integer" && !Number.isInteger(v))) {
        out.push(`${label}: ${f} must be a ${node.type === "integer" ? "whole " : ""}number.`);
      }
      if (node.type === "object" && node.required) {
        for (const sub of node.required) if (isEmpty(v[sub])) out.push(`${label}: ${f}.${sub} is required.`);
      }
    }
  }
  return out;
}
const catalogOutputs = (defs, type) => {
  const def = defs?.find((d) => d.type === type);
  return def ? Object.keys(def.outputs) : void 0;
};

export { COMPONENT_NAME, catalogOutputs, componentProblems, currentMode, fieldMode, fieldNames, modesOf, newSpec, pruneForMode, requiredFields, useComponentCatalog, visibleFields };
//# sourceMappingURL=componentCatalog.esm.js.map
