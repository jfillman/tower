import { load } from 'js-yaml';
// The chart's networkPolicy block (airframe-application values.schema.json): which peers may reach the workload and which
// it may reach. A peer is one namespace (optionally narrowed by pod labels) or one external CIDR, optionally narrowed to
// ports. Kept apart from the form so the shape can be tested on its own.

export interface PeerRow {
  kind: 'namespace' | 'cidr';
  /** The namespace name or the CIDR. */
  target: string;
  /** `key=value, key2=value2`, only for a namespace peer. */
  podLabels: string;
  /** `80, 443`; empty means every port. */
  ports: string;
}

export const blankPeer = (): PeerRow => ({ kind: 'namespace', target: '', podLabels: '', ports: '' });

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function parsePeers(value: unknown): PeerRow[] {
  if (!Array.isArray(value)) return [];
  return value.map(p => {
    const r = asRecord(p);
    const labels = asRecord(r.podLabels);
    return {
      kind: typeof r.cidr === 'string' ? 'cidr' : 'namespace',
      target: String(r.cidr ?? r.namespace ?? ''),
      podLabels: Object.entries(labels).map(([k, v]) => `${k}=${String(v)}`).join(', '),
      ports: Array.isArray(r.ports) ? r.ports.map(String).join(', ') : '',
    };
  });
}

/** `a=b, c=d` as an object; undefined when empty. Returns the bad entries too, for the error message. */
export function parseLabels(text: string): { labels?: Record<string, string>; bad: string[] } {
  const bad: string[] = [];
  const labels: Record<string, string> = {};
  for (const part of text.split(',').map(x => x.trim()).filter(Boolean)) {
    const i = part.indexOf('=');
    if (i <= 0 || i === part.length - 1) bad.push(part);
    else labels[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return { labels: Object.keys(labels).length > 0 ? labels : undefined, bad };
}

export function parsePorts(text: string): { ports?: number[]; bad: string[] } {
  const bad: string[] = [];
  const ports: number[] = [];
  for (const part of text.split(',').map(x => x.trim()).filter(Boolean)) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 1 || n > 65535) bad.push(part);
    else ports.push(n);
  }
  return { ports: ports.length > 0 ? ports : undefined, bad };
}

export function buildPeers(rows: PeerRow[]): unknown[] {
  return rows
    .filter(r => r.target.trim())
    .map(r => {
      const peer: Record<string, unknown> = r.kind === 'cidr' ? { cidr: r.target.trim() } : { namespace: r.target.trim() };
      if (r.kind === 'namespace') {
        const { labels } = parseLabels(r.podLabels);
        if (labels) peer.podLabels = labels;
      }
      const { ports } = parsePorts(r.ports);
      if (ports) peer.ports = ports;
      return peer;
    });
}

export function validatePeers(rows: PeerRow[], what: string): string[] {
  const errors: string[] = [];
  rows.forEach((r, i) => {
    const label = `${what} ${i + 1}`;
    if (!r.target.trim()) errors.push(`${label} needs a ${r.kind === 'cidr' ? 'CIDR' : 'namespace'}.`);
    if (r.kind === 'namespace') {
      const { bad } = parseLabels(r.podLabels);
      if (bad.length > 0) errors.push(`${label}: pod labels must be key=value, comma-separated (${bad.join(', ')}).`);
    }
    const { bad } = parsePorts(r.ports);
    if (bad.length > 0) errors.push(`${label}: ports must be whole numbers from 1 to 65535 (${bad.join(', ')}).`);
  });
  return errors;
}

export const GATEWAY_NS_KEY = 'kubernetes.io/metadata.name';

/** The gateway namespace out of ingressControllerNamespaceSelector.matchLabels, or '' when it is not set that way. */
export const gatewayNamespaceOf = (selector: unknown): string => {
  const v = asRecord(asRecord(selector).matchLabels)[GATEWAY_NS_KEY];
  return typeof v === 'string' ? v : '';
};

/** The selector with the gateway namespace set, keeping every other label and field it already had. */
export function withGatewayNamespace(selector: unknown, ns: string): Record<string, unknown> {
  const s = asRecord(selector);
  return { ...s, matchLabels: { ...asRecord(s.matchLabels), [GATEWAY_NS_KEY]: ns } };
}

/** A selector this form edits as a single namespace name: unset, or matchLabels with only that one label. */
export function isSimpleGatewaySelector(selector: unknown): boolean {
  if (selector === undefined || selector === null) return true;
  const s = asRecord(selector);
  const keys = Object.keys(s);
  if (keys.length === 0) return true;
  if (keys.length !== 1 || keys[0] !== 'matchLabels') return false;
  const labels = Object.keys(asRecord(s.matchLabels));
  return labels.length === 0 || (labels.length === 1 && labels[0] === GATEWAY_NS_KEY);
}

/**
 * The networkPolicy patch for the gateway selector: the YAML as written (advanced), or the namespace name merged into
 * the existing selector (simple). Empty means no change; unchanged values are left out so the file is not rewritten.
 */
export function gatewaySelectorPatch(
  original: unknown,
  form: { networkPolicyGatewayAdvanced: boolean; networkPolicyGatewaySelectorYaml: string; networkPolicyGatewayNs: string },
): Record<string, unknown> {
  if (form.networkPolicyGatewayAdvanced) {
    const text = form.networkPolicyGatewaySelectorYaml.trim();
    if (!text) return original === undefined ? {} : { ingressControllerNamespaceSelector: undefined };
    let parsed: unknown;
    try {
      parsed = load(text);
    } catch {
      return {};
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return JSON.stringify(parsed) === JSON.stringify(original ?? null) ? {} : { ingressControllerNamespaceSelector: parsed };
  }
  const ns = form.networkPolicyGatewayNs.trim();
  if (!ns || ns === gatewayNamespaceOf(original)) return {};
  return { ingressControllerNamespaceSelector: withGatewayNamespace(original, ns) };
}

/** One httpRoute parentRef as the form edits it; empty strings are fields the file does not set. */
export interface ParentRefRow {
  name: string;
  namespace: string;
  sectionName: string;
}

export function parseParentRefs(value: unknown): ParentRefRow[] {
  if (!Array.isArray(value)) return [];
  return value.map(p => {
    const r = asRecord(p);
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    return { name: str(r.name), namespace: str(r.namespace), sectionName: str(r.sectionName) };
  });
}

/** The parentRefs list to write: rows without a name are dropped, and empty optional fields are left out. */
export function buildParentRefs(rows: ParentRefRow[]): Array<Record<string, string>> {
  return rows
    .filter(r => r.name.trim())
    .map(r => {
      const ref: Record<string, string> = { name: r.name.trim() };
      if (r.namespace.trim()) ref.namespace = r.namespace.trim();
      if (r.sectionName.trim()) ref.sectionName = r.sectionName.trim();
      return ref;
    });
}
