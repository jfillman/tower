import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy.esm.js';
import { chainIdToSlug } from './chainSlug.esm.js';

const TEKTON_CLUSTER = "kind-dev";
const POLL_MS = 6e3;
function paramValueToString(value) {
  if (typeof value === "string") return value;
  if (value === void 0 || value === null) return "";
  return JSON.stringify(value);
}
function field(meta, name) {
  return meta.labels?.[name] ?? meta.annotations?.[name];
}
const GUARDRAIL_PIPELINE_NAMES = [
  "sast-check",
  "image-scan-check",
  "provenance-check",
  "sbom-check",
  "governance-check",
  "qa-check",
  "bypass-merge-check"
];
const RELEASE_TRACKING_SUBCOMPONENTS = ["release-outcome", "release-progress"];
function hangarField(meta, suffix) {
  return field(meta, `hangar.io/${suffix}`) ?? field(meta, `platform.io/${suffix}`);
}
function resolveTaskRefName(ref) {
  if (!ref) return void 0;
  return ref.resolver === "cluster" ? ref.params?.find((p) => p.name === "name")?.value : ref.name;
}
function toTaskDef(t) {
  return { name: t.name, runAfter: t.runAfter ?? [], taskRefName: resolveTaskRefName(t.taskRef) };
}
function isCancelledReason(reason) {
  return reason === "Cancelled" || reason === "CancelledRunFinally" || reason === "PipelineRunCancelled";
}
function conditionPhase(conditions) {
  const c = conditions?.find((cond) => cond.type === "Succeeded");
  if (!c) return "pending";
  if (c.status === "True") return "succeeded";
  if (c.status === "False") return isCancelledReason(c.reason) ? "cancelled" : "failed";
  return "running";
}
function stepState(step) {
  if (step.terminated) return "terminated";
  if (step.running) return "running";
  return "waiting";
}
function toTaskRunSummary(raw, pipelineTaskName) {
  const cond = raw.status?.conditions?.find((c) => c.type === "Succeeded");
  return {
    name: raw.metadata.name,
    pipelineTaskName,
    phase: conditionPhase(raw.status?.conditions),
    reason: cond?.reason,
    message: cond?.message,
    podName: raw.status?.podName,
    namespace: raw.metadata.namespace,
    startTime: raw.status?.startTime,
    completionTime: raw.status?.completionTime,
    steps: (raw.status?.steps ?? []).map((s) => ({
      name: s.name,
      container: s.container,
      state: stepState(s),
      exitCode: s.terminated?.exitCode,
      startedAt: s.terminated?.startedAt ?? s.running?.startedAt,
      finishedAt: s.terminated?.finishedAt
    })),
    params: (raw.spec?.params ?? []).map((p) => ({ name: p.name, value: paramValueToString(p.value) })),
    results: (raw.status?.results ?? []).map((r) => ({ name: r.name, value: paramValueToString(r.value) })),
    raw
  };
}
function extractFlowSlug(name, meta) {
  const stepIndex = hangarField(meta, "step-index");
  const stage = hangarField(meta, "stage");
  if (stepIndex === void 0 || stage === void 0) return void 0;
  const prefix = `ci-${stepIndex}-${stage}-`;
  if (!name.startsWith(prefix)) return void 0;
  const rest = name.slice(prefix.length);
  const lastDash = rest.lastIndexOf("-");
  return lastDash === -1 ? void 0 : rest.slice(0, lastDash);
}
function chainIdOf(run) {
  const fromParam = run.params.find((p) => p.name === "chain-id")?.value;
  if (fromParam) return fromParam;
  return firstTaskResult(run.taskRunsByPipelineTask, "chain-id");
}
const ID_TASK_NAMES = ["preflight", "start-flow"];
function firstTaskResult(byTask, resultName) {
  for (const task of ID_TASK_NAMES) {
    const v = byTask[task]?.results.find((r) => r.name === resultName)?.value;
    if (v) return v;
  }
  return void 0;
}
const derivedSlugRuns = /* @__PURE__ */ new WeakSet();
function linkFlowSlugsByChainId(runs) {
  const slugByChainId = /* @__PURE__ */ new Map();
  const slugBySha = /* @__PURE__ */ new Map();
  runs.forEach((run) => {
    if (!run.flowSlug || derivedSlugRuns.has(run)) return;
    const chainId = chainIdOf(run);
    if (chainId && !slugByChainId.has(chainId)) slugByChainId.set(chainId, run.flowSlug);
    if (run.sha) {
      const at = new Date(run.startTime ?? 0).getTime();
      const prev = slugBySha.get(run.sha.toLowerCase());
      if (!prev || at > prev.at) slugBySha.set(run.sha.toLowerCase(), { slug: run.flowSlug, at });
    }
  });
  runs.forEach((run) => {
    if (run.flowSlug && !derivedSlugRuns.has(run)) return;
    const chainId = chainIdOf(run);
    const borrowed = chainId ? slugByChainId.get(chainId) : void 0;
    if (borrowed) {
      run.flowSlug = borrowed;
      derivedSlugRuns.delete(run);
      return;
    }
    const revision = run.params.find((p) => p.name === "git-revision")?.value?.toLowerCase();
    if (revision) {
      let match;
      slugBySha.forEach((v, sha) => {
        if ((revision.startsWith(sha) || sha.startsWith(revision)) && (!match || v.at > match.at)) match = v;
      });
      if (match) {
        run.flowSlug = match.slug;
        derivedSlugRuns.delete(run);
        return;
      }
    }
    const derived = chainId ? chainIdToSlug(chainId) : void 0;
    if (derived) {
      run.flowSlug = derived;
      derivedSlugRuns.add(run);
    }
  });
}
function toPipelineRunSummary(raw, cluster, taskRunsByName) {
  const meta = raw.metadata;
  const cond = raw.status?.conditions?.find((c) => c.type === "Succeeded");
  const taskRunsByPipelineTask = {};
  (raw.status?.childReferences ?? []).forEach((ref) => {
    if (ref.kind !== "TaskRun") return;
    const trRaw = taskRunsByName.get(ref.name);
    if (trRaw) taskRunsByPipelineTask[ref.pipelineTaskName] = toTaskRunSummary(trRaw, ref.pipelineTaskName);
  });
  const urlOrg = field(meta, "pipelinesascode.tekton.dev/url-org");
  const urlRepo = field(meta, "pipelinesascode.tekton.dev/url-repository");
  const pipelineName = field(meta, "tekton.dev/pipeline");
  return {
    name: meta.name,
    namespace: meta.namespace,
    cluster,
    pipelineName,
    appName: hangarField(meta, "app"),
    sha: field(meta, "pipelinesascode.tekton.dev/sha"),
    branch: field(meta, "pipelinesascode.tekton.dev/source-branch")?.replace(/^refs\/heads\//, ""),
    author: field(meta, "pipelinesascode.tekton.dev/sender"),
    eventType: field(meta, "pipelinesascode.tekton.dev/event-type"),
    sourceRepoUrl: field(meta, "pipelinesascode.tekton.dev/source-repo-url") ?? (urlOrg && urlRepo ? `https://github.com/${urlOrg}/${urlRepo}` : void 0),
    triggerName: field(meta, "triggers.tekton.dev/trigger"),
    // Prefer the real chain-slug result every run's own start-flow-root-span
    // task now computes directly (platform-cicd 2026-09-16 - see that Task's
    // own comment) over parsing it back out of a CDEvent-triggered run's
    // generated name (extractFlowSlug) - structured data over string-
    // parsing, and it's what closes the build-only-flow gap: a git-rooted
    // build run has never had a name-embeddable slug (extractFlowSlug always
    // returns undefined for it), but it always runs start-flow-root-span, so
    // this now resolves for it directly instead of only via
    // linkFlowSlugsByChainId borrowing one from a downstream sibling that
    // may not exist. Falls back to the name-based extraction for any run
    // that predates the toolbox image carrying this result.
    flowSlug: firstTaskResult(taskRunsByPipelineTask, "chain-slug") ?? extractFlowSlug(meta.name, meta),
    // Falls back to a derived 'guardrail' bucket, or folds into 'ci', when
    // there's no explicit flow label at all (every real guardrail
    // PipelineRun and both release-tracking PipelineRuns today) - anything
    // still unmatched (e.g. onboarding-resync, which genuinely shares this
    // namespace but isn't a guardrail or part of the release-tracking pair)
    // stays undefined, which "All flows" already shows, rather than picking
    // a misleading label for it.
    flow: hangarField(meta, "flow") ?? (pipelineName && GUARDRAIL_PIPELINE_NAMES.includes(pipelineName) ? "guardrail" : void 0) ?? (RELEASE_TRACKING_SUBCOMPONENTS.includes(hangarField(meta, "subcomponent") ?? "") ? "ci" : void 0),
    phase: conditionPhase(raw.status?.conditions),
    reason: cond?.reason,
    message: cond?.message,
    startTime: raw.status?.startTime ?? meta.creationTimestamp,
    completionTime: raw.status?.completionTime,
    tasks: (raw.status?.pipelineSpec?.tasks ?? []).map(toTaskDef),
    finallyTasks: (raw.status?.pipelineSpec?.finally ?? []).map(toTaskDef),
    taskRunsByPipelineTask,
    params: (raw.spec?.params ?? []).map((p) => ({ name: p.name, value: paramValueToString(p.value) })),
    results: (raw.status?.results ?? []).map((r) => ({ name: r.name, value: paramValueToString(r.value) })),
    raw
  };
}
function useTektonPipelineRuns(appName, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({ loading: Boolean(appName), runs: [] });
  useEffect(() => {
    if (!appName) {
      setState({ loading: false, runs: [] });
      return void 0;
    }
    const namespace = `app-${appName}-cicd`;
    let cancelled = false;
    let timer;
    async function tick() {
      try {
        const [prList, trList] = await Promise.all([
          k8sProxyGet(
            discoveryApi,
            fetchApi,
            TEKTON_CLUSTER,
            `/apis/tekton.dev/v1/namespaces/${namespace}/pipelineruns`
          ),
          k8sProxyGet(
            discoveryApi,
            fetchApi,
            TEKTON_CLUSTER,
            `/apis/tekton.dev/v1/namespaces/${namespace}/taskruns`
          )
        ]);
        if (cancelled) return;
        const taskRunsByName = new Map(trList.items.map((tr) => [tr.metadata.name, tr]));
        const runs = prList.items.map((pr) => toPipelineRunSummary(pr, TEKTON_CLUSTER, taskRunsByName)).sort((a, b) => new Date(b.startTime ?? 0).getTime() - new Date(a.startTime ?? 0).getTime());
        linkFlowSlugsByChainId(runs);
        setState({ loading: false, runs });
      } catch (e) {
        if (!cancelled) setState((prev) => ({ loading: false, runs: prev.runs, error: String(e) }));
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    }
    setState((prev) => ({ loading: prev.runs.length === 0, runs: prev.runs }));
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [appName, discoveryApi, fetchApi, refreshNonce]);
  return state;
}

export { TEKTON_CLUSTER, linkFlowSlugsByChainId, toPipelineRunSummary, toTaskRunSummary, useTektonPipelineRuns };
//# sourceMappingURL=useTektonPipelineRuns.esm.js.map
