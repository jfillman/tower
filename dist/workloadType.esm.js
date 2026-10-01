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

export { WORKLOAD_LABELS, WORKLOAD_LABEL_SINGULAR, WORKLOAD_TYPE_ANNOTATION, workloadTypeOf };
//# sourceMappingURL=workloadType.esm.js.map
