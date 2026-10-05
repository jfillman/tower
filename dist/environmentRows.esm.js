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

export { buildEnvironmentRows };
//# sourceMappingURL=environmentRows.esm.js.map
