import { makeStyles } from '@material-ui/core/styles';
import { commitProofChip, commitProofLine, commitProofOf, commitProofTone } from './commitProof';
import type { Theme } from '@material-ui/core/styles';
import { formatDateTime } from './shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from './brand/tokens';
import { TowerEmptyState } from './TowerEmptyState';
import { downloadReleaseRecordHtml } from './ReleaseRecordExport';
import { NicknameChip } from './tabs/deployments/ImageTagPill';
import { outcomeChip } from './ReleaseOutcome';
import { changeRequestTone } from './ReleaseRecordEvidence';
import { displayScore, type ReleaseRecord } from './useReleaseRecords';
import { Count, IconButton, SectionTitle, StatusChip, TextLink, type StatusTone } from './ui';

// Board 1 of the mockup (idp_session_tower_release_record_spec memory,
// HANDOFF-tower-release-record.md) - the Record sub-tab's archive view.
// Cards, newest-first; each opens the full detail (board 2) on click.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto auto auto',
    alignItems: 'center',
    gap: 18,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    borderRadius: 6,
    padding: '14px 18px',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    font: 'inherit',
    '@media (max-width: 860px)': { gridTemplateColumns: '1fr', gap: 8 },
  },
  cardCurrent: {
    borderColor: ({ t }) => t.amberLine,
    background: ({ t }) => `linear-gradient(180deg, ${t.amberSoft} 0%, ${t.panel} 46px)`,
  },
  score: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
    borderRadius: 4,
    padding: '6px 12px',
  },
  scoreNum: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 18 },
  scoreLbl: { fontSize: 11, color: ({ t }) => t.textFaint, lineHeight: 1.2 },
  ver: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi },
  relName: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, letterSpacing: '0.06em', color: ({ t }) => t.textHi, marginRight: 10 },
  chips: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 },
  ladder: { display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4, fontFamily: fontMono, fontSize: 11 },
  rungDone: { color: ({ t }) => t.textLo },
  rungLive: { color: ({ t }) => t.good, fontWeight: 600 },
  rungTodo: { color: ({ t }) => t.textFaint },
  tagMono: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, marginLeft: 6 },
  sub: { fontSize: 12, color: ({ t }) => t.textLo, marginTop: 2 },
  date: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, whiteSpace: 'nowrap' },
  actions: { display: 'flex', alignItems: 'center', gap: 6 },
  chevron: { color: ({ t }) => t.textFaint, fontSize: 15, lineHeight: 1 },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, flexWrap: 'wrap', gap: 8 },
}));

export function confidenceColor(t: HangarTokens, confidence: number): string {
  if (confidence >= 80) return t.good;
  if (confidence >= 50) return t.amberInk;
  return t.bad;
}

export function statusPill(record: ReleaseRecord): { label: string; tone: StatusTone } {
  if (record.status === 'rolled-back') return { label: 'rolled back', tone: 'bad' };
  if (record.current) {
    if (record.status === 'degraded') return { label: 'degraded', tone: 'bad' };
    return { label: 'current', tone: 'warn' };
  }
  return { label: 'superseded', tone: 'ok' };
}

export function ReleaseRecordList({
  records,
  totalKnown,
  names,
  flightEnvs,
  onOpen,
  onChangelog,
}: {
  records: ReleaseRecord[];
  totalKnown: number;
  /** imageTag -> release name (ASPEN, BIRCH...), once the app's release history has loaded. */
  names?: Map<string, string>;
  /** Flight environments in promotion order. Each record shows how far it got when there's more than one. */
  flightEnvs?: string[];
  onOpen: (id: string) => void;
  /** Opens the app's changelog (every release's notes), once its release history has loaded. */
  onChangelog?: () => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });

  if (records.length === 0) {
    return (
      <TowerEmptyState
        title="No release records yet"
        description="A Release Record is generated once an image reaches a Flight-tier (prod) environment. Nothing in this app's recent releases has reached one yet."
      />
    );
  }

  return (
    <div>
      <div className={classes.head}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <SectionTitle>Release records</SectionTitle>
          {onChangelog && <TextLink onClick={onChangelog}>Changelog</TextLink>}
        </span>
        <Count>
          {records.length} of this app's {totalKnown} recent release{totalKnown === 1 ? '' : 's'} reached Flight
        </Count>
      </div>
      <div className={classes.list}>
        {records.map(record => {
          const pill = statusPill(record);
          const outcome = outcomeChip(record.outcome);
          const prAuthor = record.pullRequests[0]?.author;
          return (
            <button
              key={record.id}
              type="button"
              className={`${classes.card} ${record.current ? classes.cardCurrent : ''}`}
              onClick={() => onOpen(record.id)}
            >
              <div className={classes.score}>
                <span className={classes.scoreNum} style={{ color: confidenceColor(t, displayScore(record)) }}>
                  {displayScore(record)}
                </span>
                <span className={classes.scoreLbl}>readiness</span>
              </div>
              <div>
                <span className={classes.ver}>
                  {names?.get(record.imageTag) && <span className={classes.relName}>{names.get(record.imageTag)}</span>}
                  {record.version ?? record.imageTag}
                  {record.nickname && (
                    <span style={{ marginLeft: 8 }}>
                      <NicknameChip nickname={record.nickname} />
                    </span>
                  )}
                  <span className={classes.tagMono}>{record.imageDigest ? record.imageDigest.slice(0, 19) : record.imageTag}</span>
                </span>
                <div className={classes.sub}>
                  {record.pullRequests.length} PR{record.pullRequests.length === 1 ? '' : 's'}
                  {prAuthor ? ` · ${prAuthor}` : ''}
                  {record.status === 'degraded' && record.current ? ' · currently degraded' : ''}
                </div>
                {flightEnvs && flightEnvs.length > 1 && (
                  <div className={classes.ladder} aria-label="Flight environments">
                    {flightEnvs.map(env => {
                      const d = record.deployments.find(x => x.env.toLowerCase() === env.toLowerCase());
                      if (d?.isLive) return <span key={env} className={classes.rungLive}>● {env}</span>;
                      if (d) return <span key={env} className={classes.rungDone}>✓ {env}</span>;
                      return <span key={env} className={classes.rungTodo}>○ {env}</span>;
                    })}
                  </div>
                )}
              </div>
              <span className={classes.chips}>
                <StatusChip tone={pill.tone} dot>
                  {pill.label}
                </StatusChip>
                {outcome && pill.label !== outcome.label && (
                  <StatusChip tone={outcome.tone} dot>
                    {outcome.label}
                  </StatusChip>
                )}
                {record.changeRequest && (
                  <StatusChip tone={changeRequestTone(record.changeRequest.state)} title={`Change request ${record.changeRequest.number ?? record.changeRequest.id}: ${record.changeRequest.state ?? 'created'}`}>
                    {record.changeRequest.number ?? 'change'}
                  </StatusChip>
                )}
                {(() => {
                  // How the commit was proven (provenance phase 3): only the proven paths, green, the line on hover.
                  const proof = commitProofOf(record);
                  const chip = commitProofChip(proof);
                  return chip && commitProofTone(proof) === 'ok' ? (
                    <StatusChip tone="ok" title={`Commit: ${commitProofLine(proof)}`}>
                      {chip}
                    </StatusChip>
                  ) : null;
                })()}
              </span>
              <span className={classes.date}>{formatDateTime(record.createdAt)}</span>
              <div className={classes.actions}>
                <IconButton
                  aria-label="Download HTML"
                  title="Download HTML"
                  onClick={e => {
                    e.stopPropagation();
                    downloadReleaseRecordHtml(record);
                  }}
                >
                  ⤓
                </IconButton>
                <span className={classes.chevron}>›</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
