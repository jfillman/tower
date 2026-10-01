const WORKLOAD_TYPE_ANNOTATION = "hangar.io/workload-type";
const WORKLOAD_LABELS = {
  container: "Container apps",
  ai: "AI workloads"
};
const WORKLOAD_LABEL_SINGULAR = {
  container: "Container app",
  ai: "AI workload"
};
function workloadTypeOf(entity) {
  if (entity.metadata.annotations?.[WORKLOAD_TYPE_ANNOTATION] === "ai") return "ai";
  if (entity.spec?.type === "ai-agent") return "ai";
  return "container";
}
const APP_TIER_KIND_TAGS = /* @__PURE__ */ new Set([
  "kind:nodejsapplication",
  "kind:springbootapplication",
  "kind:pythonapplication",
  "kind:goapplication"
]);
function isAppTierEntity(entity) {
  return (entity.metadata.tags ?? []).some((t) => APP_TIER_KIND_TAGS.has(t));
}
function isTowerService(entity) {
  return isAppTierEntity(entity) || workloadTypeOf(entity) === "ai";
}

export { WORKLOAD_LABELS, WORKLOAD_LABEL_SINGULAR, WORKLOAD_TYPE_ANNOTATION, isAppTierEntity, isTowerService, workloadTypeOf };
//# sourceMappingURL=workloadType.esm.js.map
