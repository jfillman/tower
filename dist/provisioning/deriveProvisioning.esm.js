const FUNCTION_KINDS = /* @__PURE__ */ new Set(["LambdaFunction", "AzureFunction"]);
const STALL_AFTER_MS = 4 * 3600 * 1e3;
const TYPICAL_SEC = {
  request: 2,
  cluster: 10,
  cicd: 30,
  repos: 45,
  // The ingestor picks the new XR up on its next sync, so this is a guess at one cycle.
  catalog: 60,
  // A person merging two PRs, so this is a guess at a prompt human.
  onboarding: 120,
  secrets: 25,
  build: 150,
  running: 60
};
const DEPLOY_GRACE_MS = 5 * 60 * 1e3;
const ts = (iso) => iso ? Date.parse(iso) : void 0;
const secBetween = (a, b) => a !== void 0 && b !== void 0 ? Math.max(0, Math.round((b - a) / 1e3)) : void 0;
const stateOf = (done, ready) => {
  if (done) return "done";
  return ready ? "run" : "pend";
};
function cond(xr, type) {
  return xr.conditions.find((c) => c.type === type);
}
const prLink = (label, pr) => pr ? [{ label: `${label} #${pr.number}`, url: pr.url, state: pr.state }] : [];
const INFISICAL_HOST_BY_CLUSTER = { "kind-dev": "infisical.dev.kiac.local" };
const infisicalProjectUrl = (cluster, projectId) => {
  const host = INFISICAL_HOST_BY_CLUSTER[cluster];
  return host ? `http://${host}/projects/secret-management/${projectId}/overview` : void 0;
};
function deriveProvisioning(input, now) {
  const { xr, build, rollout, managed, secrets, catalog, cicdApp, cloudDeploy, links } = input;
  const isFunction = FUNCTION_KINDS.has(xr.kind);
  const cloudFinal = isFunction || Boolean(cloudDeploy);
  const created = xr.createdAt;
  const synced = cond(xr, "Synced");
  const ready = cond(xr, "Ready");
  const clusterC = cond(xr, "DevClusterReady");
  const cicdC = cond(xr, "CicdOnboarded");
  const syncFailed = synced?.status === "False";
  const steps = [];
  const push = (s) => steps.push({
    typicalSec: TYPICAL_SEC[s.id],
    fraction: s.state === "done" ? 1 : 0,
    ...s
  });
  const pending = Boolean(xr.pending);
  const reqPr = links?.requestPr;
  let requestState = "done";
  let requestDetail;
  if (pending) {
    requestState = "run";
    requestDetail = reqPr?.state === "merged" ? "Merged. ArgoCD polls the repo about every 3 minutes, then creates the resource" : "Merge the request PR to start provisioning";
  }
  push({
    id: "request",
    title: "Request accepted",
    desc: "Claim validated against the Airframe schema",
    state: requestState,
    seconds: pending ? secBetween(created, now) : 0,
    detail: requestDetail,
    links: prLink("Request PR", reqPr)
  });
  const clusterDone = clusterC?.status === "True";
  let clusterStepState = clusterDone ? "done" : "run";
  if (pending) clusterStepState = "pend";
  push({
    id: "cluster",
    title: "Dev cluster chosen",
    desc: "A registered, ready dev cluster is selected for onboarding",
    state: clusterStepState,
    seconds: clusterDone ? secBetween(created, ts(clusterC?.lastTransitionTime)) : void 0,
    detail: !clusterDone && clusterC?.message ? clusterC.message : void 0
  });
  if (!clusterDone && !pending) steps[1].seconds = secBetween(created, now);
  const cicdCommitted = cicdC?.status === "True";
  const cicdSettled = !cicdApp || cicdApp.sync === "Synced" && cicdApp.health === "Healthy";
  const cicdDone = cicdCommitted && cicdSettled;
  const cicdWaiting = cicdCommitted && cicdApp && !cicdSettled ? `Committed. ArgoCD app ${cicdApp.name} is ${cicdApp.sync ?? "unknown"} / ${cicdApp.health ?? "unknown"}${cicdApp.health === "Degraded" ? " (a sync hook failed; see the app in ArgoCD)" : ""}` : void 0;
  push({
    id: "cicd",
    title: "CI/CD onboarded",
    desc: "Tenant identity committed; the pipeline namespace is stood up",
    state: stateOf(cicdDone, clusterDone),
    seconds: cicdDone ? secBetween(ts(clusterC?.lastTransitionTime), ts(cicdC?.lastTransitionTime)) : void 0,
    detail: cicdWaiting ?? (!cicdDone && cicdC?.message ? cicdC.message : void 0)
  });
  let reposState;
  let reposFraction = 0;
  let reposEnd;
  if (managed && managed.length > 0) {
    const nReady = managed.filter((m) => m.ready).length;
    reposFraction = nReady / managed.length;
    reposState = nReady === managed.length ? "done" : "run";
    reposEnd = Math.max(...managed.map((m) => m.readyAt ?? 0)) || void 0;
  } else {
    reposState = ready?.status === "True" ? "done" : "run";
    reposEnd = ts(ready?.lastTransitionTime);
    reposFraction = reposState === "done" ? 1 : 0;
  }
  if (pending) reposState = "pend";
  if (syncFailed && reposState !== "done") reposState = "fail";
  let reposSeconds;
  if (reposState === "done") reposSeconds = secBetween(created, reposEnd);
  else if (reposState !== "pend") reposSeconds = secBetween(created, now);
  push({
    id: "repos",
    title: "Repositories and starter files",
    desc: isFunction ? "Source repo created, starter files committed" : "Source and GitOps repos created, starter files committed",
    state: reposState,
    fraction: reposFraction,
    seconds: reposSeconds,
    detail: reposState === "fail" ? synced?.message : void 0,
    parallel: true,
    links: [
      ...links?.sourceRepoUrl ? [{ label: "Source repo", url: links.sourceRepoUrl }] : [],
      ...links?.gitopsRepoUrl ? [{ label: "GitOps repo", url: links.gitopsRepoUrl }] : []
    ]
  });
  const front = steps.slice(2, 4).every((s) => s.state === "done");
  const builtOrDeployed = Boolean(build) || Boolean(rollout) || Boolean(cloudDeploy);
  let catalogState = "pend";
  if (catalog?.found) catalogState = "done";
  else if (catalog) catalogState = "run";
  else if (builtOrDeployed) catalogState = "done";
  push({
    id: "catalog",
    title: "Available in the Backstage catalog",
    desc: "The catalog ingestor has picked the service up, so it can be opened in Tower",
    state: catalogState,
    seconds: catalogState === "run" ? secBetween(created, now) : void 0,
    detail: catalogState === "run" ? "Waiting for the catalog ingestor's next sync" : void 0,
    parallel: true
  });
  const ob = links?.onboarding;
  const obPrs = isFunction ? [ob?.source] : [ob?.source, ob?.gitops];
  const expectedPrs = obPrs.length;
  const merged = obPrs.filter((pr) => pr?.state === "merged");
  let onboardingState = "pend";
  let onboardingFraction = 0;
  let onboardingDetail;
  let onboardingEnd;
  const mergePrompt = isFunction ? "Merge the onboarding PR to start the first build" : "Merge the two onboarding PRs to start the first build";
  if (builtOrDeployed || ob && merged.length === expectedPrs) {
    onboardingState = "done";
    onboardingFraction = 1;
    onboardingEnd = merged.length ? Math.max(...merged.map((pr) => pr?.mergedAt ?? 0)) || void 0 : void 0;
  } else if (front) {
    onboardingState = "run";
    if (!ob) {
      onboardingDetail = mergePrompt;
    } else if (isFunction) {
      onboardingFraction = merged.length / expectedPrs;
      onboardingDetail = ob.source ? mergePrompt : "Waiting for onboarding to open its PR";
    } else {
      onboardingFraction = merged.length / expectedPrs;
      const missing = obPrs.filter((pr) => !pr).length;
      if (missing === 2) onboardingDetail = "Waiting for onboarding to open its two PRs";
      else if (missing === 1) onboardingDetail = "Waiting for onboarding to open the second PR";
      else onboardingDetail = `Merge the two onboarding PRs to start the first build (${merged.length} of 2 merged)`;
    }
  }
  const onboardingStart = Math.max(
    ts(clusterC?.lastTransitionTime) ?? 0,
    ts(cicdC?.lastTransitionTime) ?? 0,
    reposState === "done" ? reposEnd ?? 0 : 0
  );
  let onboardingSeconds;
  if (onboardingState === "done") onboardingSeconds = secBetween(onboardingStart || void 0, onboardingEnd);
  else if (onboardingState === "run") onboardingSeconds = secBetween(onboardingStart || void 0, now);
  push({
    id: "onboarding",
    title: isFunction ? "Application onboarding PR" : "Application onboarding PRs",
    desc: isFunction ? "One PR on the source repo adds the pipeline files. Merging it starts the build" : "Two PRs, source repo and GitOps repo, add the pipeline files. Merging the source one starts the build",
    state: onboardingState,
    fraction: onboardingFraction,
    seconds: onboardingSeconds,
    detail: onboardingDetail,
    links: [...prLink("Source PR", ob?.source), ...prLink("GitOps PR", ob?.gitops)]
  });
  let secretsState = "pend";
  let secretsDetail;
  if (secrets?.ready) {
    secretsState = "done";
  } else if (secrets?.failed) {
    secretsState = "fail";
    secretsDetail = secrets.failed;
  } else if (!secrets?.found && builtOrDeployed) {
    secretsState = "done";
  } else if (cicdDone) {
    secretsState = "run";
    secretsDetail = secrets?.found ? "Creating the Infisical project and identity" : "Waiting for the SecretStore to be created";
  }
  const projectUrl = links?.infisicalProjectId ? infisicalProjectUrl(xr.cluster, links.infisicalProjectId) : void 0;
  let secretsSeconds;
  if (secretsState === "done") secretsSeconds = secBetween(ts(cicdC?.lastTransitionTime), secrets?.readyAt);
  else if (secretsState === "run") secretsSeconds = secBetween(ts(cicdC?.lastTransitionTime), now);
  push({
    id: "secrets",
    title: "Infisical secrets resources",
    desc: "Project, machine identity and the cluster secret store that reads it",
    state: secretsState,
    seconds: secretsSeconds,
    detail: secretsDetail,
    parallel: true,
    links: projectUrl ? [{ label: "Infisical project", url: projectUrl }] : []
  });
  let buildState = "pend";
  let buildFraction = 0;
  let buildSec;
  let buildDetail;
  if (build) {
    buildFraction = build.tasksTotal > 0 ? Math.min(1, build.tasksDone / build.tasksTotal) : 0;
    if (build.phase === "succeeded") buildState = "done";
    else if (build.phase === "failed") buildState = "fail";
    else buildState = "run";
    buildSec = secBetween(build.startedAt, build.completedAt ?? now);
    if (buildState === "fail") buildDetail = `${build.name} failed`;
  } else if (rollout) {
    buildState = "done";
  } else if (onboardingState === "done") {
    buildState = "run";
    buildDetail = "Waiting for the first pipeline run to start";
  }
  push({
    id: "build",
    title: "First build and checks",
    desc: "Test, image build, scan, SBOM and signature. Starts by itself when the source onboarding PR merges",
    state: buildState,
    fraction: buildState === "done" ? 1 : buildFraction,
    seconds: buildSec,
    detail: buildDetail
  });
  let runState = "pend";
  let runFraction = 0;
  let runSec;
  let runDetail;
  let runTitle = "Running healthy in dev";
  let runDesc = "Rollout reaches its desired replicas on the dev cluster";
  let runLinks;
  if (cloudFinal) {
    const where = cloudDeploy?.label ?? "the cloud target";
    runTitle = `Deployed to ${where}`;
    runDesc = "The deploy stage updates the existing cloud resource to the new image";
    if (cloudDeploy?.consoleUrl) runLinks = [{ label: "Open in console", url: cloudDeploy.consoleUrl }];
    if (cloudDeploy?.state === "succeeded") {
      runState = "done";
      runFraction = 1;
    } else if (cloudDeploy?.state === "failed") {
      runState = "fail";
      runDetail = cloudDeploy.failure ?? "The deploy failed";
    } else if (cloudDeploy?.state === "running") {
      runState = "run";
      runSec = secBetween(build?.completedAt, now);
    } else if (buildState === "done") {
      runState = "run";
      runDetail = "Waiting for the deploy stage to start";
      runSec = secBetween(build?.completedAt, now);
    }
  } else if (rollout) {
    const healthy = rollout.phase === "Healthy" && rollout.available >= rollout.desired && rollout.desired > 0;
    if (healthy) runState = "done";
    else if (rollout.phase === "Degraded") runState = "fail";
    else runState = "run";
    runFraction = rollout.desired > 0 ? Math.min(1, rollout.available / rollout.desired) : 0;
    runSec = healthy ? void 0 : secBetween(build?.completedAt ?? rollout.createdAt, now);
    if (runState === "fail") runDetail = "The rollout reports Degraded";
  } else if (buildState === "done") {
    runState = "run";
    if (build?.completedAt !== void 0 && now - build.completedAt > DEPLOY_GRACE_MS) {
      runDetail = "No rollout yet. The deploy stage needs a platform/envs/dev.yaml in the source repo and a deploy stage for dev in cicd.yaml";
    }
  }
  push({
    id: "running",
    title: runTitle,
    desc: runDesc,
    state: runState,
    fraction: runState === "done" ? 1 : runFraction,
    seconds: runSec,
    detail: runDetail,
    links: runLinks
  });
  const complete = steps.every((s) => s.state === "done");
  const failed = steps.some((s) => s.state === "fail");
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
  const remaining = (id) => {
    const s = byId[id];
    return s.state === "done" ? 0 : s.typicalSec * (1 - s.fraction);
  };
  const etaSec = Math.round(
    remaining("request") + remaining("cluster") + Math.max(remaining("cicd"), remaining("repos"), remaining("catalog")) + Math.max(remaining("onboarding"), remaining("secrets")) + remaining("build") + remaining("running")
  );
  const elapsedSec = Math.round((now - created) / 1e3);
  const percent = complete ? 100 : Math.min(99, Math.round(100 * elapsedSec / Math.max(1, elapsedSec + etaSec)));
  let completedAt;
  if (complete) {
    const ends = [
      ts(clusterC?.lastTransitionTime),
      ts(cicdC?.lastTransitionTime),
      reposEnd,
      onboardingEnd,
      secrets?.readyAt,
      build?.completedAt,
      rollout?.createdAt,
      cloudDeploy?.completedAt
    ].filter((x) => x !== void 0);
    completedAt = ends.length ? Math.max(...ends) : now;
  }
  const deployed = Boolean(rollout) || cloudDeploy?.state === "succeeded";
  const stalled = !complete && !failed && !deployed && build?.phase === "succeeded" && now - created > STALL_AFTER_MS;
  return { steps, complete, failed, elapsedSec, etaSec, percent, completedAt, stalled };
}

export { FUNCTION_KINDS, STALL_AFTER_MS, TYPICAL_SEC, deriveProvisioning, infisicalProjectUrl };
//# sourceMappingURL=deriveProvisioning.esm.js.map
