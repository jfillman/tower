function argoTone(status) {
  if (status === "Healthy" || status === "Synced") return "ok";
  if (status === "Progressing") return "info";
  if (status === "Suspended" || status === "OutOfSync") return "warn";
  if (status === "Degraded" || status === "Missing") return "bad";
  return "neutral";
}

export { argoTone };
//# sourceMappingURL=argoTone.esm.js.map
