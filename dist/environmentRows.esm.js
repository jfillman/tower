import { isPreviewEnvName, imageTag, health, envTierOf } from './types.esm.js';

function buildEnvironmentRows(environments, pipelineOrder) {
  return environments.filter((e) => !isPreviewEnvName(e.env)).map((e) => {
    const cloud = e.cloud;
    const where = cloud ? [cloud.resource?.name, cloud.resource?.region ?? cloud.resource?.scope].filter(Boolean).join(" \xB7 ") || cloud.targetLabel : e.cluster || "\u2014";
    return {
      name: e.env,
      tier: envTierOf(e.env, pipelineOrder) === "upper" ? "flight" : "ground",
      target: cloud?.targetLabel ?? "Kubernetes",
      where,
      health: health(e),
      deployed: e.deployed !== false && Boolean(e.image),
      image: e.image ? imageTag(e.image) : void 0,
      deployedAt: e.deployedAt
    };
  });
}
function envListsOf(deploy) {
  const declared = deploy.environments;
  if (Array.isArray(declared) && declared.length > 0) {
    const entries = declared.filter((e) => typeof e?.name === "string");
    return {
      lower: entries.filter((e) => e.tier === "ground").map((e) => e.name),
      order: entries.map((e) => e.name)
    };
  }
  return {
    lower: Array.isArray(deploy.lowerEnvironments) ? deploy.lowerEnvironments : ["dev"],
    order: Array.isArray(deploy.promotionOrder) ? deploy.promotionOrder : []
  };
}

export { buildEnvironmentRows, envListsOf };
//# sourceMappingURL=environmentRows.esm.js.map
