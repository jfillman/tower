import { extractShortShaFromImageTag, imageTag, envTierOf } from './types.esm.js';
import { landedAtMs, buildChangeCategories, findPipelineRunForTag, buildSecurityScans, findRelatedPipelineRuns, versionFromImageTag } from './useReleaseRecords.esm.js';

const GROUND_SOAK_TARGET_HOURS = 24;
const CLOSING_REF = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?\s+(?:([\w.-]+\/[\w.-]+))?#(\d+)\b/gi;
function closingIssueRefs(pr) {
  const repoUrl = pr.url.replace(/\/pull\/\d+.*$/, "");
  const seen = /* @__PURE__ */ new Map();
  const text = `${pr.title}
${pr.body ?? ""}`;
  for (const m of text.matchAll(CLOSING_REF)) {
    const number = Number(m[2]);
    const url = m[1] ? `https://github.com/${m[1]}/issues/${number}` : `${repoUrl}/issues/${number}`;
    seen.set(url, { number, url });
  }
  return [...seen.values()];
}
function isBreaking(pr) {
  return /^\w+(?:\([^)]*\))?!:/.test(pr.title) || /BREAKING[ -]CHANGE/.test(pr.body ?? "") || pr.labels.some((l) => /breaking/i.test(l));
}
function suggestVersion(previous, categories, breaking) {
  const m = previous?.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) return void 0;
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (breaking) return major === 0 ? `0.${minor + 1}.0` : `${major + 1}.0.0`;
  if (categories.features > 0) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}
function hoursSince(iso, now) {
  if (!iso) return void 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? void 0 : (now - t) / 36e5;
}
function formatHours(h) {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${Math.floor(h)}h`;
  return `${Math.floor(h / 24)}d`;
}
function buildNextRelease(input) {
  const { records, releases, sourcePrs, pipelineRuns, provenanceByImage, pipelineEnvironments, pipelineOrder } = input;
  const now = input.now ?? Date.now();
  const previous = [...records].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const previousRow = previous ? releases.find((r) => r.imageTag === previous.imageTag) : void 0;
  const baseMs = previous ? landedAtMs(previous.imageTag, sourcePrs, pipelineRuns, previousRow) ?? new Date(previous.createdAt).getTime() : Number.NEGATIVE_INFINITY;
  const merged = sourcePrs.filter((pr) => pr.repo === "source" && pr.state === "merged" && pr.mergedAt && !pr.releasePin).sort((a, b) => new Date(a.mergedAt).getTime() - new Date(b.mergedAt).getTime());
  const scope = merged.filter((pr) => new Date(pr.mergedAt).getTime() > baseMs);
  const scopeMayBeIncomplete = merged.length >= 20 && scope.length === merged.length;
  const incoming = sourcePrs.filter((pr) => pr.repo === "source" && pr.state === "open" && !pr.releasePin).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const issueMap = /* @__PURE__ */ new Map();
  [...scope, ...incoming].forEach(
    (pr) => closingIssueRefs(pr).forEach((ref) => {
      if (!issueMap.has(ref.url)) issueMap.set(ref.url, { ...ref, prNumber: pr.number, merged: pr.state === "merged" });
    })
  );
  const changeCategories = buildChangeCategories(scope);
  const breaking = scope.some(isBreaking);
  const isUpper = (env) => envTierOf(env, pipelineOrder) === "upper";
  const groundEnvs = pipelineEnvironments.filter((e) => !isUpper(e.env) && !e.cloud);
  const lowerOrder = pipelineOrder.lower ?? [];
  const rank = (env) => {
    const i = lowerOrder.findIndex((e) => e.toLowerCase() === env.toLowerCase());
    return i === -1 ? -1 : i;
  };
  const flightTags = new Set(records.map((r) => r.imageTag));
  const candidates = releases.filter((row) => !flightTags.has(row.imageTag) && extractShortShaFromImageTag(row.imageTag)).map((row) => ({ row, landed: landedAtMs(row.imageTag, sourcePrs, pipelineRuns, row) })).filter(({ landed }) => landed !== void 0 && landed > baseMs).map(({ row, landed }) => {
    const liveOn = groundEnvs.filter((e) => e.image && imageTag(e.image) === row.imageTag).map((e) => e.env);
    const groundDates = Object.entries(row.cells).filter(([env, cell]) => !isUpper(env) && cell.status === "deployed" && cell.date).map(([, cell]) => cell.date).sort();
    const build = findPipelineRunForTag(row.imageTag, pipelineRuns);
    const provenance = row.image ? provenanceByImage[row.image]?.data : void 0;
    return {
      imageTag: row.imageTag,
      image: row.image,
      nickname: row.nickname,
      version: versionFromImageTag(row.imageTag),
      landedAt: new Date(landed).toISOString(),
      liveOn,
      firstGroundAt: groundDates[0],
      build,
      scans: buildSecurityScans(findRelatedPipelineRuns(build, pipelineRuns)),
      provenanceVerified: provenance ? provenance.attestations.some((a) => a.verified) : void 0,
      prCount: scope.filter((pr) => new Date(pr.mergedAt).getTime() <= landed).length
    };
  }).sort((a, b) => new Date(b.landedAt).getTime() - new Date(a.landedAt).getTime());
  const highestRank = (c) => Math.max(-1, ...c.liveOn.map(rank));
  const leading = [...candidates].sort((a, b) => {
    const live = Number(b.liveOn.length > 0) - Number(a.liveOn.length > 0);
    if (live !== 0) return live;
    return highestRank(b) - highestRank(a);
  })[0];
  const previousVersion = previous ? versionFromImageTag(previous.imageTag) : void 0;
  const suggestedVersion = suggestVersion(previousVersion, changeCategories, breaking);
  return {
    previous,
    scope,
    scopeMayBeIncomplete,
    incoming,
    issues: [...issueMap.values()],
    changeCategories,
    breaking,
    candidates,
    leading,
    previousVersion,
    suggestedVersion,
    readiness: buildReadiness({ scope, leading, previous, previousVersion, now })
  };
}
function buildReadiness(input) {
  const { scope, leading, previous, previousVersion, now } = input;
  const items = [];
  items.push(
    scope.length > 0 ? { id: "changes", label: "Changes merged", state: "ok", detail: `${scope.length} PR${scope.length === 1 ? "" : "s"} on main since the last release` } : { id: "changes", label: "Changes merged", state: "todo", detail: "Nothing merged to main since the last release" }
  );
  if (!leading) {
    items.push({ id: "candidate", label: "Candidate on Ground", state: "todo", detail: "No image has been built from main since the last release" });
    return items;
  }
  items.push(
    leading.liveOn.length > 0 ? { id: "candidate", label: "Candidate on Ground", state: "ok", detail: `Running on ${leading.liveOn.join(", ")}` } : { id: "candidate", label: "Candidate on Ground", state: "todo", detail: "Built, but not running on a Ground environment" }
  );
  const soak = hoursSince(leading.firstGroundAt, now);
  items.push(
    soak === void 0 ? { id: "soak", label: `Soaked ${GROUND_SOAK_TARGET_HOURS}h on Ground`, state: "unknown", detail: "No Ground deploy on record" } : {
      id: "soak",
      label: `Soaked ${GROUND_SOAK_TARGET_HOURS}h on Ground`,
      state: soak >= GROUND_SOAK_TARGET_HOURS ? "ok" : "todo",
      detail: `On Ground for ${formatHours(soak)}`
    }
  );
  const buildPhase = leading.build?.phase;
  const failedScans = leading.scans.filter((s) => s.outcome && s.outcome !== "passed");
  if (!leading.build) {
    items.push({ id: "build", label: "Build and scans passed", state: "unknown", detail: "The build run is no longer on record" });
  } else if (buildPhase !== "succeeded") {
    items.push({ id: "build", label: "Build and scans passed", state: "todo", detail: `Build ${buildPhase}` });
  } else if (failedScans.length > 0) {
    items.push({
      id: "build",
      label: "Build and scans passed",
      state: "todo",
      detail: failedScans.map((s) => `${s.scanner} ${s.outcome}`).join(", ")
    });
  } else {
    items.push({ id: "build", label: "Build and scans passed", state: "ok", detail: leading.scans.length > 0 ? "Build, SAST and image scan passed" : "Build passed" });
  }
  if (leading.provenanceVerified !== void 0) {
    items.push(
      leading.provenanceVerified ? { id: "provenance", label: "Signed and attested", state: "ok", detail: "cosign/SLSA attestation verified" } : { id: "provenance", label: "Signed and attested", state: "todo", detail: "No verified attestation for this image" }
    );
  }
  if (previousVersion && leading.version) {
    items.push(
      leading.version !== previousVersion ? { id: "version", label: "Version bumped", state: "ok", detail: `${previousVersion} \u2192 ${leading.version}` } : { id: "version", label: "Version bumped", state: "todo", detail: `Still ${leading.version}, the same as the last release` }
    );
  }
  if (previous) {
    items.push(
      previous.current && previous.status === "healthy" ? { id: "rollback", label: "Rollback target", state: "ok", detail: `The last release (${previous.version ?? previous.imageTag}) is healthy on Flight` } : { id: "rollback", label: "Rollback target", state: "todo", detail: "The last release is not running healthy on Flight" }
    );
  }
  return items;
}

export { GROUND_SOAK_TARGET_HOURS, buildNextRelease, closingIssueRefs, suggestVersion };
//# sourceMappingURL=nextRelease.esm.js.map
