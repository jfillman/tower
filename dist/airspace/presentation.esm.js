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
const STATE_TODO = {
  ok: "Nothing to do.",
  undeclared: "Declare the caller in the callee's networkPolicy.allowIngressFrom (and the caller's allowEgressTo if it restricts egress), or remove the call. A NetworkPolicy built from the declarations would block it.",
  silent: "Check that the caller still exists before removing the declaration; a quiet environment can be idle, not broken.",
  composed: "Nothing to declare: Crossplane creates it with the app, so the connection is known.",
  ingress: "Nothing to do. A caller you expected to see here is not instrumented, or calls through the gateway.",
  broker: "Nothing to declare: both sides only talk to the broker, which the app already attaches to."
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

export { KIND_LABEL, STATE_HINT, STATE_LABEL, STATE_TODO, STATE_TONE, edgeStroke };
//# sourceMappingURL=presentation.esm.js.map
