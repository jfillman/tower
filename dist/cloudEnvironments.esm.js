import { summarizeCloudDeploys } from './cloudDeploy.esm.js';

const DEFAULT_ENV = "dev";
const latestOf = (d) => {
  if (d.phase === "succeeded" || d.phase === "failed") return d.phase;
  if (d.phase === "running" || d.phase === "pending") return "running";
  return "none";
};
function cloudEnvironmentsFromRuns(runs) {
  const { deploys } = summarizeCloudDeploys(runs);
  const byEnv = /* @__PURE__ */ new Map();
  deploys.forEach((d) => {
    const env = d.env || DEFAULT_ENV;
    byEnv.set(env, [...byEnv.get(env) ?? [], d]);
  });
  const environments = [];
  const history = {};
  byEnv.forEach((list, env) => {
    const ok = list.filter((d) => d.phase === "succeeded" && d.imageRef);
    const current = ok[0];
    const head = list[0];
    history[env] = [...ok].reverse().map((d) => ({
      sha: d.shortSha ?? "",
      date: d.completionTime ?? d.startTime ?? "",
      imageTag: d.imageRef
    }));
    environments.push({
      key: `cloud/${head.target}/${env}`,
      env,
      cluster: head.targetLabel,
      namespace: head.resource?.scope ?? head.resource?.name ?? "",
      deployed: Boolean(current),
      appName: head.resource?.name,
      image: current?.imageRef,
      deployedAt: current?.completionTime,
      drift: false,
      pods: [],
      services: [],
      resources: [],
      cloud: { target: head.target, targetLabel: head.targetLabel, resource: head.resource, consoleUrl: head.consoleUrl, latest: latestOf(head) }
    });
  });
  return { environments, history, deploys };
}

export { cloudEnvironmentsFromRuns };
//# sourceMappingURL=cloudEnvironments.esm.js.map
