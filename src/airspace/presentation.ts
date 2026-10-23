import type { HangarTokens } from '../brand/tokens';
import type { StatusTone } from '../ui';
import type { EdgeKind, EdgeState } from './model';

// How each edge state reads, in words and in colour. Amber is kept for the one state that waits on a person (seen in
// traffic, not declared); everything else is informational or quiet (design-system.md: amber is attention).
export const STATE_LABEL: Record<EdgeState, string> = {
  ok: 'Declared · seen',
  undeclared: 'Seen, not declared',
  silent: 'Declared · no traffic',
  composed: 'Owned',
  ingress: 'Ingress',
  broker: 'Via broker',
};

export const STATE_TONE: Record<EdgeState, StatusTone> = {
  ok: 'ok',
  undeclared: 'warn',
  silent: 'neutral',
  composed: 'neutral',
  ingress: 'info',
  broker: 'info',
};

export const STATE_HINT: Record<EdgeState, string> = {
  ok: 'Declared in the values file and seen in traffic in this window.',
  undeclared:
    'Seen in traffic but not declared. Today the declaration is networkPolicy.allowIngressFrom / allowEgressTo in the values file.',
  silent: 'Declared in the values file, but no traffic in this window. The caller may be idle, or the declaration stale.',
  composed: 'A component this app owns (components[] in the values file); Crossplane runs it.',
  ingress: 'Requests with no traced caller: the gateway, probes, or a client without tracing.',
  broker: 'Producer to consumer through the message broker the app attaches to; no NetworkPolicy declaration applies.',
};

export const KIND_LABEL: Record<EdgeKind, string> = {
  rpc: 'HTTP / RPC',
  messaging: 'Messaging',
  database: 'Database',
  ingress: 'Gateway',
  peer: 'Peer',
};

/** Stroke colour and dash of an edge in the graph views. */
export function edgeStroke(state: EdgeState, t: HangarTokens): { color: string; dash?: string } {
  switch (state) {
    case 'undeclared':
      return { color: t.amber, dash: '6 5' };
    case 'silent':
      return { color: t.textFaint, dash: '2 5' };
    case 'composed':
      return { color: t.textFaint };
    case 'ok':
      return { color: t.sky };
    default:
      return { color: t.skyLine };
  }
}
