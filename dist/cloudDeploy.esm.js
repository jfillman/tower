import { extractShortShaFromImageTag } from './types.esm.js';

const CLOUD_DEPLOY_TASKS = {
  "deploy-aws-ecs": "aws-ecs",
  "deploy-aws-lambda": "aws-lambda",
  "deploy-azure-container-apps": "azure-container-apps"
};
const TARGET_LABELS = {
  "aws-ecs": "AWS ECS",
  "aws-lambda": "AWS Lambda",
  "azure-container-apps": "Azure Container Apps"
};
const result = (tr, name) => tr?.results.find((r) => r.name === name)?.value;
const param = (tr, name) => tr?.params.find((p) => p.name === name)?.value;
function parseJson(text) {
  if (!text) return void 0;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? v : void 0;
  } catch {
    return void 0;
  }
}
function targetOf(run) {
  const resolved = result(run.taskRunsByPipelineTask["resolve-deploy-target"], "target");
  if (resolved && Object.values(CLOUD_DEPLOY_TASKS).includes(resolved)) return resolved;
  if (resolved) return void 0;
  const task = Object.keys(CLOUD_DEPLOY_TASKS).find((t) => run.taskRunsByPipelineTask[t]);
  return task ? CLOUD_DEPLOY_TASKS[task] : void 0;
}
function resourceOf(target, config) {
  const d = config?.deploy;
  if (!d) return void 0;
  if (target === "aws-ecs" && d.ecs?.service) {
    return { kind: "ECS service", name: d.ecs.service, scope: d.ecs.cluster, region: d.ecs.region ?? "us-east-1" };
  }
  if (target === "aws-lambda" && d.lambda?.functionName) {
    return { kind: "Lambda function", name: d.lambda.functionName, region: d.lambda.region ?? "us-east-1" };
  }
  if (target === "azure-container-apps" && d.azureContainerApps?.appName) {
    return { kind: "Container App", name: d.azureContainerApps.appName, scope: d.azureContainerApps.resourceGroup };
  }
  return void 0;
}
function consoleUrlFor(target, resource) {
  if (!resource) return void 0;
  const region = resource.region ?? "us-east-1";
  if (target === "aws-ecs" && resource.scope) {
    return `https://${region}.console.aws.amazon.com/ecs/v2/clusters/${encodeURIComponent(resource.scope)}/services/${encodeURIComponent(resource.name)}?region=${region}`;
  }
  if (target === "aws-lambda") {
    return `https://${region}.console.aws.amazon.com/lambda/home?region=${region}#/functions/${encodeURIComponent(resource.name)}`;
  }
  if (target === "azure-container-apps") return "https://portal.azure.com/#browse/Microsoft.App%2FcontainerApps";
  return void 0;
}
function tagOf(imageRef) {
  if (!imageRef) return void 0;
  const withoutDigest = imageRef.split("@")[0];
  const afterSlash = withoutDigest.slice(withoutDigest.lastIndexOf("/") + 1);
  const i = afterSlash.lastIndexOf(":");
  return i === -1 ? void 0 : afterSlash.slice(i + 1);
}
function failureOf(run) {
  if (run.phase !== "failed") return void 0;
  const tasks = Object.values(run.taskRunsByPipelineTask);
  const failed = tasks.filter((t) => t.phase === "failed");
  const cloud = failed.find((t) => CLOUD_DEPLOY_TASKS[t.pipelineTaskName]);
  const hit = cloud ?? failed.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""))[0];
  return hit ? { task: hit.pipelineTaskName, message: hit.message } : { task: "pipeline", message: run.message };
}
function cloudDeployFromRun(run) {
  const target = targetOf(run);
  if (!target) return void 0;
  const cloudTask = run.taskRunsByPipelineTask[Object.keys(CLOUD_DEPLOY_TASKS).find((k) => CLOUD_DEPLOY_TASKS[k] === target)];
  const resolve = run.taskRunsByPipelineTask["resolve-deploy-target"];
  const config = parseJson(result(resolve, "config-json")) ?? parseJson(param(cloudTask, "config-json"));
  const imageRef = result(run.taskRunsByPipelineTask["resolve-image-ref"], "image-ref") || param(cloudTask, "image-ref") || void 0;
  const imageTag = tagOf(imageRef);
  const resource = resourceOf(target, config);
  const start = run.startTime ? Date.parse(run.startTime) : void 0;
  const end = run.completionTime ? Date.parse(run.completionTime) : void 0;
  return {
    runName: run.name,
    flowSlug: run.flowSlug,
    target,
    targetLabel: TARGET_LABELS[target],
    resource,
    env: param(cloudTask, "env") || void 0,
    imageRef,
    imageTag,
    shortSha: imageTag ? extractShortShaFromImageTag(imageTag) : void 0,
    phase: run.phase,
    startTime: run.startTime,
    completionTime: run.completionTime,
    durationSec: start !== void 0 && end !== void 0 ? Math.max(0, Math.round((end - start) / 1e3)) : void 0,
    failure: failureOf(run),
    consoleUrl: consoleUrlFor(target, resource)
  };
}
function summarizeCloudDeploys(runs) {
  const deploys = runs.map(cloudDeployFromRun).filter((d) => d !== void 0).sort((a, b) => Date.parse(b.startTime ?? "") - Date.parse(a.startTime ?? ""));
  const current = deploys.find((d) => d.phase === "succeeded");
  const inFlight = deploys.find((d) => d.phase === "running" || d.phase === "pending");
  const newest = deploys.find((d) => d.phase !== "running" && d.phase !== "pending");
  const latestFailure = newest && newest.phase === "failed" ? newest : void 0;
  const head = deploys[0];
  return {
    deploys,
    current,
    inFlight,
    latestFailure,
    target: head?.target,
    resource: deploys.find((d) => d.resource)?.resource
  };
}
const hasCloudDeployInFlight = (runs) => runs.some((r) => {
  const d = cloudDeployFromRun(r);
  return d !== void 0 && (d.phase === "running" || d.phase === "pending");
});

export { CLOUD_DEPLOY_TASKS, TARGET_LABELS, cloudDeployFromRun, consoleUrlFor, hasCloudDeployInFlight, summarizeCloudDeploys };
//# sourceMappingURL=cloudDeploy.esm.js.map
