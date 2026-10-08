import { load } from 'js-yaml';

const blankPeer = () => ({ kind: "namespace", target: "", podLabels: "", ports: "" });
const asRecord = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
function parsePeers(value) {
  if (!Array.isArray(value)) return [];
  return value.map((p) => {
    const r = asRecord(p);
    const labels = asRecord(r.podLabels);
    return {
      kind: typeof r.cidr === "string" ? "cidr" : "namespace",
      target: String(r.cidr ?? r.namespace ?? ""),
      podLabels: Object.entries(labels).map(([k, v]) => `${k}=${String(v)}`).join(", "),
      ports: Array.isArray(r.ports) ? r.ports.map(String).join(", ") : ""
    };
  });
}
function parseLabels(text) {
  const bad = [];
  const labels = {};
  for (const part of text.split(",").map((x) => x.trim()).filter(Boolean)) {
    const i = part.indexOf("=");
    if (i <= 0 || i === part.length - 1) bad.push(part);
    else labels[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return { labels: Object.keys(labels).length > 0 ? labels : void 0, bad };
}
function parsePorts(text) {
  const bad = [];
  const ports = [];
  for (const part of text.split(",").map((x) => x.trim()).filter(Boolean)) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 1 || n > 65535) bad.push(part);
    else ports.push(n);
  }
  return { ports: ports.length > 0 ? ports : void 0, bad };
}
function buildPeers(rows) {
  return rows.filter((r) => r.target.trim()).map((r) => {
    const peer = r.kind === "cidr" ? { cidr: r.target.trim() } : { namespace: r.target.trim() };
    if (r.kind === "namespace") {
      const { labels } = parseLabels(r.podLabels);
      if (labels) peer.podLabels = labels;
    }
    const { ports } = parsePorts(r.ports);
    if (ports) peer.ports = ports;
    return peer;
  });
}
function validatePeers(rows, what) {
  const errors = [];
  rows.forEach((r, i) => {
    const label = `${what} ${i + 1}`;
    if (!r.target.trim()) errors.push(`${label} needs a ${r.kind === "cidr" ? "CIDR" : "namespace"}.`);
    if (r.kind === "namespace") {
      const { bad: bad2 } = parseLabels(r.podLabels);
      if (bad2.length > 0) errors.push(`${label}: pod labels must be key=value, comma-separated (${bad2.join(", ")}).`);
    }
    const { bad } = parsePorts(r.ports);
    if (bad.length > 0) errors.push(`${label}: ports must be whole numbers from 1 to 65535 (${bad.join(", ")}).`);
  });
  return errors;
}
const GATEWAY_NS_KEY = "kubernetes.io/metadata.name";
const gatewayNamespaceOf = (selector) => {
  const v = asRecord(asRecord(selector).matchLabels)[GATEWAY_NS_KEY];
  return typeof v === "string" ? v : "";
};
function withGatewayNamespace(selector, ns) {
  const s = asRecord(selector);
  return { ...s, matchLabels: { ...asRecord(s.matchLabels), [GATEWAY_NS_KEY]: ns } };
}
function isSimpleGatewaySelector(selector) {
  if (selector === void 0 || selector === null) return true;
  const s = asRecord(selector);
  const keys = Object.keys(s);
  if (keys.length === 0) return true;
  if (keys.length !== 1 || keys[0] !== "matchLabels") return false;
  const labels = Object.keys(asRecord(s.matchLabels));
  return labels.length === 0 || labels.length === 1 && labels[0] === GATEWAY_NS_KEY;
}
function gatewaySelectorPatch(original, form) {
  if (form.networkPolicyGatewayAdvanced) {
    const text = form.networkPolicyGatewaySelectorYaml.trim();
    if (!text) return original === void 0 ? {} : { ingressControllerNamespaceSelector: void 0 };
    let parsed;
    try {
      parsed = load(text);
    } catch {
      return {};
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return JSON.stringify(parsed) === JSON.stringify(original ?? null) ? {} : { ingressControllerNamespaceSelector: parsed };
  }
  const ns = form.networkPolicyGatewayNs.trim();
  if (!ns || ns === gatewayNamespaceOf(original)) return {};
  return { ingressControllerNamespaceSelector: withGatewayNamespace(original, ns) };
}
function parseParentRefs(value) {
  if (!Array.isArray(value)) return [];
  return value.map((p) => {
    const r = asRecord(p);
    const str = (v) => typeof v === "string" ? v : "";
    return { name: str(r.name), namespace: str(r.namespace), sectionName: str(r.sectionName) };
  });
}
function buildParentRefs(rows) {
  return rows.filter((r) => r.name.trim()).map((r) => {
    const ref = { name: r.name.trim() };
    if (r.namespace.trim()) ref.namespace = r.namespace.trim();
    if (r.sectionName.trim()) ref.sectionName = r.sectionName.trim();
    return ref;
  });
}

export { GATEWAY_NS_KEY, blankPeer, buildParentRefs, buildPeers, gatewayNamespaceOf, gatewaySelectorPatch, isSimpleGatewaySelector, parseLabels, parseParentRefs, parsePeers, parsePorts, validatePeers, withGatewayNamespace };
//# sourceMappingURL=networkPolicy.esm.js.map
