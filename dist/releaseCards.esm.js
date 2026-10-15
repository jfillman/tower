import { gitopsPrForEnvAndImage, parseGitopsPrTitle } from './useReleaseContext.esm.js';
import { imageTag } from './types.esm.js';

const DAY = 864e5;
function liveRelease(records, signoffEnv, flightEnvs) {
  const env = (signoffEnv ?? flightEnvs[flightEnvs.length - 1])?.toLowerCase();
  const inProd = env ? records.find((r) => r.deployments.some((d) => d.isLive && d.env.toLowerCase() === env)) : void 0;
  return inProd ?? records.find((r) => r.current);
}
function lastOutcome(records, excludeId) {
  return records.find((r) => r.id !== excludeId && r.outcome?.result);
}
function bakeProgress(outcome, now = Date.now()) {
  if (!outcome || outcome.result || outcome.state !== "healthy" || !outcome.healthyAt) return void 0;
  const day = Math.min(outcome.bakeDays, Math.floor((now - Date.parse(outcome.healthyAt)) / DAY) + 1);
  return { day: Math.max(1, day), of: outcome.bakeDays };
}
function nextReleasePath(tag, liveOn, lowerEnvs, flightEnvs, environments, gitopsPrs) {
  const highestGround = [...liveOn].sort((a, b) => lowerEnvs.indexOf(b) - lowerEnvs.indexOf(a))[0];
  const steps = [{ kind: "ground", env: highestGround }];
  flightEnvs.forEach((env) => {
    if (!tag) {
      steps.push({ kind: "flight", env, state: "waiting" });
      return;
    }
    const running = environments.find((e) => e.env.toLowerCase() === env.toLowerCase());
    if (running?.image && imageTag(running.image) === tag) {
      steps.push({ kind: "flight", env, state: "live" });
      return;
    }
    const pr = gitopsPrForEnvAndImage(gitopsPrs.filter((p) => p.state === "open"), env, tag);
    if (pr) steps.push({ kind: "flight", env, state: pr.ci?.state === "failure" ? "blocked" : "pr", pr });
    else steps.push({ kind: "flight", env, state: "waiting" });
  });
  return steps;
}
function readinessCount(items) {
  return { ok: items.filter((i) => i.state === "ok").length, total: items.length };
}
function noteCount(draft) {
  return Object.values(draft?.notes ?? {}).reduce((n, lines) => n + (lines?.length ?? 0), 0);
}
function releaseStats(deployHistory, gitopsPrs, sourcePrs, now = Date.now()) {
  const cutoff = now - 7 * DAY;
  return {
    releasesThisWeek: Object.values(deployHistory ?? {}).flat().filter((entry) => new Date(entry.date).getTime() >= cutoff).length,
    openSourcePrs: sourcePrs.filter((pr) => pr.state === "open").length,
    pendingPromotions: gitopsPrs.filter((pr) => pr.state === "open" && parseGitopsPrTitle(pr.title)).length
  };
}

export { bakeProgress, lastOutcome, liveRelease, nextReleasePath, noteCount, readinessCount, releaseStats };
//# sourceMappingURL=releaseCards.esm.js.map
