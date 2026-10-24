import { verdictOf } from '../supplyChain.esm.js';

const API_SPEC_PREDICATE = "https://hangar.io/attestations/api-spec/v1";
const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const str = (v) => {
  if (typeof v === "string") return v;
  return v === void 0 || v === null ? "" : String(v);
};
function apiSpecPredicateOf(a) {
  if (a.predicateType !== API_SPEC_PREDICATE || !isObj(a.predicate) || !isObj(a.predicate.spec)) return void 0;
  const p = a.predicate;
  return {
    apiType: str(p.apiType) || "openapi",
    path: str(p.path),
    sha256: str(p.sha256),
    specVersion: str(p.specVersion),
    title: str(p.title),
    version: str(p.version),
    spec: p.spec
  };
}
function findApiSpec(p) {
  const found = (p?.attestations ?? []).map((attestation) => ({ attestation, predicate: apiSpecPredicateOf(attestation) })).filter((x) => Boolean(x.predicate)).map((x) => ({ ...x, verdict: verdictOf(x.attestation) }));
  return found.find((x) => x.verdict === "verified") ?? found[0];
}
const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
const opKey = (method, path) => `${method.toUpperCase()} ${path}`;
function specOperations(spec) {
  const paths = isObj(spec.paths) ? spec.paths : {};
  const out = [];
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
        deprecated: op.deprecated === true
      });
    }
  }
  return out;
}
function deref(spec, node, seen = /* @__PURE__ */ new Set()) {
  if (!isObj(node) || typeof node.$ref !== "string") return node;
  const ref = node.$ref;
  if (!ref.startsWith("#/") || seen.has(ref)) return node;
  seen.add(ref);
  let cur = spec;
  for (const part of ref.slice(2).split("/")) {
    const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!isObj(cur)) return node;
    cur = cur[key];
  }
  return cur === void 0 ? node : deref(spec, cur, seen);
}
function paramsOf(spec, item, op) {
  const out = /* @__PURE__ */ new Map();
  for (const list of [item.parameters, op.parameters]) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const p = deref(spec, raw);
      if (!isObj(p) || typeof p.name !== "string") continue;
      const schema = deref(spec, p.schema);
      out.set(`${str(p.in)}:${p.name}`, {
        name: p.name,
        in: str(p.in),
        required: p.required === true || p.in === "path",
        type: typeOf(spec, schema)
      });
    }
  }
  return out;
}
function typeOf(spec, schema) {
  const s = deref(spec, schema);
  if (!isObj(s)) return "";
  if (Array.isArray(s.type)) return s.type.map(str).sort().join("|");
  if (s.type) return str(s.type);
  if (s.properties) return "object";
  if (s.items) return "array";
  return "";
}
function jsonSchemaOf(spec, holder) {
  const h = deref(spec, holder);
  if (!isObj(h) || !isObj(h.content)) return void 0;
  const content = h.content;
  const media = content["application/json"] ?? Object.values(content)[0];
  return isObj(media) ? deref(spec, media.schema) : void 0;
}
function schemaChanges(spec, a, b, side, at, depth) {
  const sa = deref(spec.a, a);
  const sb = deref(spec.b, b);
  if (!isObj(sa) || !isObj(sb) || depth > 4) return [];
  const out = [];
  const ta = typeOf(spec.a, sa);
  const tb = typeOf(spec.b, sb);
  if (ta && tb && ta !== tb) {
    out.push({ text: `${side} ${at || "body"}: type ${ta} \u2192 ${tb}`, breaking: true });
    return out;
  }
  if (ta === "array" || sa.items && sb.items) {
    return schemaChanges(spec, sa.items, sb.items, side, `${at}[]`, depth + 1);
  }
  const pa = isObj(sa.properties) ? sa.properties : {};
  const pb = isObj(sb.properties) ? sb.properties : {};
  const reqA = new Set(Array.isArray(sa.required) ? sa.required.map(str) : []);
  const reqB = new Set(Array.isArray(sb.required) ? sb.required.map(str) : []);
  const name = (k) => at ? `${at}.${k}` : k;
  for (const k of Object.keys(pa)) {
    if (!(k in pb)) {
      out.push(
        side === "response" ? { text: `response field ${name(k)} removed`, breaking: true } : { text: `request field ${name(k)} removed`, breaking: false }
      );
    }
  }
  for (const k of Object.keys(pb)) {
    if (!(k in pa)) {
      const required = reqB.has(k);
      out.push(
        side === "request" && required ? { text: `request field ${name(k)} added, required`, breaking: true } : { text: `${side} field ${name(k)} added`, breaking: false }
      );
    }
  }
  for (const k of Object.keys(pa)) {
    if (!(k in pb)) continue;
    if (side === "request" && !reqA.has(k) && reqB.has(k)) out.push({ text: `request field ${name(k)} now required`, breaking: true });
    if (side === "request" && reqA.has(k) && !reqB.has(k)) out.push({ text: `request field ${name(k)} now optional`, breaking: false });
    out.push(...schemaChanges(spec, pa[k], pb[k], side, name(k), depth + 1));
  }
  return out;
}
const isSuccess = (code) => /^2\d\d$|^2XX$/i.test(code);
function operationChanges(spec, ia, oa, ib, ob) {
  const out = [];
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
    if (p.type && q.type && p.type !== q.type) out.push({ text: `${p.in} parameter ${p.name}: type ${p.type} \u2192 ${q.type}`, breaking: true });
  }
  for (const [k, q] of pb) {
    if (!pa.has(k)) {
      out.push(
        q.required ? { text: `${q.in} parameter ${q.name} added, required`, breaking: true } : { text: `${q.in} parameter ${q.name} added`, breaking: false }
      );
    }
  }
  const ba = deref(spec.a, oa.requestBody);
  const bb = deref(spec.b, ob.requestBody);
  if (!isObj(ba) && isObj(bb) && bb.required === true) out.push({ text: "request body added, required", breaking: true });
  else if (isObj(ba) && isObj(bb)) {
    if (ba.required !== true && bb.required === true) out.push({ text: "request body now required", breaking: true });
    out.push(...schemaChanges(spec, jsonSchemaOf(spec.a, ba), jsonSchemaOf(spec.b, bb), "request", "", 0));
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
    out.push(...schemaChanges(spec, jsonSchemaOf(spec.a, ra[code]), jsonSchemaOf(spec.b, rb[code]), "response", "", 0));
  }
  if (oa.deprecated !== true && ob.deprecated === true) out.push({ text: "marked deprecated", breaking: false });
  return out;
}
function diffSpecs(a, b) {
  const spec = { a, b };
  const pathsA = isObj(a.paths) ? a.paths : {};
  const pathsB = isObj(b.paths) ? b.paths : {};
  const opsA = new Map(specOperations(a).map((o) => [o.key, o]));
  const opsB = new Map(specOperations(b).map((o) => [o.key, o]));
  const operations = [];
  let unchangedCount = 0;
  for (const [key, o] of opsA) {
    if (!opsB.has(key)) {
      operations.push({ key, method: o.method, path: o.path, kind: "removed", breaking: true, changes: [{ text: "operation removed", breaking: true }] });
      continue;
    }
    const ia = pathsA[o.path];
    const ib = pathsB[o.path];
    const m = o.method.toLowerCase();
    const changes = operationChanges(spec, ia, ia[m], ib, ib[m]);
    if (changes.length === 0) {
      unchangedCount++;
      continue;
    }
    operations.push({ key, method: o.method, path: o.path, kind: "changed", breaking: changes.some((c) => c.breaking), changes });
  }
  for (const [key, o] of opsB) {
    if (!opsA.has(key)) operations.push({ key, method: o.method, path: o.path, kind: "added", breaking: false, changes: [{ text: "operation added", breaking: false }] });
  }
  const rank = (d) => d.breaking ? 0 : 1;
  operations.sort((x, y) => rank(x) - rank(y) || x.path.localeCompare(y.path) || x.method.localeCompare(y.method));
  return {
    operations,
    breakingCount: operations.filter((d) => d.breaking).length,
    nonBreakingCount: operations.filter((d) => !d.breaking).length,
    unchangedCount
  };
}
function operationForSpan(span, ops) {
  const m = /^([A-Z]+)\s+(\S+)$/.exec(span.trim());
  if (!m) return void 0;
  const norm = (p) => p.replace(/\{[^}]+\}|:[A-Za-z0-9_]+|\*\*?/g, "{}").replace(/\/+$/, "");
  const path = norm(m[2]);
  return ops.find((o) => o.method === m[1] && norm(o.path) === path);
}

export { API_SPEC_PREDICATE, HTTP_METHODS, apiSpecPredicateOf, diffSpecs, findApiSpec, opKey, operationForSpan, specOperations };
//# sourceMappingURL=apiSpec.esm.js.map
