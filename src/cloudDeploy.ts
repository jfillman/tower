import type { PipelineRunSummary, RunPhase, TaskRunSummary } from './tekton/types';
import { extractShortShaFromImageTag } from './types';

// What a deploy to a cloud target (AWS ECS or Lambda, Azure Container Apps) looks like to Tower.
//
// Tower reads no cloud API and holds no cloud credential: everything here comes from the
// Tekton PipelineRun Glidepath already runs for the deploy stage. Two Tasks publish what we need
// early, before the deploy itself runs: resolve-deploy-target (result `target`, and `config-json`,
// the full cicd.yaml with its deploy.ecs / deploy.lambda / deploy.azureContainerApps block) and
// resolve-image-ref (result `image-ref`). The cloud Task's own params repeat the image and env.
// So this shows what Glidepath last deployed and whether that run worked. It does not read live
// health (running count, errors) from the cloud; the view says so.

export type CloudTarget = 'aws-ecs' | 'aws-lambda' | 'azure-container-apps';

// pipeline task name -> target, for the case where resolve-deploy-target's result is missing.
export const CLOUD_DEPLOY_TASKS: Record<string, CloudTarget> = {
  'deploy-aws-ecs': 'aws-ecs',
  'deploy-aws-lambda': 'aws-lambda',
  'deploy-azure-container-apps': 'azure-container-apps',
};

export const TARGET_LABELS: Record<CloudTarget, string> = {
  'aws-ecs': 'AWS ECS',
  'aws-lambda': 'AWS Lambda',
  'azure-container-apps': 'Azure Container Apps',
};

export interface CloudResource {
  /** What the thing is called in that cloud: "ECS service", "Lambda function", "Container App". */
  kind: string;
  name: string;
  /** The ECS cluster or the Azure resource group the resource lives in. */
  scope?: string;
  region?: string;
}

export interface CloudDeploy {
  runName: string;
  flowSlug?: string;
  target: CloudTarget;
  targetLabel: string;
  resource?: CloudResource;
  env?: string;
  imageRef?: string;
  imageTag?: string;
  shortSha?: string;
  phase: RunPhase;
  startTime?: string;
  completionTime?: string;
  durationSec?: number;
  /** For a failed run: the first task that failed and what Tekton said about it. */
  failure?: { task: string; message?: string };
  consoleUrl?: string;
}

const result = (tr: TaskRunSummary | undefined, name: string) => tr?.results.find(r => r.name === name)?.value;
const param = (tr: TaskRunSummary | undefined, name: string) => tr?.params.find(p => p.name === name)?.value;

function parseJson(text: string | undefined): Record<string, any> | undefined {
  if (!text) return undefined;
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? v : undefined;
  } catch {
    return undefined;
  }
}

function targetOf(run: PipelineRunSummary): CloudTarget | undefined {
  const resolved = result(run.taskRunsByPipelineTask['resolve-deploy-target'], 'target');
  if (resolved && Object.values(CLOUD_DEPLOY_TASKS).includes(resolved as CloudTarget)) return resolved as CloudTarget;
  // k8s-rollout is the default target and not a cloud one: nothing to show here.
  if (resolved) return undefined;
  const task = Object.keys(CLOUD_DEPLOY_TASKS).find(t => run.taskRunsByPipelineTask[t]);
  return task ? CLOUD_DEPLOY_TASKS[task] : undefined;
}

function resourceOf(target: CloudTarget, config: Record<string, any> | undefined): CloudResource | undefined {
  const d = config?.deploy;
  if (!d) return undefined;
  if (target === 'aws-ecs' && d.ecs?.service) {
    return { kind: 'ECS service', name: d.ecs.service, scope: d.ecs.cluster, region: d.ecs.region ?? 'us-east-1' };
  }
  if (target === 'aws-lambda' && d.lambda?.functionName) {
    return { kind: 'Lambda function', name: d.lambda.functionName, region: d.lambda.region ?? 'us-east-1' };
  }
  if (target === 'azure-container-apps' && d.azureContainerApps?.appName) {
    return { kind: 'Container App', name: d.azureContainerApps.appName, scope: d.azureContainerApps.resourceGroup };
  }
  return undefined;
}

/**
 * A link to the resource in the cloud's own console. AWS links need only the region and names.
 * Azure's portal URL needs a subscription id that Tower does not know, so it opens the Container
 * Apps list instead of the one app.
 */
export function consoleUrlFor(target: CloudTarget, resource: CloudResource | undefined): string | undefined {
  if (!resource) return undefined;
  const region = resource.region ?? 'us-east-1';
  if (target === 'aws-ecs' && resource.scope) {
    return `https://${region}.console.aws.amazon.com/ecs/v2/clusters/${encodeURIComponent(resource.scope)}/services/${encodeURIComponent(resource.name)}?region=${region}`;
  }
  if (target === 'aws-lambda') {
    return `https://${region}.console.aws.amazon.com/lambda/home?region=${region}#/functions/${encodeURIComponent(resource.name)}`;
  }
  if (target === 'azure-container-apps') return 'https://portal.azure.com/#browse/Microsoft.App%2FcontainerApps';
  return undefined;
}

function tagOf(imageRef: string | undefined): string | undefined {
  if (!imageRef) return undefined;
  // A digest reference (repo@sha256:...) has a colon too, but no tag.
  const withoutDigest = imageRef.split('@')[0];
  const afterSlash = withoutDigest.slice(withoutDigest.lastIndexOf('/') + 1);
  const i = afterSlash.lastIndexOf(':');
  return i === -1 ? undefined : afterSlash.slice(i + 1);
}

function failureOf(run: PipelineRunSummary): CloudDeploy['failure'] {
  if (run.phase !== 'failed') return undefined;
  // The cloud deploy task if it is the one that failed (the useful case), else whatever failed first.
  const tasks = Object.values(run.taskRunsByPipelineTask);
  const failed = tasks.filter(t => t.phase === 'failed');
  const cloud = failed.find(t => CLOUD_DEPLOY_TASKS[t.pipelineTaskName]);
  const hit = cloud ?? failed.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))[0];
  return hit ? { task: hit.pipelineTaskName, message: hit.message } : { task: 'pipeline', message: run.message };
}

/** The deploy a PipelineRun represents, or undefined if it is not a deploy to a cloud target. */
export function cloudDeployFromRun(run: PipelineRunSummary): CloudDeploy | undefined {
  const target = targetOf(run);
  if (!target) return undefined;
  const cloudTask =
    run.taskRunsByPipelineTask[Object.keys(CLOUD_DEPLOY_TASKS).find(k => CLOUD_DEPLOY_TASKS[k] === target)!];
  const resolve = run.taskRunsByPipelineTask['resolve-deploy-target'];
  const config = parseJson(result(resolve, 'config-json')) ?? parseJson(param(cloudTask, 'config-json'));
  const imageRef =
    result(run.taskRunsByPipelineTask['resolve-image-ref'], 'image-ref') || param(cloudTask, 'image-ref') || undefined;
  const imageTag = tagOf(imageRef);
  const resource = resourceOf(target, config);
  const start = run.startTime ? Date.parse(run.startTime) : undefined;
  const end = run.completionTime ? Date.parse(run.completionTime) : undefined;
  return {
    runName: run.name,
    flowSlug: run.flowSlug,
    target,
    targetLabel: TARGET_LABELS[target],
    resource,
    env: param(cloudTask, 'env') || undefined,
    imageRef,
    imageTag,
    shortSha: imageTag ? extractShortShaFromImageTag(imageTag) : undefined,
    phase: run.phase,
    startTime: run.startTime,
    completionTime: run.completionTime,
    durationSec: start !== undefined && end !== undefined ? Math.max(0, Math.round((end - start) / 1000)) : undefined,
    failure: failureOf(run),
    consoleUrl: consoleUrlFor(target, resource),
  };
}

export interface CloudDeploySummary {
  /** Newest first. */
  deploys: CloudDeploy[];
  /** The newest deploy that succeeded: what Glidepath last put there. */
  current?: CloudDeploy;
  /** A deploy running right now. */
  inFlight?: CloudDeploy;
  /** The newest deploy, when it failed and nothing newer succeeded: the cloud may be on an older image. */
  latestFailure?: CloudDeploy;
  target?: CloudTarget;
  resource?: CloudResource;
}

export function summarizeCloudDeploys(runs: PipelineRunSummary[]): CloudDeploySummary {
  const deploys = runs
    .map(cloudDeployFromRun)
    .filter((d): d is CloudDeploy => d !== undefined)
    .sort((a, b) => Date.parse(b.startTime ?? '') - Date.parse(a.startTime ?? ''));
  const current = deploys.find(d => d.phase === 'succeeded');
  const inFlight = deploys.find(d => d.phase === 'running' || d.phase === 'pending');
  const newest = deploys.find(d => d.phase !== 'running' && d.phase !== 'pending');
  const latestFailure = newest && newest.phase === 'failed' ? newest : undefined;
  const head = deploys[0];
  return {
    deploys,
    current,
    inFlight,
    latestFailure,
    target: head?.target,
    resource: deploys.find(d => d.resource)?.resource,
  };
}

/** True when any deploy to a cloud target is in progress, for the tab's activity dot. */
export const hasCloudDeployInFlight = (runs: PipelineRunSummary[]) =>
  runs.some(r => {
    const d = cloudDeployFromRun(r);
    return d !== undefined && (d.phase === 'running' || d.phase === 'pending');
  });
