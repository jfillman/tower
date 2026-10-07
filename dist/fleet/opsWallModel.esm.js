import { health, isRolloutActive, isPreviewEnvName } from '../types.esm.js';
import { runAppName } from './fleetRuns.esm.js';
import { PIPELINE_CATEGORIES, pipelineCategory } from './pipelineHistory.esm.js';
import { DEPLOYING_STATES, FAILED_STATES } from './releaseRecords.esm.js';

const MIN = 6e4;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const APPROVAL_WAIT_WARN_MS = 4 * HOUR;
const QUEUED_WARN_MS = 5 * MIN;
const SLOW_RUN_FACTOR = 3;
const SLOW_RUN_FALLBACK_SEC = 45 * 60;
const SLOW_RUN_MIN_SEC = 10 * 60;
const TYPICAL_MIN_SAMPLES = 3;
const POD_NOT_READY_MS = 5 * MIN;
const POD_RESTARTS_WARN = 3;
const PREVIEW_STALE_MS = 7 * DAY;
const SLO_BUDGET_LOW = 0.25;
const SEVERITY_RANK = { critical: 0, high: 1, warn: 2, info: 3 };
const ms = (iso) => iso ? Date.parse(iso) : NaN;
const ageMs = (now, iso) => {
  const t = ms(iso);
  return Number.isNaN(t) ? void 0 : now - t;
};
const within = (now, windowMs, iso) => {
  const a = ageMs(now, iso);
  return a !== void 0 && a <= windowMs;
};
const newestFirst = (a, b) => (ms(b) || 0) - (ms(a) || 0);
function median(values) {
  if (values.length === 0) return void 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const tower = (href, app, tab, label, params) => {
  const h = href(app, tab, params);
  return h ? [{ label, href: h }] : [];
};
const ext = (label, href) => href ? [{ label, href, external: true }] : [];
const envKey = (app, env) => `${app}|${env}`;
function canaryOf(env) {
  const p = env.workload?.kind === "Rollout" ? env.workload.canaryProgress : void 0;
  if (!p) return void 0;
  return {
    weight: p.currentWeight,
    step: p.currentStepIndex,
    steps: p.steps.length || void 0
  };
}
function runPipelineName(r) {
  return r.run.pipelineName ?? r.stage ?? r.run.name;
}
function runEnv(r) {
  return r.cloud?.env ?? r.run.params.find((p) => p.name === "env")?.value ?? "dev";
}
function typicalDurations(runs) {
  const byPipeline = /* @__PURE__ */ new Map();
  runs.forEach((r) => {
    if (r.status !== "succeeded" || r.durationSec === void 0) return;
    byPipeline.set(r.pipeline, [...byPipeline.get(r.pipeline) ?? [], r.durationSec]);
  });
  const out = /* @__PURE__ */ new Map();
  byPipeline.forEach((list, k) => {
    if (list.length >= TYPICAL_MIN_SAMPLES) out.set(k, median(list));
  });
  return out;
}
function fromLive(r) {
  const { phase } = r.run;
  if (phase !== "succeeded" && phase !== "failed" && phase !== "cancelled") return void 0;
  const pipeline = runPipelineName(r);
  const failedTask = phase === "failed" ? Object.values(r.run.taskRunsByPipelineTask).find((t) => t.phase === "failed") : void 0;
  let detail;
  if (failedTask) detail = `task ${failedTask.pipelineTaskName}${failedTask.message ? `: ${failedTask.message}` : ""}`;
  else if (phase === "failed") detail = r.run.reason;
  return {
    key: r.key,
    app: runAppName(r),
    name: r.run.name,
    pipeline,
    category: pipelineCategory(pipeline),
    status: phase,
    startTime: r.run.startTime,
    endTime: r.run.completionTime,
    durationSec: r.durationSec,
    detail,
    checkRunUrl: r.checkRunUrl,
    env: r.stage === "deploy" || r.cloud ? runEnv(r) : void 0
  };
}
function fromHistory(h) {
  const pipeline = h.pipeline ?? h.name;
  return {
    key: h.key,
    app: h.app,
    name: h.name,
    pipeline,
    category: pipelineCategory(pipeline),
    status: h.status,
    startTime: h.startTime,
    endTime: h.endTime,
    durationSec: h.durationSec
  };
}
function isSlow(elapsedSec, typicalSec) {
  if (typicalSec === void 0) return elapsedSec > SLOW_RUN_FALLBACK_SEC;
  return elapsedSec > Math.max(typicalSec * SLOW_RUN_FACTOR, SLOW_RUN_MIN_SEC);
}
const fmtMin = (sec) => sec < 120 ? `${Math.round(sec)}s` : `${Math.round(sec / 60)}m`;
function buildOpsWallModel(input) {
  const { now, windowMs, towerHref: href, appFilter } = input;
  const keep = (app) => !appFilter || appFilter.has(app);
  const apps = input.apps.filter((a) => keep(a.appName));
  const runs = input.runs.filter((r) => keep(runAppName(r)));
  const records = input.records.filter((r) => keep(r.appName));
  const slos = input.slos.filter((s) => keep(s.service));
  const provisioning = input.provisioning.filter((p) => keep(p.name));
  const attention = [];
  const add = (item) => attention.push(item);
  const shownCategory = (pipeline) => !input.pipelineCategories || input.pipelineCategories.has(pipelineCategory(pipeline));
  const history = (input.history ?? []).filter((h) => keep(h.app));
  const finishedByKey = /* @__PURE__ */ new Map();
  history.forEach((h) => finishedByKey.set(h.key, fromHistory(h)));
  runs.forEach((r) => {
    const f = fromLive(r);
    if (f) finishedByKey.set(f.key, f);
  });
  const finishedAll = [...finishedByKey.values()];
  const typical = typicalDurations(finishedAll);
  const pipelineCounts = Object.fromEntries(PIPELINE_CATEGORIES.map((c) => [c, 0]));
  const live = runs.filter((r) => r.run.phase === "running" || r.run.phase === "pending");
  live.forEach((r) => {
    pipelineCounts[pipelineCategory(runPipelineName(r))] += 1;
  });
  finishedAll.forEach((f) => {
    if (within(now, windowMs, f.endTime)) pipelineCounts[f.category] += 1;
  });
  const shownLive = live.filter((r) => shownCategory(runPipelineName(r)));
  const pipelines = shownLive.map((r) => {
    const app = runAppName(r);
    const pipeline = runPipelineName(r);
    const startedAgo = ageMs(now, r.run.startTime);
    const elapsedSec = startedAgo === void 0 ? void 0 : Math.max(0, Math.round(startedAgo / 1e3));
    const typicalSec = typical.get(pipeline);
    const slow = r.run.phase === "running" && elapsedSec !== void 0 && isSlow(elapsedSec, typicalSec);
    const queuedLong = r.run.phase === "pending" && startedAgo !== void 0 && startedAgo > QUEUED_WARN_MS;
    return {
      key: r.key,
      app,
      pipeline,
      category: pipelineCategory(pipeline),
      stage: r.stage,
      phase: r.run.phase,
      progress: r.progress,
      startedAt: r.run.startTime,
      elapsedSec,
      typicalSec,
      slow,
      queuedLong,
      title: r.title,
      sha: r.run.sha?.slice(0, 7),
      author: r.run.author,
      prNumber: r.prNumber,
      eventType: r.run.eventType,
      links: [
        ...tower(href, app, "pipelines", "Run", { run: r.run.name }),
        ...ext("Check", r.checkRunUrl),
        ...ext("Commit", r.shaUrl)
      ]
    };
  });
  pipelines.forEach((p) => {
    if (p.slow) {
      add({
        id: `slow:${p.key}`,
        rule: "pipeline-slow",
        severity: "high",
        app: p.app,
        title: `${p.pipeline} running ${fmtMin(p.elapsedSec ?? 0)}`,
        detail: p.typicalSec !== void 0 ? `usually ${fmtMin(p.typicalSec)}` : "no typical duration yet",
        since: p.startedAt,
        links: p.links
      });
    }
    if (p.queuedLong) {
      add({
        id: `queued:${p.key}`,
        rule: "pipeline-queued",
        severity: "warn",
        app: p.app,
        title: `${p.pipeline} queued, not started`,
        since: p.startedAt,
        links: p.links
      });
    }
  });
  const latestByPipeline = /* @__PURE__ */ new Map();
  const consider = (app, pipeline, startTime, failed) => {
    if (!shownCategory(pipeline)) return;
    const k = `${app}|${pipeline}`;
    const prev = latestByPipeline.get(k);
    if (!prev || (ms(startTime) || 0) > (ms(prev.startTime) || 0)) latestByPipeline.set(k, { startTime, failed });
  };
  live.forEach((r) => consider(runAppName(r), runPipelineName(r), r.run.startTime));
  finishedAll.forEach((f) => consider(f.app, f.pipeline, f.startTime, f.status === "failed" ? f : void 0));
  latestByPipeline.forEach(({ failed: f }) => {
    if (!f) return;
    add({
      id: `failed:${f.key}`,
      rule: "pipeline-failed",
      severity: "high",
      app: f.app,
      env: f.env,
      title: `${f.pipeline} failed`,
      detail: f.detail,
      since: f.endTime ?? f.startTime,
      links: [...tower(href, f.app, "pipelines", "Run", { run: f.name }), ...ext("Check", f.checkRunUrl)]
    });
  });
  const recentRuns = finishedAll.filter((f) => shownCategory(f.pipeline) && within(now, windowMs, f.endTime)).sort((a, b) => newestFirst(a.endTime, b.endTime));
  const pipelineStats = {
    runs: recentRuns.length,
    failedRuns: recentRuns.filter((f) => f.status === "failed").length,
    p50Sec: median(recentRuns.map((f) => f.durationSec).filter((d) => d !== void 0))
  };
  const deployments = [];
  const deploymentKeys = /* @__PURE__ */ new Set();
  const envByKey = /* @__PURE__ */ new Map();
  apps.forEach((a) => a.environments.forEach((e) => envByKey.set(envKey(a.appName, e.env), e)));
  records.filter((r) => DEPLOYING_STATES.has(r.state)).forEach((r) => {
    const env = envByKey.get(envKey(r.appName, r.env));
    const bad = r.state === "sync-failed";
    deploymentKeys.add(envKey(r.appName, r.env));
    deployments.push({
      key: `release:${r.namespace}/${r.name}`,
      kind: "release",
      app: r.appName,
      env: r.env,
      cluster: r.cluster,
      state: r.state.replace("-", " "),
      tone: bad ? "bad" : "active",
      detail: bad ? r.lastError : void 0,
      startedAt: r.mergedAt ?? r.stateAt,
      canary: env ? canaryOf(env) : void 0,
      links: [...tower(href, r.appName, "deployments", "Deployment", { env: r.env }), ...ext("PR", r.prUrl)]
    });
    if (bad) {
      add({
        id: `sync-failed:${r.name}`,
        rule: "release-sync-failed",
        severity: "critical",
        app: r.appName,
        env: r.env,
        title: `Release to ${r.env} failed to sync`,
        detail: r.lastError,
        since: r.stateAt,
        links: [...tower(href, r.appName, "deployments", "Deployment", { env: r.env }), ...ext("PR", r.prUrl)]
      });
    }
  });
  live.filter((r) => r.cloud || r.stage === "deploy").forEach((r) => {
    const app = runAppName(r);
    const env = runEnv(r);
    const k = envKey(app, env);
    if (deploymentKeys.has(k)) return;
    deploymentKeys.add(k);
    deployments.push({
      key: `run:${r.key}`,
      kind: r.cloud ? "cloud" : "ground",
      app,
      env,
      state: "deploy pipeline",
      tone: "active",
      target: r.cloud?.targetLabel,
      startedAt: r.run.startTime,
      progress: r.progress,
      links: [...tower(href, app, "pipelines", "Run", { run: r.run.name }), ...ext("Console", r.cloud?.consoleUrl)]
    });
  });
  apps.forEach(
    (a) => a.environments.forEach((e) => {
      const k = envKey(a.appName, e.env);
      const paused = health(e) === "paused";
      if (deploymentKeys.has(k) || !isRolloutActive(e) && !paused) return;
      deploymentKeys.add(k);
      deployments.push({
        key: `rollout:${a.appName}/${e.cluster}/${e.namespace}`,
        kind: "rollout",
        app: a.appName,
        env: e.env,
        cluster: e.cluster,
        state: paused ? "paused" : "rolling out",
        tone: paused ? "paused" : "active",
        detail: e.rolloutMessage,
        startedAt: e.deployedAt,
        canary: canaryOf(e),
        links: tower(href, a.appName, "deployments", "Deployment", { env: e.env })
      });
    })
  );
  deployments.sort((a, b) => newestFirst(a.startedAt, b.startedAt) || a.app.localeCompare(b.app));
  const approvals = records.filter((r) => r.state === "proposed").map((r) => ({
    key: `${r.namespace}/${r.name}`,
    app: r.appName,
    env: r.env,
    cluster: r.cluster,
    since: r.prCreatedAt ?? r.stateAt,
    prUrl: r.prUrl
  })).sort((a, b) => ms(a.since) - ms(b.since));
  approvals.forEach((a) => {
    const waited = ageMs(now, a.since);
    if (waited === void 0 || waited < APPROVAL_WAIT_WARN_MS) return;
    add({
      id: `approval:${a.key}`,
      rule: "release-awaiting-merge",
      severity: "warn",
      app: a.app,
      env: a.env,
      title: `Release PR to ${a.env} waiting for merge`,
      detail: a.cluster ? `on ${a.cluster}` : void 0,
      since: a.since,
      links: [...ext("PR", a.prUrl), ...tower(href, a.app, "deployments", "Deployment", { env: a.env })]
    });
  });
  const newerHealthy = (r) => records.some(
    (o) => o !== r && o.appName === r.appName && o.env === r.env && o.cluster === r.cluster && (o.state === "healthy" || o.state === "superseded") && ms(o.stateAt) > ms(r.stateAt)
  );
  records.filter((r) => FAILED_STATES.has(r.state) && within(now, windowMs, r.stateAt) && !newerHealthy(r)).forEach(
    (r) => add({
      id: `release-failed:${r.name}`,
      rule: "release-failed",
      severity: "critical",
      app: r.appName,
      env: r.env,
      title: `Release to ${r.env} ${r.state === "aborted" ? "aborted" : "degraded"}`,
      detail: r.lastError,
      since: r.stateAt,
      links: [...tower(href, r.appName, "deployments", "Deployment", { env: r.env }), ...ext("PR", r.prUrl)]
    })
  );
  const recordByName = new Map(records.map((r) => [`${r.namespace}/${r.name}`, r]));
  const latestEvent = /* @__PURE__ */ new Map();
  input.events.forEach((e) => {
    if (!within(now, windowMs, e.at)) return;
    const k = `${e.reason}|${e.namespace}/${e.recordName}`;
    const prev = latestEvent.get(k);
    if (!prev || ms(e.at) > ms(prev.at)) latestEvent.set(k, e);
  });
  latestEvent.forEach((e) => {
    const r = recordByName.get(`${e.namespace}/${e.recordName}`);
    if (!r) return;
    if (e.reason === "ReleaseStalled" && !DEPLOYING_STATES.has(r.state)) return;
    const stalled = e.reason === "ReleaseStalled";
    add({
      id: `${e.reason}:${r.name}`,
      rule: stalled ? "release-stalled" : "release-drift",
      severity: stalled ? "high" : "warn",
      app: r.appName,
      env: r.env,
      title: stalled ? `Release to ${r.env} stalled` : `Live ${r.env} drifted from its release`,
      detail: e.message ?? (stalled ? void 0 : r.drift),
      since: e.at,
      links: tower(href, r.appName, stalled ? "deployments" : "topology", stalled ? "Deployment" : "Topology", {
        env: r.env
      })
    });
  });
  let envsTotal = 0;
  let envsFailing = 0;
  let outOfSync = 0;
  let pausedRollouts = 0;
  apps.forEach(
    (a) => a.environments.forEach((e) => {
      envsTotal += 1;
      const h = health(e);
      const deploying = deployments.some((d) => d.app === a.appName && d.env === e.env && d.kind !== "rollout");
      const links = tower(href, a.appName, "deployments", "Deployment", { env: e.env });
      if (e.argoSyncStatus === "OutOfSync") outOfSync += 1;
      if (h === "degraded") {
        envsFailing += 1;
        add({
          id: `degraded:${a.appName}/${e.cluster}/${e.namespace}`,
          rule: "env-degraded",
          severity: "critical",
          app: a.appName,
          env: e.env,
          title: `${e.env} is degraded`,
          detail: e.rolloutMessage || e.argoOperationMessage || (e.argoHealthStatus ? `Argo CD: ${e.argoHealthStatus}` : void 0),
          since: e.argoHealthSince,
          links
        });
        return;
      }
      if (h === "paused") {
        pausedRollouts += 1;
        const c = canaryOf(e);
        add({
          id: `paused:${a.appName}/${e.cluster}/${e.namespace}`,
          rule: "rollout-paused",
          severity: "warn",
          app: a.appName,
          env: e.env,
          title: `Rollout in ${e.env} paused`,
          detail: c?.weight !== void 0 ? `canary at ${c.weight}%${c.step !== void 0 && c.steps ? `, step ${c.step + 1} of ${c.steps}` : ""}: waiting for promotion` : "waiting for promotion",
          links
        });
      }
      if (e.argoSyncStatus === "OutOfSync" && !deploying && e.argoOperationPhase !== "Running") {
        add({
          id: `out-of-sync:${a.appName}/${e.cluster}/${e.namespace}`,
          rule: "argo-out-of-sync",
          severity: "warn",
          app: a.appName,
          env: e.env,
          title: `${e.env} is out of sync with git`,
          detail: e.argoAppName ? `Argo CD app ${e.argoAppName}` : void 0,
          since: e.argoReconciledAt,
          links
        });
      }
      const sick = e.pods.filter((p) => {
        if (p.ready || p.phase === "Succeeded") return false;
        const age = ageMs(now, p.startTime);
        return p.restarts >= POD_RESTARTS_WARN || age !== void 0 && age > POD_NOT_READY_MS;
      });
      if (sick.length > 0) {
        add({
          id: `pods:${a.appName}/${e.cluster}/${e.namespace}`,
          rule: "pods-not-ready",
          severity: "warn",
          app: a.appName,
          env: e.env,
          title: `${sick.length} pod${sick.length === 1 ? "" : "s"} not ready in ${e.env}`,
          detail: sick.slice(0, 2).map((p) => `${p.name} (${p.restarts} restart${p.restarts === 1 ? "" : "s"})`).join(", "),
          links: tower(href, a.appName, "topology", "Topology", { env: e.env })
        });
      }
      const previewAge = ageMs(now, e.deployedAt);
      if (isPreviewEnvName(e.env) && previewAge !== void 0 && previewAge > PREVIEW_STALE_MS) {
        add({
          id: `preview:${a.appName}/${e.namespace}`,
          rule: "preview-stale",
          severity: "info",
          app: a.appName,
          env: e.env,
          title: `Preview ${e.env} untouched for ${Math.floor(previewAge / DAY)}d`,
          since: e.deployedAt,
          links: tower(href, a.appName, "environments", "Environments")
        });
      }
    })
  );
  slos.forEach((s) => {
    const links = tower(href, s.service, "slos", "SLOs");
    if (s.periodBurnRate !== void 0 && s.periodBurnRate > 1) {
      add({
        id: `slo:${s.cluster}/${s.service}/${s.slo}`,
        rule: "slo-budget-exhausted",
        severity: "high",
        app: s.service,
        title: `SLO ${s.slo} out of error budget`,
        detail: `burning at ${s.periodBurnRate.toFixed(2)}x over the period`,
        links
      });
    } else if (s.budgetRemaining !== void 0 && s.budgetRemaining < SLO_BUDGET_LOW) {
      add({
        id: `slo-low:${s.cluster}/${s.service}/${s.slo}`,
        rule: "slo-budget-low",
        severity: "warn",
        app: s.service,
        title: `SLO ${s.slo} has ${Math.max(0, Math.round(s.budgetRemaining * 100))}% budget left`,
        links
      });
    }
  });
  provisioning.forEach((p) => {
    if (!p.failed && !p.stalled) return;
    add({
      id: `provisioning:${p.name}`,
      rule: p.failed ? "provisioning-failed" : "provisioning-stalled",
      severity: p.failed ? "high" : "warn",
      app: p.name,
      title: p.failed ? "Provisioning failed" : "Provisioning stalled",
      since: p.since,
      links: []
    });
  });
  attention.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (ms(a.since) || Infinity) - (ms(b.since) || Infinity) || a.app.localeCompare(b.app)
  );
  const landed = [
    ...records.filter((r) => (r.state === "healthy" || FAILED_STATES.has(r.state)) && within(now, windowMs, r.stateAt)).map((r) => ({
      key: `release:${r.namespace}/${r.name}`,
      app: r.appName,
      env: r.env,
      cluster: r.cluster,
      kind: "release",
      ok: r.state === "healthy",
      at: r.stateAt,
      links: [...tower(href, r.appName, "deployments", "Deployment", { env: r.env }), ...ext("PR", r.prUrl)]
    })),
    ...runs.filter(
      (r) => (r.cloud || r.stage === "deploy") && (r.run.phase === "succeeded" || r.run.phase === "failed") && within(now, windowMs, r.run.completionTime)
    ).map((r) => ({
      key: `run:${r.key}`,
      app: runAppName(r),
      env: runEnv(r),
      kind: r.cloud ? "cloud" : "ground",
      ok: r.run.phase === "succeeded",
      at: r.run.completionTime,
      links: tower(href, runAppName(r), "pipelines", "Run", { run: r.run.name })
    }))
  ].sort((a, b) => newestFirst(a.at, b.at));
  const canaries = deployments.filter((d) => d.canary?.weight !== void 0 && d.canary.weight < 100).length;
  return {
    kpis: {
      pipelinesRunning: shownLive.filter((r) => r.run.phase === "running").length,
      pipelinesQueued: shownLive.filter((r) => r.run.phase === "pending").length,
      slowRuns: pipelines.filter((p) => p.slow).length,
      deploying: deployments.length,
      canaries,
      awaitingApproval: approvals.length,
      oldestApprovalSince: approvals[0]?.since,
      envsFailing,
      envsTotal,
      outOfSync,
      pausedRollouts
    },
    attention,
    pipelines,
    recentRuns,
    pipelineStats,
    pipelineCounts,
    deployments,
    approvals,
    landed
  };
}

export { APPROVAL_WAIT_WARN_MS, POD_NOT_READY_MS, POD_RESTARTS_WARN, PREVIEW_STALE_MS, QUEUED_WARN_MS, SLOW_RUN_FACTOR, SLOW_RUN_FALLBACK_SEC, SLOW_RUN_MIN_SEC, SLO_BUDGET_LOW, TYPICAL_MIN_SAMPLES, buildOpsWallModel, canaryOf, isSlow, typicalDurations };
//# sourceMappingURL=opsWallModel.esm.js.map
