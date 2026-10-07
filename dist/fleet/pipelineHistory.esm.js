const PIPELINE_CATEGORIES = ["build", "deploy", "guardrail", "platform"];
const CATEGORY_LABEL = {
  build: "Build & test",
  deploy: "Deploy",
  guardrail: "Guardrails",
  platform: "Platform"
};
const DEFAULT_CATEGORIES = ["build", "deploy", "guardrail"];
const BUILD = /* @__PURE__ */ new Set(["build", "test", "pr-build"]);
const DEPLOY = /* @__PURE__ */ new Set(["deploy", "release", "gitops-image-bump", "promote"]);
function pipelineCategory(pipeline) {
  if (!pipeline) return "platform";
  if (BUILD.has(pipeline)) return "build";
  if (DEPLOY.has(pipeline)) return "deploy";
  if (pipeline.endsWith("-check")) return "guardrail";
  return "platform";
}
function parseCategories(param) {
  if (param === null) return new Set(DEFAULT_CATEGORIES);
  const picked = param.split(",").filter((c) => PIPELINE_CATEGORIES.includes(c));
  return new Set(picked);
}
function formatCategories(cats) {
  const sorted = PIPELINE_CATEGORIES.filter((c) => cats.has(c));
  const isDefault = sorted.length === DEFAULT_CATEGORIES.length && DEFAULT_CATEGORIES.every((c) => cats.has(c));
  return isDefault ? void 0 : sorted.join(",");
}
const STATUS = {
  SUCCESS: "succeeded",
  FAILURE: "failed",
  TIMEOUT: "failed",
  CANCELLED: "cancelled"
};
const appOfNamespace = (ns) => ns.replace(/^app-/, "").replace(/-cicd$/, "");
function toHistoryRun(r) {
  const s = r.summary;
  if (!s || s.type !== "tekton.dev/v1.PipelineRun") return void 0;
  const status = s.status ? STATUS[s.status] : void 0;
  const name = r.annotations?.["object.metadata.name"];
  if (!status || !name) return void 0;
  const namespace = r.name.split("/")[0];
  const start = s.start_time ? Date.parse(s.start_time) : NaN;
  const end = s.end_time ? Date.parse(s.end_time) : NaN;
  return {
    key: `${namespace}/${name}`,
    namespace,
    name,
    app: appOfNamespace(namespace),
    pipeline: r.annotations?.["tekton.dev/pipeline"],
    status,
    startTime: s.start_time,
    endTime: s.end_time,
    durationSec: Number.isNaN(start) || Number.isNaN(end) ? void 0 : Math.max(0, Math.round((end - start) / 1e3)),
    commit: s.annotations?.commit,
    eventType: s.annotations?.eventType,
    prNumber: s.annotations?.["pull_request-id"]
  };
}

export { CATEGORY_LABEL, DEFAULT_CATEGORIES, PIPELINE_CATEGORIES, appOfNamespace, formatCategories, parseCategories, pipelineCategory, toHistoryRun };
//# sourceMappingURL=pipelineHistory.esm.js.map
