const STATE_LABEL = {
  ok: "Declared \xB7 seen",
  undeclared: "Seen, not declared",
  silent: "Declared \xB7 no traffic",
  composed: "Owned",
  ingress: "Ingress",
  broker: "Via broker"
};
const STATE_TONE = {
  ok: "ok",
  undeclared: "warn",
  silent: "neutral",
  composed: "neutral",
  ingress: "info",
  broker: "info"
};
const STATE_HINT = {
  ok: "Declared in the values file and seen in traffic in this window.",
  undeclared: "Seen in traffic but not declared. Today the declaration is networkPolicy.allowIngressFrom / allowEgressTo in the values file.",
  silent: "Declared in the values file, but no traffic in this window. The caller may be idle, or the declaration stale.",
  composed: "A component this app owns (components[] in the values file); Crossplane runs it.",
  ingress: "Requests with no traced caller: the gateway, probes, or a client without tracing.",
  broker: "Producer to consumer through the message broker the app attaches to; no NetworkPolicy declaration applies."
};
const KIND_LABEL = {
  rpc: "HTTP / RPC",
  messaging: "Messaging",
  database: "Database",
  ingress: "Gateway",
  peer: "Peer"
};
function edgeStroke(state, t) {
  switch (state) {
    case "undeclared":
      return { color: t.amber, dash: "6 5" };
    case "silent":
      return { color: t.textFaint, dash: "2 5" };
    case "composed":
      return { color: t.textFaint };
    case "ok":
      return { color: t.sky };
    default:
      return { color: t.skyLine };
  }
}

export { KIND_LABEL, STATE_HINT, STATE_LABEL, STATE_TONE, edgeStroke };
//# sourceMappingURL=presentation.esm.js.map
