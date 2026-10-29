import type { PullRequestSummary } from './pullRequests/usePullRequests';
import type { PipelineRunSummary } from './tekton/types';
import type { ProvenanceState } from './useReleaseData';
import { parseGitopsPrTitle, type ReleaseRow } from './useReleaseContext';
import { RELEASE_MODE_LABEL, type PlannedScope, type ReleaseDraft, type ReleaseMode } from './releaseFlow';
import { envTierOf, extractShortShaFromImageTag, imageTag, type EnvironmentSummary } from './types';
import {
  buildChangeCategories,
  buildSecurityScans,
  findPipelineRunForTag,
  findRelatedPipelineRuns,
  landedAtMs,
  versionFromImageTag,
  type ChangeCategoryCounts,
  type ReleaseRecord,
  type ReleaseRecordSecurityScan,
} from './useReleaseRecords';
import { findReleaseTestRun, isSharedCheckRide, isSignedAndAttested, verdictOf, type TestRunEvidence } from './supplyChain';

// The next release, before any of it reaches Flight (the Release Record proposal's R1,
// 2026-10-13). Read-only and computed: nothing here is stored. The draft opens the
// moment the previous release reaches Flight, so every app always has one.
//
// - Scope: source PRs merged to main after the previous release's own commit landed.
// - Incoming: open PRs targeting the source repo. Shown, not in scope: no image from
//   main contains them yet.
// - Candidates: images built from main after that commit, each on Ground or waiting.
//   Main is one line, so promoting a candidate ships every PR merged up to it.

export const GROUND_SOAK_TARGET_HOURS = 24;

export interface LinkedIssue {
  /** "#198", "owner/repo#5", or a Jira key ("BAG-12"). */
  label: string;
  url: string;
  /** The PR that closes it. */
  prNumber: number;
  /** Whether that PR is merged (scope) or still open (incoming). */
  merged: boolean;
}

export interface NextReleaseCandidate {
  imageTag: string;
  image?: string;
  nickname?: string;
  version?: string;
  landedAt?: string;
  /** Ground environments running this image right now. */
  liveOn: string[];
  /** First time it was deployed to any Ground environment. */
  firstGroundAt?: string;
  build?: PipelineRunSummary;
  scans: ReleaseRecordSecurityScan[];
  provenanceVerified?: boolean;
  /** The check ride attested on this image (supplyChain.ts findReleaseTestRun), when provenance is loaded. */
  checkRide?: TestRunEvidence;
  /** Scope PRs this candidate contains (merged at or before it landed). */
  prCount: number;
}

export type ReadinessState = 'ok' | 'todo' | 'unknown';

export interface ReadinessItem {
  id: string;
  label: string;
  state: ReadinessState;
  detail: string;
}

export interface NextRelease {
  /** The release this one follows: the newest image to reach Flight. */
  previous?: ReleaseRecord;
  scope: PullRequestSummary[];
  /** The PR feed only carries the 20 newest merged PRs; true when older scope may be missing. */
  scopeMayBeIncomplete: boolean;
  incoming: PullRequestSummary[];
  issues: LinkedIssue[];
  changeCategories: ChangeCategoryCounts;
  breaking: boolean;
  candidates: NextReleaseCandidate[];
  /** The candidate furthest along: live on the highest Ground environment, newest on a tie. */
  leading?: NextReleaseCandidate;
  previousVersion?: string;
  suggestedVersion?: string;
  readiness: ReadinessItem[];
  /** R4: the draft's milestone and its issues, when the team plans one. */
  planned?: PlannedScope;
}

// GitHub's closing keywords (close/closes/closed, fix/fixes/fixed, resolve/resolves/
// resolved), with an optional owner/repo for an issue in another repository. A plain
// "#12" mention doesn't close anything, so it isn't a link here either. GitHub also
// links issues through the PR's Development sidebar, which the PR feed doesn't carry.
const CLOSING_REF = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?\s+(?:([\w.-]+\/[\w.-]+))?#(\d+)\b/gi;

export function closingIssueRefs(pr: PullRequestSummary, jiraBaseUrl?: string): Array<{ label: string; url: string }> {
  const repoUrl = pr.url.replace(/\/pull\/\d+.*$/, '');
  const seen = new Map<string, { label: string; url: string }>();
  const text = `${pr.title}\n${pr.body ?? ''}`;
  for (const m of text.matchAll(CLOSING_REF)) {
    const number = Number(m[2]);
    const url = m[1] ? `https://github.com/${m[1]}/issues/${number}` : `${repoUrl}/issues/${number}`;
    seen.set(url, { label: m[1] ? `${m[1]}#${number}` : `#${number}`, url });
  }
  // R4: Jira keys anywhere in the title, body or branch name, when a Jira site is configured.
  if (jiraBaseUrl) {
    for (const m of `${text}\n${pr.headRef ?? ''}`.matchAll(JIRA_KEY)) {
      const url = `${jiraBaseUrl}/browse/${m[1]}`;
      seen.set(url, { label: m[1], url });
    }
  }
  return [...seen.values()];
}

// Jira's own key shape: a project key (a capital letter, then capitals or digits) and an issue number.
const JIRA_KEY = /\b([A-Z][A-Z0-9]{1,9}-\d+)\b/g;

// Conventional Commits' breaking-change markers: "feat!:" / "feat(api)!:" in the title,
// a "BREAKING CHANGE" footer, or a breaking label.
function isBreaking(pr: PullRequestSummary): boolean {
  return (
    /^\w+(?:\([^)]*\))?!:/.test(pr.title) ||
    /BREAKING[ -]CHANGE/.test(pr.body ?? '') ||
    pr.labels.some(l => /breaking/i.test(l))
  );
}

/** The last version plus the bump the merged PRs call for: breaking -> major, a feature -> minor, else patch. */
export function suggestVersion(
  previous: string | undefined,
  categories: ChangeCategoryCounts,
  breaking: boolean,
): string | undefined {
  const m = previous?.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) return undefined;
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Before 1.0.0, semver treats a minor bump as breaking, so a breaking change bumps minor.
  if (breaking) return major === 0 ? `0.${minor + 1}.0` : `${major + 1}.0.0`;
  if (categories.features > 0) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function hoursSince(iso: string | undefined, now: number): number | undefined {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? undefined : (now - t) / 3_600_000;
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${Math.floor(h)}h`;
  return `${Math.floor(h / 24)}d`;
}

export function buildNextRelease(input: {
  /** Release records, any order. */
  records: ReleaseRecord[];
  releases: ReleaseRow[];
  sourcePrs: PullRequestSummary[];
  pipelineRuns: PipelineRunSummary[];
  provenanceByImage: Record<string, ProvenanceState>;
  pipelineEnvironments: EnvironmentSummary[];
  pipelineOrder: { lower?: string[]; upper?: string[] };
  /** The saved draft and the app's release mode (R2), once loaded. Adds the notes, owner and sign-off checks. */
  flow?: { draft?: ReleaseDraft; mode?: ReleaseMode; signoffEnv?: string; jiraBaseUrl?: string; planned?: PlannedScope };
  /** The gitops repo's PRs: an open release PR for the candidate carries its image-promotion check. */
  gitopsPrs?: PullRequestSummary[];
  now?: number;
}): NextRelease {
  const { records, releases, sourcePrs, pipelineRuns, provenanceByImage, pipelineEnvironments, pipelineOrder } = input;
  const now = input.now ?? Date.now();

  const previous = [...records].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const previousRow = previous ? releases.find(r => r.imageTag === previous.imageTag) : undefined;
  const baseMs = previous
    ? landedAtMs(previous.imageTag, sourcePrs, pipelineRuns, previousRow) ?? new Date(previous.createdAt).getTime()
    : Number.NEGATIVE_INFINITY;

  const merged = sourcePrs
    .filter(pr => pr.repo === 'source' && pr.state === 'merged' && pr.mergedAt && !pr.releasePin)
    .sort((a, b) => new Date(a.mergedAt!).getTime() - new Date(b.mergedAt!).getTime());
  const scope = merged.filter(pr => new Date(pr.mergedAt!).getTime() > baseMs);
  // Every merged PR in the window is newer than the previous release: anything older
  // than the window that also belongs to this release can't be seen.
  const scopeMayBeIncomplete = merged.length >= 20 && scope.length === merged.length;
  const incoming = sourcePrs
    .filter(pr => pr.repo === 'source' && pr.state === 'open' && !pr.releasePin)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const issueMap = new Map<string, LinkedIssue>();
  [...scope, ...incoming].forEach(pr =>
    closingIssueRefs(pr, input.flow?.jiraBaseUrl).forEach(ref => {
      if (!issueMap.has(ref.url)) issueMap.set(ref.url, { ...ref, prNumber: pr.number, merged: pr.state === 'merged' });
    }),
  );

  const changeCategories = buildChangeCategories(scope);
  const breaking = scope.some(isBreaking);

  const isUpper = (env: string) => envTierOf(env, pipelineOrder) === 'upper';
  const groundEnvs = pipelineEnvironments.filter(e => !isUpper(e.env) && !e.cloud);
  const lowerOrder = pipelineOrder.lower ?? [];
  const rank = (env: string) => {
    const i = lowerOrder.findIndex(e => e.toLowerCase() === env.toLowerCase());
    return i === -1 ? -1 : i;
  };
  const flightTags = new Set(records.map(r => r.imageTag));

  const candidates: NextReleaseCandidate[] = releases
    .filter(row => !flightTags.has(row.imageTag) && extractShortShaFromImageTag(row.imageTag))
    .map(row => ({ row, landed: landedAtMs(row.imageTag, sourcePrs, pipelineRuns, row) }))
    .filter(({ landed }) => landed !== undefined && landed > baseMs)
    .map(({ row, landed }) => {
      const liveOn = groundEnvs.filter(e => e.image && imageTag(e.image) === row.imageTag).map(e => e.env);
      const groundDates = Object.entries(row.cells)
        .filter(([env, cell]) => !isUpper(env) && cell.status === 'deployed' && cell.date)
        .map(([, cell]) => cell.date!)
        .sort();
      const build = findPipelineRunForTag(row.imageTag, pipelineRuns);
      const provenance = row.image ? provenanceByImage[row.image]?.data : undefined;
      return {
        imageTag: row.imageTag,
        image: row.image,
        nickname: row.nickname,
        version: versionFromImageTag(row.imageTag),
        landedAt: new Date(landed!).toISOString(),
        liveOn,
        firstGroundAt: groundDates[0],
        build,
        scans: buildSecurityScans(findRelatedPipelineRuns(build, pipelineRuns)),
        provenanceVerified: provenance ? isSignedAndAttested(provenance) : undefined,
        checkRide: findReleaseTestRun(provenance),
        prCount: scope.filter(pr => new Date(pr.mergedAt!).getTime() <= landed!).length,
      };
    })
    .sort((a, b) => new Date(b.landedAt!).getTime() - new Date(a.landedAt!).getTime());

  const highestRank = (c: NextReleaseCandidate) => Math.max(-1, ...c.liveOn.map(rank));
  const leading = [...candidates].sort((a, b) => {
    const live = Number(b.liveOn.length > 0) - Number(a.liveOn.length > 0);
    if (live !== 0) return live;
    return highestRank(b) - highestRank(a);
  })[0];

  const previousVersion = previous ? versionFromImageTag(previous.imageTag) : undefined;
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
    planned: input.flow?.planned,
    readiness: [
      ...buildReadiness({ scope, leading, previous, previousVersion, now }),
      ...promotionReadiness(leading?.imageTag, input.gitopsPrs),
      ...flowReadiness(input.flow, now),
    ],
  };
}

/**
 * Promotion to Flight (glidepath ADR-0029), read from the candidate's open release PR: its image-promotion check
 * starts by itself when the last required gate turns green. No row without such a check (no release PR yet, or a
 * platform that does not promote).
 */
export function promotionReadiness(tag: string | undefined, gitopsPrs: PullRequestSummary[] | undefined): ReadinessItem[] {
  if (!tag) return [];
  const pr = (gitopsPrs ?? []).find(p => p.state === 'open' && parseGitopsPrTitle(p.title)?.imageTag.toLowerCase() === tag.toLowerCase());
  const check = pr?.ci?.checks?.find(c => /(^|\/ )image-promotion-?$/.test(c.name.trim()));
  if (!pr || !check) return [];
  const label = 'Promoted to Flight';
  if (check.status !== 'completed') return [{ id: 'promotion', label, state: 'todo', detail: `Promoting (release PR #${pr.number})` }];
  if (check.conclusion === 'success') return [{ id: 'promotion', label, state: 'ok', detail: `Promoted for release PR #${pr.number}` }];
  return [
    {
      id: 'promotion',
      label,
      state: 'todo',
      detail: `Not promoted: ${check.message?.split('\n')[0] ?? check.conclusion ?? 'the check failed'} (release PR #${pr.number})`,
    },
  ];
}

function buildReadiness(input: {
  scope: PullRequestSummary[];
  leading?: NextReleaseCandidate;
  previous?: ReleaseRecord;
  previousVersion?: string;
  now: number;
}): ReadinessItem[] {
  const { scope, leading, previous, previousVersion, now } = input;
  const items: ReadinessItem[] = [];

  items.push(
    scope.length > 0
      ? { id: 'changes', label: 'Changes merged', state: 'ok', detail: `${scope.length} PR${scope.length === 1 ? '' : 's'} on main since the last release` }
      : { id: 'changes', label: 'Changes merged', state: 'todo', detail: 'Nothing merged to main since the last release' },
  );

  if (!leading) {
    items.push({ id: 'candidate', label: 'Candidate on Ground', state: 'todo', detail: 'No image has been built from main since the last release' });
    return items;
  }

  items.push(
    leading.liveOn.length > 0
      ? { id: 'candidate', label: 'Candidate on Ground', state: 'ok', detail: `Running on ${leading.liveOn.join(', ')}` }
      : { id: 'candidate', label: 'Candidate on Ground', state: 'todo', detail: 'Built, but not running on a Ground environment' },
  );

  const soak = hoursSince(leading.firstGroundAt, now);
  items.push(
    soak === undefined
      ? { id: 'soak', label: `Soaked ${GROUND_SOAK_TARGET_HOURS}h on Ground`, state: 'unknown', detail: 'No Ground deploy on record' }
      : {
          id: 'soak',
          label: `Soaked ${GROUND_SOAK_TARGET_HOURS}h on Ground`,
          state: soak >= GROUND_SOAK_TARGET_HOURS ? 'ok' : 'todo',
          detail: `On Ground for ${formatHours(soak)}`,
        },
  );

  const buildPhase = leading.build?.phase;
  const failedScans = leading.scans.filter(s => s.outcome && s.outcome !== 'passed');
  if (!leading.build) {
    items.push({ id: 'build', label: 'Build and scans passed', state: 'unknown', detail: 'The build run is no longer on record' });
  } else if (buildPhase !== 'succeeded') {
    items.push({ id: 'build', label: 'Build and scans passed', state: 'todo', detail: `Build ${buildPhase}` });
  } else if (failedScans.length > 0) {
    items.push({
      id: 'build',
      label: 'Build and scans passed',
      state: 'todo',
      detail: failedScans.map(s => `${s.scanner} ${s.outcome}`).join(', '),
    });
  } else {
    items.push({ id: 'build', label: 'Build and scans passed', state: 'ok', detail: leading.scans.length > 0 ? 'Build, SAST and image scan passed' : 'Build passed' });
  }

  if (leading.provenanceVerified !== undefined) {
    items.push(
      leading.provenanceVerified
        ? { id: 'provenance', label: 'Signed and attested', state: 'ok', detail: 'cosign/SLSA attestation verified' }
        : { id: 'provenance', label: 'Signed and attested', state: 'todo', detail: 'No verified attestation for this image' },
    );
  }

  // The check ride (Glidepath test framework): what the qa release gate will read for this image. Only judged
  // once provenance is loaded; a verified, passed ride from the shared check-rides repository is ready.
  if (leading.provenanceVerified !== undefined) {
    const ride = leading.checkRide;
    if (!ride) {
      items.push({ id: 'check-ride', label: 'Check ride passed', state: 'todo', detail: 'No test run attested on this image yet' });
    } else if (ride.role !== 'check-ride') {
      items.push({ id: 'check-ride', label: 'Check ride passed', state: 'todo', detail: "The team's tests ran, but no check ride from the shared repository" });
    } else if (ride.outcome !== 'passed') {
      items.push({ id: 'check-ride', label: 'Check ride passed', state: 'todo', detail: `The latest check ride ${ride.outcome || 'did not pass'}` });
    } else if (!isSharedCheckRide(ride)) {
      items.push({ id: 'check-ride', label: 'Check ride passed', state: 'todo', detail: 'The check ride did not come from the shared check-rides repository' });
    } else if (verdictOf(ride.attestation) !== 'verified') {
      items.push({ id: 'check-ride', label: 'Check ride passed', state: 'todo', detail: 'The check ride passed, but its attestation did not verify' });
    } else {
      const counts = ride.testsTotal !== undefined ? `${ride.testsPassed ?? 0} of ${ride.testsTotal} tests passed` : 'passed';
      items.push({ id: 'check-ride', label: 'Check ride passed', state: 'ok', detail: `${counts}, attested on the image` });
    }
  }

  if (previousVersion && leading.version) {
    items.push(
      leading.version !== previousVersion
        ? { id: 'version', label: 'Version bumped', state: 'ok', detail: `${previousVersion} → ${leading.version}` }
        : { id: 'version', label: 'Version bumped', state: 'todo', detail: `Still ${leading.version}, the same as the last release` },
    );
  }

  if (previous) {
    items.push(
      previous.current && previous.status === 'healthy'
        ? { id: 'rollback', label: 'Rollback target', state: 'ok', detail: `The last release (${previous.version ?? previous.imageTag}) is healthy on Flight` }
        : { id: 'rollback', label: 'Rollback target', state: 'todo', detail: 'The last release is not running healthy on Flight' },
    );
  }

  return items;
}

// The checks the saved draft and the release mode add (R2). Notes and an owner are what a person
// writes; the sign-off only applies to Hand-flown, where the production release PR needs it.
function flowReadiness(
  flow: { draft?: ReleaseDraft; mode?: ReleaseMode; signoffEnv?: string; planned?: PlannedScope } | undefined,
  now: number,
): ReadinessItem[] {
  if (!flow) return [];
  const items: ReadinessItem[] = [];
  // R4: a scheduled release's target date and planned scope.
  if (flow.draft?.targetDate) {
    const days = Math.round((Date.parse(`${flow.draft.targetDate}T00:00:00Z`) - now) / 86_400_000);
    let when = `in ${days} days`;
    if (days === 0) when = 'today';
    else if (days === 1) when = 'tomorrow';
    else if (days < 0) when = `${-days} day${days === -1 ? '' : 's'} late`;
    items.push({ id: 'target', label: 'Target date', state: days < 0 ? 'todo' : 'ok', detail: `${flow.draft.targetDate} (${when})` });
  }
  if (flow.planned?.milestone) {
    const total = flow.planned.issues.length;
    const closed = flow.planned.issues.filter(i => i.state === 'closed').length;
    items.push({
      id: 'planned',
      label: 'Planned issues closed',
      state: total > 0 && closed === total ? 'ok' : 'todo',
      detail: `${closed} of ${total} on ${flow.planned.milestone.title}`,
    });
  }
  const noteCount = Object.values(flow.draft?.notes ?? {}).reduce((n, l) => n + (l?.length ?? 0), 0);
  items.push(
    noteCount > 0
      ? { id: 'notes', label: 'Release notes', state: 'ok', detail: `${noteCount} entr${noteCount === 1 ? 'y' : 'ies'} in the draft` }
      : { id: 'notes', label: 'Release notes', state: 'todo', detail: 'Not written yet' },
  );
  items.push(
    flow.draft?.owner
      ? { id: 'owner', label: 'Release owner', state: 'ok', detail: flow.draft.owner }
      : { id: 'owner', label: 'Release owner', state: 'todo', detail: 'Nobody named yet' },
  );
  if (flow.mode === 'hand-flown') {
    items.push({
      id: 'signoff',
      label: 'Sign-off',
      state: 'todo',
      detail: `${RELEASE_MODE_LABEL['hand-flown']}: the ${flow.signoffEnv ?? 'production'} release PR needs an approving review from someone other than whoever merges it`,
    });
  }
  return items;
}
