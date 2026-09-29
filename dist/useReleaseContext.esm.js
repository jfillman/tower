import { useState, useCallback, useMemo } from 'react';
import { useEntity } from '@backstage/plugin-catalog-react';
import { useTowerEnvironments } from './useTowerEnvironments.esm.js';
import { useProvenanceMap, usePipelineOrder, useArgoStatusMap, useDeployHistory, useRepoHead } from './useReleaseData.esm.js';
import { usePullRequests } from './pullRequests/usePullRequests.esm.js';
import { useTektonPipelineRuns, linkFlowSlugsByChainId } from './tekton/useTektonPipelineRuns.esm.js';
import { useTektonResultsRuns } from './tekton/useTektonResultsRuns.esm.js';
import { rememberNickname, recallNickname } from './nicknameCache.esm.js';
import { extractSource, parseGithubUrl, envStageRank, isPreviewEnvName, extractShortShaFromImageTag, imageTag } from './types.esm.js';

function undeployedEnvironment(env, cluster) {
  return {
    key: `declared/${cluster || "unassigned"}/${env}`,
    env,
    cluster,
    namespace: "",
    deployed: false,
    drift: false,
    pods: [],
    services: [],
    resources: []
  };
}
function useReleaseContext() {
  const { entity } = useEntity();
  const { environments: rawEnvironments, loading, error } = useTowerEnvironments();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);
  const images = useMemo(
    () => rawEnvironments.map((e) => e.image).filter((i) => Boolean(i)),
    [rawEnvironments]
  );
  const provenanceByImage = useProvenanceMap(images, refreshNonce);
  const repoRef = useMemo(() => {
    for (const env of rawEnvironments) {
      const data = env.image ? provenanceByImage[env.image]?.data : void 0;
      const slsa = data?.attestations.find(
        (a) => a.predicateType === "https://slsa.dev/provenance/v0.2"
      );
      const source = extractSource(slsa?.predicate);
      const parsed = source.url ? parseGithubUrl(source.url) : void 0;
      if (parsed) return parsed;
    }
    return void 0;
  }, [rawEnvironments, provenanceByImage]);
  const projectSlug = entity.metadata.annotations?.["github.com/project-slug"];
  const [slugOwner, slugAppName] = projectSlug ? projectSlug.split("/") : [void 0, void 0];
  const owner = repoRef?.owner ?? slugOwner;
  const appName = repoRef?.repo ?? slugAppName;
  const pipelineOwnerRepo = useMemo(
    () => owner && appName ? { owner, repo: appName } : void 0,
    [owner, appName]
  );
  const pipelineOrder = usePipelineOrder(pipelineOwnerRepo, refreshNonce);
  const argoStatusRaw = useArgoStatusMap(
    rawEnvironments.map((e) => e.argoAppName).filter((n) => Boolean(n)),
    refreshNonce
  );
  const declaredEnvironments = useMemo(() => {
    const liveNames = new Set(rawEnvironments.map((e) => e.env.toLowerCase()));
    const fallbackCluster = rawEnvironments[0]?.cluster ?? "";
    const result = [];
    (pipelineOrder.lower ?? []).forEach((name) => {
      if (liveNames.has(name.toLowerCase())) return;
      result.push(undeployedEnvironment(name, fallbackCluster));
    });
    (pipelineOrder.upper ?? []).forEach((name) => {
      if (liveNames.has(name.toLowerCase())) return;
      result.push(undeployedEnvironment(name, pipelineOrder.upperClusters?.[name] || fallbackCluster));
    });
    return result;
  }, [rawEnvironments, pipelineOrder.lower, pipelineOrder.upper, pipelineOrder.upperClusters]);
  const environments = useMemo(
    () => [
      ...rawEnvironments.map((e) => ({
        ...e,
        deployed: true,
        argoHealthStatus: e.argoAppName ? argoStatusRaw[e.argoAppName]?.healthStatus : void 0,
        argoSyncStatus: e.argoAppName ? argoStatusRaw[e.argoAppName]?.syncStatus : void 0,
        argoOperationStartedAt: e.argoAppName ? argoStatusRaw[e.argoAppName]?.operationStartedAt : void 0,
        argoOperationFinishedAt: e.argoAppName ? argoStatusRaw[e.argoAppName]?.operationFinishedAt : void 0,
        argoHealthSince: e.argoAppName ? argoStatusRaw[e.argoAppName]?.healthSince : void 0,
        argoOperationPhase: e.argoAppName ? argoStatusRaw[e.argoAppName]?.operationPhase : void 0,
        argoSource: e.argoAppName ? argoStatusRaw[e.argoAppName]?.source : void 0,
        argoSyncPolicy: e.argoAppName ? argoStatusRaw[e.argoAppName]?.syncPolicy : void 0,
        argoRevision: e.argoAppName ? argoStatusRaw[e.argoAppName]?.revision : void 0,
        argoOperationMessage: e.argoAppName ? argoStatusRaw[e.argoAppName]?.operationMessage : void 0,
        argoReconciledAt: e.argoAppName ? argoStatusRaw[e.argoAppName]?.reconciledAt : void 0,
        argoResources: e.argoAppName ? argoStatusRaw[e.argoAppName]?.resources : void 0,
        argoConditions: e.argoAppName ? argoStatusRaw[e.argoAppName]?.conditions : void 0
      })),
      ...declaredEnvironments
    ].sort(
      (a, b) => envStageRank(a.env, pipelineOrder.data) - envStageRank(b.env, pipelineOrder.data) || a.env.localeCompare(b.env)
    ),
    [rawEnvironments, declaredEnvironments, pipelineOrder.data, argoStatusRaw]
  );
  const prs = usePullRequests(owner && appName ? { owner, appName } : void 0, refreshNonce);
  const gitopsPrs = useMemo(() => (prs.data ?? []).filter((pr) => pr.repo === "gitops"), [prs.data]);
  const sourcePrs = useMemo(() => (prs.data ?? []).filter((pr) => pr.repo === "source"), [prs.data]);
  const deployHistory = useDeployHistory(
    repoRef,
    environments.map((e) => ({ env: e.env, cluster: e.cluster })),
    refreshNonce
  );
  const pipelineRuns = useTektonPipelineRuns(appName, refreshNonce);
  const archivedPipelineRuns = useTektonResultsRuns(appName, refreshNonce);
  const mergedPipelineRuns = useMemo(() => {
    const byName = /* @__PURE__ */ new Map();
    archivedPipelineRuns.runs.forEach((run) => byName.set(run.name, run));
    pipelineRuns.runs.forEach((run) => byName.set(run.name, run));
    const merged = [...byName.values()].sort(
      (a, b) => new Date(b.startTime ?? 0).getTime() - new Date(a.startTime ?? 0).getTime()
    );
    linkFlowSlugsByChainId(merged);
    return merged;
  }, [pipelineRuns.runs, archivedPipelineRuns.runs]);
  const pipelineEnvironments = useMemo(
    () => environments.filter((e) => !isPreviewEnvName(e.env)),
    [environments]
  );
  const { rows: releases, total: releaseTotalCount } = useMemo(
    () => buildReleases(pipelineEnvironments, deployHistory.data, gitopsPrs, mergedPipelineRuns),
    [pipelineEnvironments, deployHistory.data, gitopsPrs, mergedPipelineRuns]
  );
  const releaseRef = useMemo(() => {
    for (let i = environments.length - 1; i >= 0; i -= 1) {
      const env = environments[i];
      const data = env.image ? provenanceByImage[env.image]?.data : void 0;
      const slsa = data?.attestations.find(
        (a) => a.predicateType === "https://slsa.dev/provenance/v0.2"
      );
      const source = extractSource(slsa?.predicate);
      if (!source.url || !source.commit) continue;
      const parsed = parseGithubUrl(source.url);
      if (parsed) return { ...parsed, sha: source.commit, env: env.env };
    }
    return void 0;
  }, [environments, provenanceByImage]);
  const repoHead = useRepoHead(
    releaseRef ? { owner: releaseRef.owner, repo: releaseRef.repo, ref: releaseRef.sha } : void 0,
    refreshNonce
  );
  return {
    entity,
    rawEnvironments,
    environments,
    loading,
    error,
    refresh,
    provenanceByImage,
    repoRef,
    owner,
    appName,
    pipelineOrder,
    prs,
    gitopsPrs,
    sourcePrs,
    deployHistory,
    pipelineRuns: mergedPipelineRuns,
    releaseRef,
    repoHead,
    releases,
    releaseTotalCount
  };
}
const GITOPS_PR_TITLE_RE = /^Release:\s+(\S+)\s+to\s+(\S+)\s+@\s+(\S+)$/i;
function parseGitopsPrTitle(title) {
  const match = title.match(GITOPS_PR_TITLE_RE);
  if (!match) return void 0;
  const [, appName, targetEnv, tag] = match;
  return { appName, targetEnv, imageTag: tag };
}
function gitopsPrForEnv(gitopsPrs, env) {
  const needle = env.toLowerCase();
  return gitopsPrs.find((pr) => parseGitopsPrTitle(pr.title)?.targetEnv.toLowerCase() === needle);
}
function gitopsPrForEnvAndImage(gitopsPrs, env, tag) {
  const needleEnv = env.toLowerCase();
  const needleTag = tag.toLowerCase();
  return gitopsPrs.find((pr) => {
    const parsed = parseGitopsPrTitle(pr.title);
    return parsed?.targetEnv.toLowerCase() === needleEnv && parsed.imageTag.toLowerCase() === needleTag;
  });
}
function lastDeployedAt(env, deployHistory) {
  const entries = deployHistory?.[env.env];
  const latest = entries?.[entries.length - 1];
  return latest?.date ?? env.deployedAt;
}
const MATRIX_ROW_CAP = 8;
function nicknameForImageTag(tag, pipelineRuns) {
  const shortSha = extractShortShaFromImageTag(tag);
  if (!shortSha) return void 0;
  const run = pipelineRuns.find((r) => r.sha?.toLowerCase().startsWith(shortSha.toLowerCase()));
  if (run?.flowSlug) {
    rememberNickname(shortSha, run.flowSlug);
    return run.flowSlug;
  }
  return recallNickname(shortSha);
}
function buildReleases(environments, deployHistory, gitopsPrs, pipelineRuns = []) {
  if (!deployHistory) return { rows: [], total: 0 };
  const imageByTag = {};
  environments.forEach((e) => {
    if (e.image) imageByTag[imageTag(e.image)] = e.image;
  });
  const rows = /* @__PURE__ */ new Map();
  environments.forEach((env) => {
    (deployHistory[env.env] ?? []).forEach((entry) => {
      const tag = imageTag(entry.imageTag);
      let row = rows.get(tag);
      if (!row) {
        row = {
          imageTag: tag,
          image: imageByTag[tag],
          cells: {},
          introducedAt: entry.date,
          current: false,
          nickname: nicknameForImageTag(tag, pipelineRuns)
        };
        rows.set(tag, row);
      }
      row.cells[env.env] = { status: "deployed", date: entry.date, sha: entry.sha };
      if (new Date(entry.date).getTime() < new Date(row.introducedAt).getTime()) {
        row.introducedAt = entry.date;
      }
    });
  });
  pipelineRuns.filter((run) => run.pipelineName === "build" && run.phase === "succeeded").forEach((run) => {
    const imageRef = run.taskRunsByPipelineTask["build-image"]?.results.find(
      (r) => r.name === "image-ref"
    )?.value;
    if (!imageRef) return;
    const tag = imageTag(imageRef);
    if (rows.has(tag)) return;
    rows.set(tag, {
      imageTag: tag,
      image: imageByTag[tag] ?? imageRef,
      cells: {},
      introducedAt: run.completionTime ?? run.startTime ?? (/* @__PURE__ */ new Date()).toISOString(),
      current: false,
      nickname: run.flowSlug ?? nicknameForImageTag(tag, pipelineRuns)
    });
  });
  rows.forEach((row) => {
    environments.forEach((env) => {
      if (row.cells[env.env]) return;
      const pr = gitopsPrForEnvAndImage(gitopsPrs, env.env, row.imageTag);
      if (pr?.state === "open") row.cells[env.env] = { status: "pending", pr };
    });
  });
  const currentTag = environments[0]?.image ? imageTag(environments[0].image) : void 0;
  const sorted = [...rows.values()].sort(
    (a, b) => new Date(b.introducedAt).getTime() - new Date(a.introducedAt).getTime()
  );
  const withCurrent = sorted.slice(0, MATRIX_ROW_CAP).map((row) => ({ ...row, current: row.imageTag === currentTag }));
  const currentRow = withCurrent.find((row) => row.current);
  if (currentRow) {
    let lastDeployedIndex = -1;
    environments.forEach((env, i) => {
      if (currentRow.cells[env.env]?.status === "deployed") lastDeployedIndex = i;
    });
    const frontier = environments[lastDeployedIndex + 1];
    if (frontier && (!currentRow.cells[frontier.env] || currentRow.cells[frontier.env].status === "none")) {
      currentRow.cells[frontier.env] = {
        status: "promotable",
        sourceEnv: environments[lastDeployedIndex]?.env
      };
    }
  }
  const firstEnv = environments[0];
  if (firstEnv) {
    withCurrent.forEach((row) => {
      if (!row.image) return;
      const alreadyDeployedSomewhere = environments.some(
        (env) => row.cells[env.env]?.status === "deployed"
      );
      if (alreadyDeployedSomewhere) return;
      const existing = row.cells[firstEnv.env];
      if (existing && existing.status !== "none") return;
      row.cells[firstEnv.env] = { status: "promotable", sourceImage: row.image };
    });
  }
  return { rows: withCurrent, total: sorted.length };
}

export { MATRIX_ROW_CAP, buildReleases, gitopsPrForEnv, gitopsPrForEnvAndImage, lastDeployedAt, nicknameForImageTag, parseGitopsPrTitle, useReleaseContext };
//# sourceMappingURL=useReleaseContext.esm.js.map
