function extractSource(predicate) {
  const cloneTask = predicate?.buildConfig?.tasks?.find((t) => {
    const taskLabel = t.invocation?.environment?.labels?.["tekton.dev/task"];
    return taskLabel === "git-clone" || taskLabel === "clone-repo-authenticated";
  });
  return {
    url: cloneTask?.results?.find((r) => r.name === "url")?.value,
    commit: cloneTask?.results?.find((r) => r.name === "commit")?.value
  };
}
function parseGithubUrl(url) {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  return match ? { owner: match[1], repo: match[2] } : void 0;
}
function extractShortShaFromImageTag(tag) {
  return tag.match(/(?:^|-)([0-9a-f]{7,40})$/i)?.[1];
}
function imageTag(image) {
  if (!image) return "no image";
  const atIndex = image.indexOf("@sha256:");
  if (atIndex !== -1) return `sha256:${image.slice(atIndex + 8, atIndex + 20)}\u2026`;
  const colonIndex = image.lastIndexOf(":");
  return colonIndex === -1 ? image : image.slice(colonIndex + 1);
}
function splitImageRef(image) {
  const colonIndex = image.lastIndexOf(":");
  if (colonIndex === -1) return void 0;
  return { repo: image.slice(0, colonIndex), tag: image.slice(colonIndex + 1) };
}
function parseGhcrOwnerRepo(image) {
  const prefix = "ghcr.io/";
  if (!image.startsWith(prefix)) return void 0;
  const rest = image.slice(prefix.length);
  const withoutRef = rest.split("@")[0].replace(/:[^/]*$/, "");
  const slash = withoutRef.indexOf("/");
  if (slash === -1) return void 0;
  return { owner: withoutRef.slice(0, slash), repo: withoutRef.slice(slash + 1) };
}
const GHCR_PROVENANCE_TAG = /^sha256-[0-9a-f]{64}\.att$/;
const GHCR_ATTESTATIONS_TAG = /^sha256-[0-9a-f]{64}$/;
const GHCR_SIGNATURE_TAG = /^sha256-[0-9a-f]{64}\.sig$/;
function classifyGhcrVersion(tags) {
  if (tags.some((t) => GHCR_PROVENANCE_TAG.test(t))) return "provenance";
  if (tags.some((t) => GHCR_SIGNATURE_TAG.test(t))) return "signature";
  if (tags.some((t) => GHCR_ATTESTATIONS_TAG.test(t))) return "attestations";
  if (tags.length === 0) return "attestations";
  return "image";
}
const FALLBACK_STAGE_ORDER = ["dev", "staging", "prod", "production"];
function isPreviewEnvName(env) {
  const lower = env.toLowerCase();
  return /^pr[-_]?\d+/.test(lower) || lower.includes("preview");
}
function previewPrNumber(env) {
  const match = env.toLowerCase().match(/^pr[-_]?(\d+)/);
  return match ? Number(match[1]) : void 0;
}
const ENV_TIER_LABEL = {
  preview: "Preview",
  lower: "Ground",
  upper: "Flight"
};
function envTierOf(env, pipelineOrder) {
  if (isPreviewEnvName(env)) return "preview";
  const needle = env.toLowerCase();
  if (pipelineOrder?.upper?.some((e) => e.toLowerCase() === needle)) return "upper";
  return "lower";
}
function envStageRank(env, pipelineOrder) {
  const lower = env.toLowerCase();
  if (isPreviewEnvName(env)) return -1;
  if (pipelineOrder) {
    const index2 = pipelineOrder.findIndex((e) => e.toLowerCase() === lower);
    return index2 === -1 ? pipelineOrder.length : index2;
  }
  const index = FALLBACK_STAGE_ORDER.indexOf(lower);
  return index === -1 ? FALLBACK_STAGE_ORDER.length : index;
}
function rolloutHealthOf(env) {
  switch (env.rolloutPhase) {
    case "Healthy":
      return "healthy";
    case "Progressing":
      return "progressing";
    case "Paused":
      return "paused";
    case "Degraded":
      return "degraded";
  }
  if (env.desiredReplicas === void 0 || env.desiredReplicas === 0) return "unknown";
  if (env.availableReplicas === env.desiredReplicas) return "healthy";
  if ((env.availableReplicas ?? 0) > 0) return "progressing";
  return "degraded";
}
function argoHealthOf(status) {
  if (status === "Healthy") return "healthy";
  if (status === "Progressing") return "progressing";
  if (status === "Suspended") return "paused";
  if (status === "Degraded" || status === "Missing") return "degraded";
  return void 0;
}
const HEALTH_SEVERITY = { healthy: 0, unknown: 1, paused: 2, progressing: 3, degraded: 4 };
function health(env) {
  if (env.cloud) {
    const l = env.cloud.latest;
    return l === "succeeded" ? "healthy" : l === "failed" ? "degraded" : l === "running" ? "progressing" : "unknown";
  }
  const rollout = rolloutHealthOf(env);
  const argo = argoHealthOf(env.argoHealthStatus);
  if (!argo) return rollout;
  return HEALTH_SEVERITY[argo] >= HEALTH_SEVERITY[rollout] ? argo : rollout;
}
function isRolloutActive(env) {
  const weight = env.workload?.kind === "Rollout" ? env.workload.canaryProgress?.currentWeight : void 0;
  if (weight !== void 0 && weight < 100) return true;
  return env.rolloutPhase === "Progressing";
}
const CONFIG_TOP_LEVEL_FIELDS = [
  "serviceAccount",
  "rollout",
  "analysisTemplates",
  "env",
  "configMaps",
  "secrets",
  "notifications",
  "volumes",
  "cronJobs",
  "jobs",
  "autoscaling",
  "podDisruptionBudget",
  "ingress",
  "httpRoute",
  "serviceMonitor",
  "networkPolicy",
  // Attached-tier (2026-09-24): a Config tab section for `components:` (Redis, ...) and
  // `slos:` - previously not editable here at all.
  "components",
  "slos",
  "extraManifests"
];
const CICD_TOP_LEVEL_FIELDS = [
  "build",
  "test",
  "deploy",
  "ephemeralEnvironments",
  "governance",
  "notifications",
  "secrets",
  "pipelines"
];

export { CICD_TOP_LEVEL_FIELDS, CONFIG_TOP_LEVEL_FIELDS, ENV_TIER_LABEL, classifyGhcrVersion, envStageRank, envTierOf, extractShortShaFromImageTag, extractSource, health, imageTag, isPreviewEnvName, isRolloutActive, parseGhcrOwnerRepo, parseGithubUrl, previewPrNumber, splitImageRef };
//# sourceMappingURL=types.esm.js.map
