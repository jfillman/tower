import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { relativeTime } from './shared/format';
import { useHangarTokens, type HangarTokens } from './brand/tokens';
import { PrButton } from './PrButton';
import { gitopsPrForEnv, parseGitopsPrTitle } from './useReleaseContext';
import { health, type EnvironmentSummary } from './types';
import type { PullRequestSummary } from './pullRequests/usePullRequests';
import type { ReleasesSubTab } from './tabs/ReleasesTab';
import { Callout, Stat, TextLink, type CalloutTone } from './ui';

// What needs attention on the Releases tab, above its release cards. It was the "Command Deck" of the 2026-09-16
// revamp (environment chips, a ranked task queue and four stat tiles); since 2026-10-14 (mockup E) the release cards
// lead the page, so this keeps only the tasks that are a problem (a degraded environment, drift, a pending promotion
// that isn't the next release's own) and shows nothing when all is well. The stats moved into the page header
// (ReleaseStats); the environment chips' jump to Topology is on the Deployments and Topology tabs. Zero new backend
// calls: every fact is already fetched by useReleaseContext.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  tasks: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 },
  stats: { display: 'inline-flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' },
}));

interface DeckTask {
  tone: 'bad' | 'warn' | 'good' | 'neutral';
  icon: string;
  eyebrow: string;
  headline: string;
  detail?: string;
  pr?: PullRequestSummary;
  action?: { label: string; onClick: () => void };
}

const CALLOUT_TONE: Record<DeckTask['tone'], CalloutTone> = { bad: 'bad', warn: 'warn', good: 'ok', neutral: 'neutral' };

// Ranked, up to 3 at once - the Command Deck's whole reason for being over
// the single-task banner it replaces (ReleaseStatusPanel.computeTopTask):
// a degraded env, a pending promotion and a pile of untriaged source PRs are
// all real, independent, commonly-simultaneous facts (see the 2026-09-16
// Tower field report: Releases' "Own" score was a hard gap specifically
// because nothing here surfaced more than one thing to act on at a time).
// Order is severity-first: something broken, then something waiting on a
// human, then routine backlog.
function computeTaskQueue(
  environments: EnvironmentSummary[],
  gitopsPrs: PullRequestSummary[],
  sourcePrs: PullRequestSummary[],
  goToMatrix: () => void,
  goToPullRequests: () => void,
  goToTopology: () => void,
): DeckTask[] {
  if (environments.length === 0) {
    return [
      { tone: 'neutral', icon: '○', eyebrow: 'Nothing yet', headline: 'No environments deployed yet' },
    ];
  }

  const tasks: DeckTask[] = [];

  const degraded = environments.find(e => health(e) === 'degraded');
  if (degraded) {
    tasks.push({
      tone: 'bad',
      icon: '!',
      eyebrow: 'Needs attention',
      headline: `${degraded.env} is degraded`,
      detail: `${degraded.availableReplicas ?? 0}/${degraded.desiredReplicas ?? '?'} replicas available`,
      action: { label: 'Inspect in Topology →', onClick: goToTopology },
    });
  }

  const pendingByAge = environments
    .map(e => ({ env: e, pr: gitopsPrForEnv(gitopsPrs, e.env) }))
    .filter((x): x is { env: EnvironmentSummary; pr: PullRequestSummary } => Boolean(x.pr) && x.pr!.state === 'open')
    .sort((a, b) => new Date(a.pr.updatedAt).getTime() - new Date(b.pr.updatedAt).getTime())[0];
  if (pendingByAge) {
    tasks.push({
      tone: 'warn',
      icon: '⇢',
      eyebrow: 'Pending promotion',
      headline: `PR #${pendingByAge.pr.number} awaiting merge to promote to ${pendingByAge.env.env}`,
      detail: `updated ${relativeTime(pendingByAge.pr.updatedAt)}`,
      pr: pendingByAge.pr,
      action: { label: 'Review in Matrix →', onClick: goToMatrix },
    });
  }

  const drifted = environments.filter(e => e.drift);
  if (drifted.length > 0 && tasks.length < 3) {
    tasks.push({
      tone: 'warn',
      icon: '≠',
      eyebrow: 'Image drift',
      headline: `${drifted.length} environment${drifted.length === 1 ? '' : 's'} running a different image than the rest`,
      detail: drifted.map(e => e.env).join(', '),
      action: { label: 'Review in Matrix →', onClick: goToMatrix },
    });
  }

  const openSourcePrs = sourcePrs.filter(pr => pr.state === 'open');
  if (openSourcePrs.length > 0 && tasks.length < 3) {
    tasks.push({
      tone: 'neutral',
      icon: '◇',
      eyebrow: 'Awaiting triage',
      headline: `${openSourcePrs.length} open source PR${openSourcePrs.length === 1 ? '' : 's'} not yet promoted anywhere`,
      detail: openSourcePrs.slice(0, 3).map(pr => `#${pr.number} ${pr.title}`).join(' · '),
      action: { label: 'View PRs →', onClick: goToPullRequests },
    });
  }

  const progressing = environments.filter(e => health(e) === 'progressing');
  if (progressing.length > 0 && tasks.length < 3) {
    tasks.push({
      tone: 'warn',
      icon: '↻',
      eyebrow: 'In progress',
      headline: `${progressing.map(e => e.env).join(', ')} still scaling up`,
    });
  }

  if (tasks.length === 0) {
    tasks.push({ tone: 'good', icon: '✓', eyebrow: 'All clear', headline: 'Every environment healthy, nothing pending' });
  }

  return tasks.slice(0, 3);
}

export function CommandDeck({
  environments,
  gitopsPrs,
  sourcePrs,
  nextTag,
  onSelectTab,
}: {
  environments: EnvironmentSummary[];
  gitopsPrs: PullRequestSummary[];
  sourcePrs: PullRequestSummary[];
  /** The next release's leading image: its pending release PR is on the Next release card already. */
  nextTag?: string;
  onSelectTab: (tab: ReleasesSubTab) => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [, setSearchParams] = useSearchParams();

  // Cross-tab navigation merges into the existing search params (TowerPage's `tab` key), so `entity` survives.
  const goToTowerTab = (tab: string) => () => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  };

  const tasks = computeTaskQueue(
    environments,
    gitopsPrs,
    sourcePrs,
    () => onSelectTab('matrix'),
    goToTowerTab('pull-requests'),
    goToTowerTab('topology'),
  ).filter(task => {
    if (task.tone !== 'bad' && task.tone !== 'warn') return false;
    return !(task.pr && nextTag && parseGitopsPrTitle(task.pr.title)?.imageTag === nextTag);
  });
  if (tasks.length === 0) return null;

  return (
    <div className={classes.tasks}>
      {tasks.map((task, i) => (
        <Callout
          key={i}
          tone={CALLOUT_TONE[task.tone]}
          icon={task.icon}
          label={task.eyebrow}
          title={task.headline}
          actions={
            task.pr || task.action ? (
              <>
                {task.pr && <PrButton pr={task.pr} showTarget />}
                {task.action && <TextLink onClick={task.action.onClick}>{task.action.label}</TextLink>}
              </>
            ) : undefined
          }
        >
          {task.detail}
        </Callout>
      ))}
    </div>
  );
}

/** The Releases header's numbers (they were the Command Deck's tiles until 2026-10-14). */
export function ReleaseStats({ releasesThisWeek, openSourcePrs, pendingPromotions }: { releasesThisWeek: number; openSourcePrs: number; pendingPromotions: number }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  return (
    <span className={classes.stats} aria-label="Release stats">
      <Stat label="Releases this week" value={releasesThisWeek} />
      <Stat label="Open source PRs" value={openSourcePrs} />
      <Stat label={`Pending promotion${pendingPromotions === 1 ? '' : 's'}`} value={pendingPromotions} tone={pendingPromotions > 0 ? 'warn' : undefined} />
    </span>
  );
}
