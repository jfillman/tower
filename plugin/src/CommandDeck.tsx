import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { STALE_THRESHOLD_MS, relativeTime } from '../shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { RefreshButton } from './RefreshButton';
import { PrButton } from './PrButton';
import { gitopsPrForEnv } from './useReleaseContext';
import { health, type DeployHistoryEntry, type EnvironmentSummary, type Health } from './types';
import type { ProvenanceState } from './useReleaseData';
import type { PullRequestSummary } from '../pullRequests/usePullRequests';
import type { ReleasesSubTab } from './tabs/ReleasesTab';

// The "permanent, dynamic command panel" from the 2026-09-16 Releases revamp
// (Command Deck concept, merged with Split Sub-tabs and the Log's Table/
// Timeline toggle - see that session for the full design discussion). A
// normal, non-sticky panel - this page's sub-tabs already keep any one view
// short, so a pinned slim status bar (this component's first pass had one)
// turned out to add nothing but a redundant second read of the same top
// task - removed same-day per live feedback rather than kept as dead code.
// Zero new backend calls - every fact here is already fetched by
// useReleaseContext for the rest of the tab; this only reshapes it into
// "what needs my attention right now" instead of the one-task-at-a-time
// banner it replaces (ReleaseStatusPanel, deleted this pass).

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  deck: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6,
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
    marginBottom: 20,
    overflow: 'hidden',
  },
  deckInner: { padding: '14px 20px 16px' },
  deckRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 },
  eyebrow: { fontFamily: fontMono, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: ({ t }) => t.textFaint },

  envRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: fontMono,
    fontSize: 11,
    padding: '4px 10px',
    borderRadius: 100,
    border: '1px solid',
    cursor: 'pointer',
  },
  dot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  previewChip: { borderStyle: 'dashed' },

  tasks: { marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 },
  task: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 5, flexWrap: 'wrap' },
  taskIcon: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: 14,
    fontWeight: 700,
    border: '2px solid',
    backgroundColor: ({ t }) => t.panel,
  },
  taskBody: { flex: '1 1 240px', minWidth: 0 },
  taskEyebrow: { fontFamily: fontMono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' },
  taskHeadline: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, color: ({ t }) => t.textHi },
  taskDetail: { fontSize: 11.5, color: ({ t }) => t.textLo, marginTop: 1 },
  taskAction: {
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.textHi,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 4,
    padding: '5px 10px',
    background: 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    '&:hover': { borderColor: ({ t }) => t.amberLine, color: ({ t }) => t.amberInk },
  },

  statsRow: { marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 },
  stat: {
    backgroundColor: ({ t }) => t.panelAlt,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    borderRadius: 5,
    padding: '10px 14px',
  },
  statVal: { fontFamily: fontMono, fontSize: 22, fontWeight: 600, color: ({ t }) => t.textHi },
  statValSm: { fontSize: 14 },
  statLabel: { fontSize: 11, color: ({ t }) => t.textFaint, marginTop: 2 },
}));

const STATUS_COLOR: Record<Health, keyof HangarTokens> = {
  healthy: 'good',
  progressing: 'amber',
  paused: 'sky',
  degraded: 'bad',
  unknown: 'textFaint',
};
const STATUS_SOFT: Record<Health, keyof HangarTokens> = {
  healthy: 'goodSoft',
  progressing: 'amberSoft',
  paused: 'skySoft',
  degraded: 'badSoft',
  unknown: 'panelAlt',
};

interface DeckTask {
  tone: 'bad' | 'warn' | 'good' | 'neutral';
  icon: string;
  eyebrow: string;
  headline: string;
  detail?: string;
  pr?: PullRequestSummary;
  action?: { label: string; onClick: () => void };
}

function toneColors(t: HangarTokens, tone: DeckTask['tone']) {
  switch (tone) {
    case 'bad':
      return { bg: t.badSoft, border: t.bad, fg: t.bad };
    case 'warn':
      return { bg: t.amberSoft, border: t.amberLine, fg: t.amberInk };
    case 'good':
      return { bg: t.goodSoft, border: t.good, fg: t.good };
    case 'neutral':
    default:
      return { bg: t.panelAlt, border: t.line, fg: t.textFaint };
  }
}

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

function verifiedSupplyChainCount(
  environments: EnvironmentSummary[],
  provenanceByImage: Record<string, ProvenanceState>,
): { verified: number; total: number } {
  let verified = 0;
  let total = 0;
  environments.forEach(env => {
    if (!env.image) return;
    const state = provenanceByImage[env.image];
    if (!state || state.loading || !state.data) return;
    total += 1;
    const slsa = state.data.attestations.find(a => a.predicateType === 'https://slsa.dev/provenance/v0.2');
    const anyVerified = state.data.attestations.some(a => a.verified);
    if (anyVerified && slsa?.verified) verified += 1;
  });
  return { verified, total };
}

function releasesThisWeek(deployHistory: Record<string, DeployHistoryEntry[]> | undefined): number {
  if (!deployHistory) return 0;
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return Object.values(deployHistory)
    .flat()
    .filter(entry => new Date(entry.date).getTime() >= cutoff).length;
}

export function CommandDeck({
  environments,
  previewCount,
  gitopsPrs,
  sourcePrs,
  deployHistory,
  provenanceByImage,
  owner,
  appName,
  refresh,
  onSelectTab,
}: {
  environments: EnvironmentSummary[];
  previewCount: number;
  gitopsPrs: PullRequestSummary[];
  sourcePrs: PullRequestSummary[];
  deployHistory: Record<string, DeployHistoryEntry[]> | undefined;
  provenanceByImage: Record<string, ProvenanceState>;
  owner?: string;
  appName?: string;
  refresh: () => void;
  onSelectTab: (tab: ReleasesSubTab) => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [, setSearchParams] = useSearchParams();

  // Cross-tab navigation follows ReleaseMatrix.tsx's own `goToImage` pattern:
  // merge into the existing search params (via TowerPage's `tab` key) rather
  // than replacing them outright, so `entity` survives the jump.
  const goToTowerTab = (tab: string) => () => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  };
  const goToMatrix = () => onSelectTab('matrix');

  // Same `?tab=topology&env=` deep link TopologyTab.tsx already reads for a
  // Recent Activity release-event pill (see that tab's own comment) - an env
  // chip here is just a second way in, not a new convention.
  const goToEnvTopology = (env: string) => () => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', 'topology');
      next.set('env', env);
      return next;
    });
  };

  const tasks = computeTaskQueue(
    environments,
    gitopsPrs,
    sourcePrs,
    goToMatrix,
    goToTowerTab('pull-requests'),
    goToTowerTab('topology'),
  );

  const openPromotions = gitopsPrs.filter(pr => pr.state === 'open').length;
  const openSourcePrCount = sourcePrs.filter(pr => pr.state === 'open').length;
  const releasesWeek = releasesThisWeek(deployHistory);
  const { verified, total } = verifiedSupplyChainCount(environments, provenanceByImage);

  return (
    <div className={classes.deck}>
      <div className={classes.deckInner}>
        <div className={classes.deckRow}>
          <Typography className={classes.eyebrow}>
            {environments.length} environment{environments.length === 1 ? '' : 's'} tracked
            {owner && appName ? ` · ${owner}/${appName}` : ''}
          </Typography>
          <RefreshButton onClick={refresh} />
        </div>

        <div className={classes.envRow}>
          {environments.map(env => {
            const h = health(env);
            const stale = env.deployedAt && Date.now() - new Date(env.deployedAt).getTime() > STALE_THRESHOLD_MS;
            return (
              <button
                type="button"
                key={env.key}
                className={classes.chip}
                style={{ backgroundColor: t[STATUS_SOFT[h]] as string, borderColor: t[STATUS_COLOR[h]] as string, color: t[STATUS_COLOR[h]] as string }}
                onClick={goToEnvTopology(env.env)}
                title={`View ${env.env} in Topology${stale ? ` - deployed ${relativeTime(env.deployedAt)}` : ''}`}
              >
                <span className={classes.dot} style={{ backgroundColor: t[STATUS_COLOR[h]] as string }} />
                {env.env}
                {env.drift && <span title="Running a different image than the majority">⚠</span>}
              </button>
            );
          })}
          {previewCount > 0 && (
            <button
              type="button"
              className={`${classes.chip} ${classes.previewChip}`}
              style={{ backgroundColor: t.skySoft, borderColor: t.skyLine, color: t.sky }}
              onClick={() => onSelectTab('preview')}
              title="View preview environments"
            >
              <span className={classes.dot} style={{ backgroundColor: t.sky }} />
              {previewCount} preview
            </button>
          )}
        </div>

        <div className={classes.tasks}>
          {tasks.map((task, i) => {
            const colors = toneColors(t, task.tone);
            return (
              <div key={i} className={classes.task} style={{ backgroundColor: colors.bg }}>
                <span className={classes.taskIcon} style={{ borderColor: colors.border, color: colors.fg }}>
                  {task.icon}
                </span>
                <div className={classes.taskBody}>
                  <Typography className={classes.taskEyebrow} style={{ color: colors.fg }}>{task.eyebrow}</Typography>
                  <Typography className={classes.taskHeadline}>{task.headline}</Typography>
                  {task.detail && <Typography className={classes.taskDetail}>{task.detail}</Typography>}
                </div>
                {task.pr && <PrButton pr={task.pr} showTarget />}
                {task.action && (
                  <button type="button" className={classes.taskAction} onClick={task.action.onClick}>
                    {task.action.label}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className={classes.statsRow}>
          <div className={classes.stat}>
            <div className={classes.statVal}>{releasesWeek}</div>
            <div className={classes.statLabel}>releases this week</div>
          </div>
          <div className={classes.stat}>
            <div className={classes.statVal}>{openSourcePrCount}</div>
            <div className={classes.statLabel}>open source PRs</div>
          </div>
          <div className={classes.stat}>
            <div className={classes.statVal}>{openPromotions}</div>
            <div className={classes.statLabel}>pending promotion{openPromotions === 1 ? '' : 's'}</div>
          </div>
          <div className={classes.stat}>
            <div className={`${classes.statVal} ${classes.statValSm}`}>
              {total > 0 ? `${verified}/${total} verified` : 'checking…'}
            </div>
            <div className={classes.statLabel}>cosign · SLSA · Rekor</div>
          </div>
        </div>
      </div>
    </div>
  );
}
