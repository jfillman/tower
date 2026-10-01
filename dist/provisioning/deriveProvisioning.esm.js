const STALL_AFTER_MS = 4 * 3600 * 1e3;
const TYPICAL_SEC = {
  request: 2,
  cluster: 10,
  cicd: 30,
  repos: 45,
  build: 150,
  running: 60
};
const ts = (iso) => iso ? Date.parse(iso) : void 0;
const secBetween = (a, b) => a !== void 0 && b !== void 0 ? Math.max(0, Math.round((b - a) / 1e3)) : void 0;
const stateOf = (done, ready) => {
  if (done) return "done";
  return ready ? "run" : "pend";
};
function cond(xr, type) {
  return xr.conditions.find((c) => c.type === type);
}
function deriveProvisioning(input, now) {
  const { xr, build, rollout, managed } = input;
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
  push({
    id: "request",
    title: "Request accepted",
    desc: "Claim validated against the Airframe schema",
    state: "done",
    seconds: 0
  });
  const clusterDone = clusterC?.status === "True";
  push({
    id: "cluster",
    title: "Dev cluster chosen",
    desc: "A registered, ready dev cluster is selected for onboarding",
    state: clusterDone ? "done" : "run",
    seconds: clusterDone ? secBetween(created, ts(clusterC?.lastTransitionTime)) : secBetween(created, now),
    detail: !clusterDone && clusterC?.message ? clusterC.message : void 0
  });
  const cicdDone = cicdC?.status === "True";
  push({
    id: "cicd",
    title: "CI/CD onboarded",
    desc: "Tenant identity committed; the pipeline namespace is stood up",
    state: stateOf(cicdDone, clusterDone),
    seconds: cicdDone ? secBetween(ts(clusterC?.lastTransitionTime), ts(cicdC?.lastTransitionTime)) : void 0,
    detail: !cicdDone && cicdC?.message ? cicdC.message : void 0
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
  if (syncFailed && reposState !== "done") reposState = "fail";
  push({
    id: "repos",
    title: "Repositories and starter files",
    desc: "Source and GitOps repos created, starter files committed",
    state: reposState,
    fraction: reposFraction,
    seconds: reposState === "done" ? secBetween(created, reposEnd) : secBetween(created, now),
    detail: reposState === "fail" ? synced?.message : void 0,
    parallel: true
  });
  const front = steps.slice(2, 4).every((s) => s.state === "done");
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
  } else if (front) {
    buildState = "run";
    buildDetail = "Waiting for the first pipeline run to start";
  }
  push({
    id: "build",
    title: "First build and checks",
    desc: "Test, image build, scan, SBOM and signature",
    state: buildState,
    fraction: buildState === "done" ? 1 : buildFraction,
    seconds: buildSec,
    detail: buildDetail
  });
  let runState = "pend";
  let runFraction = 0;
  let runSec;
  if (rollout) {
    const healthy = rollout.phase === "Healthy" && rollout.available >= rollout.desired && rollout.desired > 0;
    if (healthy) runState = "done";
    else if (rollout.phase === "Degraded") runState = "fail";
    else runState = "run";
    runFraction = rollout.desired > 0 ? Math.min(1, rollout.available / rollout.desired) : 0;
    runSec = healthy ? void 0 : secBetween(build?.completedAt ?? rollout.createdAt, now);
  } else if (buildState === "done") {
    runState = "run";
  }
  push({
    id: "running",
    title: "Running healthy in dev",
    desc: "Rollout reaches its desired replicas on the dev cluster",
    state: runState,
    fraction: runState === "done" ? 1 : runFraction,
    seconds: runSec,
    detail: runState === "fail" ? "The rollout reports Degraded" : void 0
  });
  const complete = steps.every((s) => s.state === "done");
  const failed = steps.some((s) => s.state === "fail");
  const remaining = (s) => s.state === "done" ? 0 : s.typicalSec * (1 - s.fraction);
  const etaSec = Math.round(
    remaining(steps[0]) + remaining(steps[1]) + Math.max(remaining(steps[2]), remaining(steps[3])) + remaining(steps[4]) + remaining(steps[5])
  );
  const elapsedSec = Math.round((now - created) / 1e3);
  const percent = complete ? 100 : Math.min(99, Math.round(100 * elapsedSec / Math.max(1, elapsedSec + etaSec)));
  let completedAt;
  if (complete) {
    const ends = [
      ts(clusterC?.lastTransitionTime),
      ts(cicdC?.lastTransitionTime),
      reposEnd,
      build?.completedAt,
      rollout?.createdAt
    ].filter((x) => x !== void 0);
    completedAt = ends.length ? Math.max(...ends) : now;
  }
  const stalled = !complete && !failed && !rollout && build?.phase === "succeeded" && now - created > STALL_AFTER_MS;
  return { steps, complete, failed, elapsedSec, etaSec, percent, completedAt, stalled };
}

export { STALL_AFTER_MS, TYPICAL_SEC, deriveProvisioning };
//# sourceMappingURL=deriveProvisioning.esm.js.map
