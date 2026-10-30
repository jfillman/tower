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
const appOfNamespace = (ns) => ns.replace(/^app-/, "").replace(/-cicd$/, "");

export { CATEGORY_LABEL, DEFAULT_CATEGORIES, PIPELINE_CATEGORIES, appOfNamespace, formatCategories, parseCategories, pipelineCategory };
//# sourceMappingURL=pipelineHistory.esm.js.map
