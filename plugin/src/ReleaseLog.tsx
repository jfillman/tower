import { Fragment, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Collapse from '@material-ui/core/Collapse';
import { relativeTime } from '../shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { formatDuration, ReleaseTimelinePanel } from './TimelinePanel';
import { PrButton } from './PrButton';
import { SupplyChainChips } from './SupplyChainChips';
import { slugHue } from './PipelineRunList';
import { gitopsPrForEnvAndImage, nicknameForImageTag, parseGitopsPrTitle } from './useReleaseContext';
import { envTierOf, imageTag, previewPrNumber, type DeployHistoryEntry, type EnvironmentSummary } from './types';
import type { PipelineRunSummary } from './tekton/types';
import type { ProvenanceState } from './useReleaseData';
import type { PullRequestSummary } from '../pullRequests/usePullRequests';

// The real chronological "release log" the 2026-09-16 Releases revamp asked
// for, replacing the old always-on Gantt track (ReleaseTimelinePanel, kept
// below as the Timeline half of this same panel's toggle, not a second
// standing view). Every row here is backed by data useReleaseContext already
// fetches - deployHistory (a promotion actually happening), open gitopsPrs
// (a promotion awaiting merge) and a preview env's own pod-start time (the
// closest real signal to "when did this preview env appear" this platform
// has recorded) - deliberately NOT a "drift detected"/"became degraded" row
// like the mockup sketched, since Tower has no persisted history of health
// transitions to back that with; those stay live-only signals in the
// Command Deck instead of being fabricated as log entries here.

export interface ReleaseLogEntry {
  id: string;
  date: string;
  env: string;
  isPreview: boolean;
  imageTag?: string;
  // The real flow-correlation slug (e.g. "lively finch") of the PipelineRun
  // that built this exact revision - see useReleaseContext.ts's
  // nicknameForImageTag, the same lookup the release matrix uses.
  nickname?: string;
  // Only set when this entry's tag is *currently* the live image somewhere -
  // same "never fabricate a provenance lookup for an aged-out tag" rule
  // buildReleases (useReleaseContext.ts) already follows.
  fullImage?: string;
  trigger: string;
  duration?: string;
  status: 'promoted' | 'pending' | 'spun-up';
  pr?: PullRequestSummary;
}

const LOG_ROW_CAP = 25;

export function buildLogEntries(
  pipelineEnvironments: EnvironmentSummary[],
  previewEnvironments: EnvironmentSummary[],
  deployHistory: Record<string, DeployHistoryEntry[]> | undefined,
  gitopsPrs: PullRequestSummary[],
  sourcePrs: PullRequestSummary[],
  pipelineOrder: { lower?: string[]; upper?: string[] },
  pipelineRuns: PipelineRunSummary[],
): ReleaseLogEntry[] {
  const entries: ReleaseLogEntry[] = [];
  const now = Date.now();

  pipelineEnvironments.forEach(env => {
    const history = deployHistory?.[env.env] ?? [];
    history.forEach((entry, i) => {
      const nextDate = i + 1 < history.length ? history[i + 1].date : undefined;
      const durationMs = (nextDate ? new Date(nextDate).getTime() : now) - new Date(entry.date).getTime();
      const tag = imageTag(entry.imageTag);
      const tier = envTierOf(env.env, pipelineOrder);
      const mergedPr = tier === 'upper' ? gitopsPrForEnvAndImage(gitopsPrs, env.env, tag) : undefined;
      const trigger =
        tier === 'lower' ? 'direct commit' : mergedPr?.state === 'merged' ? `PR #${mergedPr.number} · merged` : 'promoted';
      entries.push({
        id: `${env.env}-${entry.sha}`,
        date: entry.date,
        env: env.env,
        isPreview: false,
        imageTag: tag,
        nickname: nicknameForImageTag(tag, pipelineRuns),
        fullImage: env.image && imageTag(env.image) === tag ? env.image : undefined,
        trigger,
        duration: formatDuration(durationMs),
        status: 'promoted',
        pr: mergedPr,
      });
    });
  });

  gitopsPrs
    .filter(pr => pr.state === 'open')
    .forEach(pr => {
      const parsed = parseGitopsPrTitle(pr.title);
      if (!parsed) return;
      entries.push({
        id: `pr-${pr.number}`,
        date: pr.updatedAt,
        env: parsed.targetEnv,
        isPreview: false,
        imageTag: parsed.imageTag,
        nickname: nicknameForImageTag(parsed.imageTag, pipelineRuns),
        trigger: `PR #${pr.number} · open`,
        status: 'pending',
        pr,
      });
    });

  previewEnvironments.forEach(env => {
    if (!env.deployedAt) return;
    entries.push({
      id: `preview-${env.key}`,
      date: env.deployedAt,
      env: env.env,
      isPreview: true,
      imageTag: env.image ? imageTag(env.image) : undefined,
      nickname: env.image ? nicknameForImageTag(imageTag(env.image), pipelineRuns) : undefined,
      fullImage: env.image,
      trigger: 'preview env created',
      status: 'spun-up',
      pr: sourcePrs.find(pr => pr.number === previewPrNumber(env.env)),
    });
  });

  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, LOG_ROW_CAP);
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { backgroundColor: ({ t }) => t.panel, border: ({ t }) => `1px solid ${t.line}`, borderRadius: 5, overflow: 'hidden' },
  head: { padding: '14px 20px', borderBottom: ({ t }) => `1px solid ${t.lineSoft}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi },
  sub: { fontSize: 12, color: ({ t }) => t.textLo, marginTop: 2, maxWidth: 640 },
  toggle: { display: 'inline-flex', border: ({ t }) => `1px solid ${t.line}`, borderRadius: 100, padding: 2, gap: 2 },
  toggleBtn: { fontFamily: fontMono, fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 100, color: ({ t }) => t.textFaint, background: 'none', border: 'none', cursor: 'pointer' },
  toggleBtnActive: { backgroundColor: ({ t }) => t.panelAlt, color: ({ t }) => t.textHi },
  scroll: { overflowX: 'auto', padding: '0 20px 18px' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', fontFamily: fontDisplay, fontWeight: 700, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: ({ t }) => t.textLo, padding: '9px 12px', borderBottom: ({ t }) => `1px solid ${t.line}`, whiteSpace: 'nowrap' },
  tr: { cursor: 'default' },
  trClickable: { cursor: 'pointer' },
  td: { padding: '10px 12px', fontSize: 12.5, borderBottom: ({ t }) => `1px solid ${t.lineSoft}`, whiteSpace: 'nowrap' },
  time: { color: ({ t }) => t.textFaint, fontFamily: fontMono, fontSize: 11 },
  env: { fontFamily: fontMono, fontSize: 11.5, fontWeight: 600, color: ({ t }) => t.textHi },
  envPreview: { color: ({ t }) => t.sky },
  tag: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textHi },
  nicknameChip: {
    display: 'inline-block',
    marginLeft: 6,
    fontFamily: fontMono,
    fontSize: 10,
    padding: '1px 7px',
    borderRadius: 8,
    border: '1px solid',
    whiteSpace: 'nowrap',
  },
  pill: { display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: fontMono, fontSize: 10.5, padding: '2px 9px', borderRadius: 11, border: '1px solid' },
  emptyRow: { padding: '18px 20px', fontSize: 12.5, color: ({ t }) => t.textFaint, fontStyle: 'italic' },
  expandRow: { padding: '2px 20px 14px' },
  expandFact: { fontSize: 12, color: ({ t }) => t.textLo },
  timelineWrap: { padding: '4px 0' },
}));

const STATUS_LABEL: Record<ReleaseLogEntry['status'], string> = {
  promoted: 'promoted',
  pending: 'pending',
  'spun-up': 'spun up',
};

export function ReleaseLog({
  entries,
  pipelineEnvironments,
  deployHistory,
  provenanceByImage,
}: {
  entries: ReleaseLogEntry[];
  pipelineEnvironments: EnvironmentSummary[];
  deployHistory: Record<string, DeployHistoryEntry[]>;
  provenanceByImage: Record<string, ProvenanceState>;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [view, setView] = useState<'table' | 'timeline'>('table');
  const [expanded, setExpanded] = useState<string | null>(null);

  const statusColors = (status: ReleaseLogEntry['status']) => {
    if (status === 'pending') return { bg: t.amberSoft, border: t.amberLine, fg: t.amberInk };
    if (status === 'spun-up') return { bg: t.skySoft, border: t.skyLine, fg: t.sky };
    return { bg: t.goodSoft, border: t.good, fg: t.good };
  };

  return (
    <div className={classes.wrap}>
      <div className={classes.head}>
        <div>
          <Typography className={classes.title}>Release log</Typography>
          <Typography className={classes.sub}>
            Every promotion and preview spin-up, newest first - table for scanning, timeline for reading how long
            each release ran.
          </Typography>
        </div>
        <div className={classes.toggle}>
          <button
            type="button"
            className={`${classes.toggleBtn} ${view === 'table' ? classes.toggleBtnActive : ''}`}
            onClick={() => setView('table')}
          >
            Table
          </button>
          <button
            type="button"
            className={`${classes.toggleBtn} ${view === 'timeline' ? classes.toggleBtnActive : ''}`}
            onClick={() => setView('timeline')}
          >
            Timeline
          </button>
        </div>
      </div>

      {view === 'table' ? (
        entries.length === 0 ? (
          <Typography className={classes.emptyRow}>No recorded promotions yet.</Typography>
        ) : (
          <div className={classes.scroll}>
            <table className={classes.table}>
              <thead>
                <tr>
                  <th className={classes.th}>Time</th>
                  <th className={classes.th}>Env</th>
                  <th className={classes.th}>Release</th>
                  <th className={classes.th}>Trigger</th>
                  <th className={classes.th}>Duration</th>
                  <th className={classes.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => {
                  const colors = statusColors(entry.status);
                  const clickable = Boolean(entry.fullImage) || Boolean(entry.pr);
                  const isOpen = expanded === entry.id;
                  return (
                    <Fragment key={entry.id}>
                      <tr
                        className={`${classes.tr} ${clickable ? classes.trClickable : ''}`}
                        onClick={clickable ? () => setExpanded(isOpen ? null : entry.id) : undefined}
                      >
                        <td className={`${classes.td} ${classes.time}`}>{relativeTime(entry.date)}</td>
                        <td className={`${classes.td} ${classes.env} ${entry.isPreview ? classes.envPreview : ''}`}>{entry.env}</td>
                        <td className={`${classes.td} ${classes.tag}`}>
                          {entry.imageTag ?? '—'}
                          {entry.nickname && (
                            <span
                              className={classes.nicknameChip}
                              style={{
                                color: `hsl(${slugHue(entry.nickname)}, 65%, 60%)`,
                                borderColor: `hsl(${slugHue(entry.nickname)}, 65%, 60%)`,
                                backgroundColor: `hsla(${slugHue(entry.nickname)}, 65%, 60%, 0.12)`,
                              }}
                            >
                              {entry.nickname}
                            </span>
                          )}
                        </td>
                        <td className={classes.td}>{entry.trigger}</td>
                        <td className={classes.td}>{entry.duration ?? '—'}</td>
                        <td className={classes.td}>
                          <span className={classes.pill} style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.fg }}>
                            {STATUS_LABEL[entry.status]}
                          </span>
                        </td>
                      </tr>
                      {clickable && (
                        <tr>
                          <td colSpan={6} style={{ padding: 0, border: 'none' }}>
                            <Collapse in={isOpen} unmountOnExit>
                              <div className={classes.expandRow}>
                                {entry.pr && <PrButton pr={entry.pr} />}
                                {entry.fullImage && (
                                  <SupplyChainChips provenance={provenanceByImage[entry.fullImage]?.data} />
                                )}
                                {!entry.fullImage && !entry.pr && (
                                  <Typography className={classes.expandFact}>No further detail recorded.</Typography>
                                )}
                              </div>
                            </Collapse>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className={classes.timelineWrap}>
          <ReleaseTimelinePanel environments={pipelineEnvironments} history={deployHistory} />
        </div>
      )}
    </div>
  );
}
