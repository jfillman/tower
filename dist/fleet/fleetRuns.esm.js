import { cloudDeployFromRun, CLOUD_DEPLOY_TASKS } from '../cloudDeploy.esm.js';
import { toPipelineRunSummary, TEKTON_CLUSTER } from '../tekton/useTektonPipelineRuns.esm.js';

function meta(raw, name) {
  return raw.metadata.labels?.[name] ?? raw.metadata.annotations?.[name];
}
const PROGRESS_RE = /Tasks Completed: (\d+) \(Failed: (\d+),[^)]*\)(?:, Incomplete: (\d+))?/;
function parseProgress(message) {
  const m = message?.match(PROGRESS_RE);
  if (!m) return void 0;
  const done = Number(m[1]);
  return { done, failed: Number(m[2]), total: done + Number(m[3] ?? 0) };
}
function mayDeployToCloud(raw) {
  return (raw.status?.pipelineSpec?.tasks ?? []).some((t) => t.name in CLOUD_DEPLOY_TASKS);
}
function toFleetRun(raw, taskRunsByName) {
  const run = toPipelineRunSummary(raw, TEKTON_CLUSTER, taskRunsByName);
  const repoUrl = meta(raw, "pipelinesascode.tekton.dev/repo-url");
  const checkRunId = meta(raw, "pipelinesascode.tekton.dev/check-run-id");
  const start = run.startTime ? Date.parse(run.startTime) : void 0;
  const end = run.completionTime ? Date.parse(run.completionTime) : void 0;
  return {
    key: `${run.namespace}/${run.name}`,
    run,
    stage: meta(raw, "hangar.io/stage") ?? meta(raw, "platform.io/stage"),
    title: meta(raw, "pipelinesascode.tekton.dev/sha-title")?.split("\n")[0],
    shaUrl: meta(raw, "pipelinesascode.tekton.dev/sha-url"),
    prNumber: meta(raw, "pipelinesascode.tekton.dev/pull-request"),
    checkRunUrl: repoUrl && checkRunId ? `${repoUrl}/runs/${checkRunId}` : void 0,
    progress: parseProgress(run.message),
    cloud: cloudDeployFromRun(run),
    durationSec: start !== void 0 && end !== void 0 ? Math.max(0, Math.round((end - start) / 1e3)) : void 0
  };
}
function needsTaskRuns(raw) {
  const cond = raw.status?.conditions?.find((c) => c.type === "Succeeded");
  return !cond || cond.status !== "True" || mayDeployToCloud(raw);
}
const runAppName = (r) => r.run.appName ?? r.run.namespace.replace(/^app-/, "").replace(/-cicd$/, "");

export { mayDeployToCloud, needsTaskRuns, parseProgress, runAppName, toFleetRun };
//# sourceMappingURL=fleetRuns.esm.js.map
