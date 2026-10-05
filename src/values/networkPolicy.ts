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
