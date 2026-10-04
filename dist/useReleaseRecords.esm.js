import { useMemo } from 'react';
import { gitopsPrForEnvAndImage } from './useReleaseContext.esm.js';
import { envTierOf, imageTag, health, extractShortShaFromImageTag } from './types.esm.js';

function dedupeCommits(commits) {
  const seen = /* @__PURE__ */ new Set();
  return commits.filter((c) => seen.has(c.sha) ? false : (seen.add(c.sha), true));
}
function versionFromImageTag(tag) {
  return tag.match(/^(.+)-[0-9a-f]{7,40}$/i)?.[1];
}
function findPipelineRunForTag(tag, pipelineRuns) {
  const shortSha = extractShortShaFromImageTag(tag);
  if (!shortSha) return void 0;
  return pipelineRuns.find((r) => r.sha?.toLowerCase().startsWith(shortSha.toLowerCase()));
}
function findRelatedPipelineRuns(buildRun, pipelineRuns) {
  if (!buildRun) return [];
  if (!buildRun.flowSlug) return [buildRun];
  return pipelineRuns.filter((r) => r.flowSlug === buildRun.flowSlug).sort((a, b) => new Date(a.startTime ?? 0).getTime() - new Date(b.startTime ?? 0).getTime());
}
const NON_TEST_RESULT_NAMES = /* @__PURE__ */ new Set(["span-start-time", "span-end-time"]);
function buildTestResults(relatedRuns) {
  const results = [];
  relatedRuns.filter((r) => r.pipelineName === "test").forEach((r) => {
    Object.values(r.taskRunsByPipelineTask).forEach((tr) => {
      tr.results.filter((res) => !NON_TEST_RESULT_NAMES.has(res.name)).forEach((res) => results.push({ taskName: tr.pipelineTaskName, resultName: res.name, value: res.value }));
    });
  });
  return results;
}
const SECURITY_SCAN_TASK_NAMES = ["sast-scan", "image-scan"];
function buildSecurityScans(relatedRuns) {
  const buildRun = relatedRuns.find((r) => r.pipelineName === "build");
  if (!buildRun) return [];
  const scans = [];
  SECURITY_SCAN_TASK_NAMES.forEach((scanner) => {
    const tr = buildRun.taskRunsByPipelineTask[scanner];
    if (!tr) return;
    const outcome = tr.results.find((res) => res.name === "outcome")?.value;
    const findingsSummary = tr.results.find((res) => res.name === "findings-summary")?.value;
    if (outcome === void 0 && findingsSummary === void 0) return;
    scans.push({ scanner, outcome, findingsSummary });
  });
  return scans;
}
function hasSbomAttestation(provenance) {
  return provenance?.attestations.some((a) => /cyclonedx|spdx/i.test(a.predicateType)) ?? false;
}
const FEATURE_LABEL = /^(feature|enhancement|feat)$/i;
const FIX_LABEL = /^(bug|bugfix|fix)$/i;
const CHORE_LABEL = /^(chore|dependencies|deps|docs?|documentation|refactor|maintenance)$/i;
const CHORE_PREFIXES = /* @__PURE__ */ new Set(["chore", "docs", "doc", "refactor", "test", "tests", "ci", "build", "style"]);
function classifyPr(pr) {
  if (pr.labels.some((l) => FEATURE_LABEL.test(l))) return "features";
  if (pr.labels.some((l) => FIX_LABEL.test(l))) return "fixes";
  if (pr.labels.some((l) => CHORE_LABEL.test(l))) return "chores";
  const prefix = pr.title.match(/^(\w+)(?:\([^)]*\))?:/)?.[1]?.toLowerCase();
  if (!prefix) return void 0;
  if (prefix === "feat" || prefix === "feature") return "features";
  if (prefix === "fix" || prefix === "bugfix") return "fixes";
  if (CHORE_PREFIXES.has(prefix)) return "chores";
  return void 0;
}
function buildChangeCategories(prs) {
  const counts = { features: 0, fixes: 0, chores: 0 };
  prs.forEach((pr) => {
    const bucket = classifyPr(pr);
    if (bucket) counts[bucket] += 1;
  });
  return counts;
}
function computeConfidence(input) {
  let score = 50;
  if (input.guardrails) {
    score += input.guardrails.totalChecks > 0 ? Math.round(input.guardrails.passedChecks / input.guardrails.totalChecks * 30) : 15;
  }
  if (input.provenance?.attestations.some((a) => a.verified)) score += 15;
  score += 5;
  return Math.min(100, Math.max(0, score));
}
function applyApprovalBonus(baseConfidence, approvalsCount) {
  return Math.min(100, baseConfidence + Math.min(10, approvalsCount * 5));
}
function withPersistedGuardrails(record, doc) {
  if (record.guardrails || !doc?.guardrails) return record;
  return {
    ...record,
    guardrails: doc.guardrails.ci,
    guardrailsPrUrl: doc.guardrails.prUrl,
    guardrailsPrNumber: doc.guardrails.prNumber,
    confidence: computeConfidence({ guardrails: doc.guardrails.ci, provenance: record.provenance })
  };
}
function confidenceBreakdown(record, approvalsCount) {
  const g = record.guardrails;
  let guardPoints = 0;
  let guardNote = "No guardrail (release-gate) results are available for this release, so this earns nothing - not because a check failed, but because there is nothing on record to count.";
  if (g) {
    guardPoints = g.totalChecks > 0 ? Math.round(g.passedChecks / g.totalChecks * 30) : 15;
    guardNote = g.totalChecks > 0 ? `${g.passedChecks} of ${g.totalChecks} required release guardrails passed (scaled to 30).` : "The release PR reported no required checks (half credit).";
  }
  const verified = record.provenance?.attestations.some((a) => a.verified) ?? false;
  return [
    { label: "Baseline", points: 50, max: 50, note: "Every release that reached a Flight-tier environment starts here." },
    { label: "Release guardrails", points: guardPoints, max: 30, note: guardNote },
    {
      label: "Signed & attested",
      points: verified ? 15 : 0,
      max: 15,
      note: verified ? "The image has a cosign/SLSA attestation that verified." : "No verified cosign/SLSA attestation found for this image."
    },
    { label: "No incidents", points: 5, max: 5, note: "No incidents are recorded against this release (Tower does not track incidents yet, so this is always awarded)." },
    {
      label: "Human approvals",
      points: Math.min(10, approvalsCount * 5),
      max: 10,
      note: `${approvalsCount} approval${approvalsCount === 1 ? "" : "s"} recorded in the Human Context - +5 each, up to +10.`
    }
  ];
}
function buildReleaseRecords(appName, pipelineEnvironments, releases, gitopsPrs, sourcePrs, pipelineRuns, provenanceByImage, pipelineOrder) {
  const tiered = pipelineEnvironments.filter((e) => envTierOf(e.env, pipelineOrder) === "upper");
  const upperEnvs = tiered.length > 0 ? tiered : pipelineEnvironments.filter((e) => e.cloud);
  if (upperEnvs.length === 0) return [];
  const upperEnvNames = new Set(upperEnvs.map((e) => e.env));
  const qualifying = releases.map((row) => {
    const deployedUpperEnvs = upperEnvs.filter((e) => row.cells[e.env]?.status === "deployed");
    if (deployedUpperEnvs.length === 0) return void 0;
    const createdAt = deployedUpperEnvs.map((e) => row.cells[e.env].date).sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
    return { row, createdAt, createdAtMs: new Date(createdAt).getTime() };
  }).filter((x) => Boolean(x)).sort((a, b) => a.createdAtMs - b.createdAtMs);
  const records = qualifying.map(({ row, createdAt, createdAtMs }, i) => {
    const previous = qualifying[i - 1];
    const liveUpperEnvs = upperEnvs.filter((e) => e.image && imageTag(e.image) === row.imageTag);
    const isLive = liveUpperEnvs.length > 0;
    let status = "superseded";
    if (isLive) status = liveUpperEnvs.some((e) => health(e) === "degraded") ? "degraded" : "healthy";
    const provenance = row.image ? provenanceByImage[row.image]?.data : void 0;
    const pullRequests = sourcePrs.filter((pr) => {
      if (pr.state !== "merged" || !pr.mergedAt) return false;
      const mergedMs = new Date(pr.mergedAt).getTime();
      if (mergedMs > createdAtMs) return false;
      return previous ? mergedMs > previous.createdAtMs : true;
    }).sort((a, b) => new Date(a.mergedAt).getTime() - new Date(b.mergedAt).getTime());
    const deployedEnvs = pipelineEnvironments.filter((e) => row.cells[e.env]?.status === "deployed");
    const commits = deployedEnvs.map((e) => ({
      sha: row.cells[e.env].sha,
      date: row.cells[e.env].date,
      env: e.env
    }));
    const deployments = deployedEnvs.map((e) => {
      const live = Boolean(e.image && imageTag(e.image) === row.imageTag);
      return {
        env: e.env,
        cluster: e.cluster,
        deployedAt: row.cells[e.env].date,
        isLive: live,
        argoRevision: live ? e.argoRevision : void 0,
        rolloutStrategy: live ? e.workload?.strategyKind : void 0,
        canarySteps: live ? e.workload?.canaryProgress?.steps : void 0
      };
    });
    const promotionChain = [];
    for (let envIdx = 0; envIdx < pipelineEnvironments.length - 1; envIdx += 1) {
      const from = pipelineEnvironments[envIdx];
      const to = pipelineEnvironments[envIdx + 1];
      if (row.cells[from.env]?.status !== "deployed" || row.cells[to.env]?.status !== "deployed") continue;
      const pr = gitopsPrForEnvAndImage(gitopsPrs, to.env, row.imageTag);
      promotionChain.push({
        fromEnv: from.env,
        toEnv: to.env,
        at: row.cells[to.env].date,
        prUrl: pr?.url,
        prNumber: pr?.number,
        mergedAt: pr?.mergedAt
      });
    }
    const guardrailPr = deployedUpperEnvNames(deployedEnvs, upperEnvNames).map((envName) => gitopsPrForEnvAndImage(gitopsPrs, envName, row.imageTag)).find((pr) => pr?.ci);
    const pipelineRun = findPipelineRunForTag(row.imageTag, pipelineRuns);
    const relatedPipelineRuns = findRelatedPipelineRuns(pipelineRun, pipelineRuns);
    const testResults = buildTestResults(relatedPipelineRuns);
    const securityScans = buildSecurityScans(relatedPipelineRuns);
    const record = {
      id: `${appName ?? "app"}@${row.imageTag}`,
      appName: appName ?? "",
      imageTag: row.imageTag,
      image: row.image,
      imageDigest: provenance?.digest,
      version: versionFromImageTag(row.imageTag),
      createdAt,
      current: isLive,
      status,
      pullRequests,
      changeCategories: buildChangeCategories(pullRequests),
      commits,
      pipelineRun,
      pipelineRuns: relatedPipelineRuns,
      testResults,
      securityScans,
      provenance,
      nickname: row.nickname,
      hasSbom: hasSbomAttestation(provenance),
      guardrails: guardrailPr?.ci,
      guardrailsPrUrl: guardrailPr?.url,
      guardrailsPrNumber: guardrailPr?.number,
      deployments,
      promotionChain,
      incidents: [],
      confidence: computeConfidence({ guardrails: guardrailPr?.ci, provenance })
    };
    return record;
  });
  return records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
function deployedUpperEnvNames(deployedEnvs, upperEnvNames) {
  return deployedEnvs.filter((e) => upperEnvNames.has(e.env)).map((e) => e.env);
}
function useReleaseRecords(appName, pipelineEnvironments, releases, gitopsPrs, sourcePrs, pipelineRuns, provenanceByImage, pipelineOrderLower, pipelineOrderUpper) {
  return useMemo(
    () => buildReleaseRecords(
      appName,
      pipelineEnvironments,
      releases,
      gitopsPrs,
      sourcePrs,
      pipelineRuns,
      provenanceByImage,
      { upper: pipelineOrderUpper }
    ),
    [
      appName,
      pipelineEnvironments,
      releases,
      gitopsPrs,
      sourcePrs,
      pipelineRuns,
      provenanceByImage,
      pipelineOrderLower,
      pipelineOrderUpper
    ]
  );
}

export { applyApprovalBonus, buildReleaseRecords, confidenceBreakdown, dedupeCommits, useReleaseRecords, withPersistedGuardrails };
//# sourceMappingURL=useReleaseRecords.esm.js.map
