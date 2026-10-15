import { gitopsPrForEnvAndImage, parseGitopsPrTitle } from './useReleaseContext';
import { imageTag, type DeployHistoryEntry, type EnvironmentSummary } from './types';
import type { PullRequestSummary } from './pullRequests/usePullRequests';
import type { ReadinessItem } from './nextRelease';
import type { ReleaseRecord } from './useReleaseRecords';
import type { RecordOutcome, ReleaseDraft } from './releaseFlow';

// The three cards at the top of the Releases tab (2026-10-14, mockup E): the next release, the one live in
// production, and the last one with an outcome. Pure, so the choices are tested on their own (releaseCards.test.ts).

const DAY = 86_400_000;

/** The release live in the sign-off environment (else the last Flight one): records come newest first. */
export function liveRelease(records: ReleaseRecord[], signoffEnv: string | undefined, flightEnvs: string[]): ReleaseRecord | undefined {
  const env = (signoffEnv ?? flightEnvs[flightEnvs.length - 1])?.toLowerCase();
  const inProd = env ? records.find(r => r.deployments.some(d => d.isLive && d.env.toLowerCase() === env)) : undefined;
  return inProd ?? records.find(r => r.current);
}

/** The newest release whose outcome is final, other than `excludeId` (the live one). */
export function lastOutcome(records: ReleaseRecord[], excludeId?: string): ReleaseRecord | undefined {
  return records.find(r => r.id !== excludeId && r.outcome?.result);
}

/** How far a release is through its bake window, while it is still baking. */
export function bakeProgress(outcome: RecordOutcome | undefined, now = Date.now()): { day: number; of: number } | undefined {
  if (!outcome || outcome.result || outcome.state !== 'healthy' || !outcome.healthyAt) return undefined;
  const day = Math.min(outcome.bakeDays, Math.floor((now - Date.parse(outcome.healthyAt)) / DAY) + 1);
  return { day: Math.max(1, day), of: outcome.bakeDays };
}

export type PathStep =
  | { kind: 'ground'; env?: string }
  | { kind: 'flight'; env: string; state: 'live' | 'pr' | 'blocked' | 'waiting'; pr?: PullRequestSummary };

/**
 * Where the next release is: the highest Ground environment running it, then each Flight environment in order: live
 * there, an open release PR (blocked when its checks failed), or not there yet.
 */
export function nextReleasePath(
  tag: string | undefined,
  liveOn: string[],
  lowerEnvs: string[],
  flightEnvs: string[],
  environments: EnvironmentSummary[],
  gitopsPrs: PullRequestSummary[],
): PathStep[] {
  const highestGround = [...liveOn].sort((a, b) => lowerEnvs.indexOf(b) - lowerEnvs.indexOf(a))[0];
  const steps: PathStep[] = [{ kind: 'ground', env: highestGround }];
  flightEnvs.forEach(env => {
    if (!tag) {
      steps.push({ kind: 'flight', env, state: 'waiting' });
      return;
    }
    const running = environments.find(e => e.env.toLowerCase() === env.toLowerCase());
    if (running?.image && imageTag(running.image) === tag) {
      steps.push({ kind: 'flight', env, state: 'live' });
      return;
    }
    const pr = gitopsPrForEnvAndImage(gitopsPrs.filter(p => p.state === 'open'), env, tag);
    if (pr) steps.push({ kind: 'flight', env, state: pr.ci?.state === 'failure' ? 'blocked' : 'pr', pr });
    else steps.push({ kind: 'flight', env, state: 'waiting' });
  });
  return steps;
}

export function readinessCount(items: ReadinessItem[]): { ok: number; total: number } {
  return { ok: items.filter(i => i.state === 'ok').length, total: items.length };
}

export function noteCount(draft: ReleaseDraft | undefined): number {
  return Object.values(draft?.notes ?? {}).reduce((n, lines) => n + (lines?.length ?? 0), 0);
}

/** The header's numbers: deploys in the last 7 days, open source PRs, open release PRs (not record PRs). */
export function releaseStats(
  deployHistory: Record<string, DeployHistoryEntry[]> | undefined,
  gitopsPrs: PullRequestSummary[],
  sourcePrs: PullRequestSummary[],
  now = Date.now(),
): { releasesThisWeek: number; openSourcePrs: number; pendingPromotions: number } {
  const cutoff = now - 7 * DAY;
  return {
    releasesThisWeek: Object.values(deployHistory ?? {})
      .flat()
      .filter(entry => new Date(entry.date).getTime() >= cutoff).length,
    openSourcePrs: sourcePrs.filter(pr => pr.state === 'open').length,
    pendingPromotions: gitopsPrs.filter(pr => pr.state === 'open' && parseGitopsPrTitle(pr.title)).length,
  };
}
