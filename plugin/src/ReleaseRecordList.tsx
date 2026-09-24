import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { formatDateTime } from '../shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { TowerEmptyState } from './TowerEmptyState';
import { downloadReleaseRecordHtml } from './ReleaseRecordExport';
import { NicknameChip } from './tabs/deployments/ImageTagPill';
import type { ReleaseRecord } from './useReleaseRecords';

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
    borderRadius: 8,
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
    borderRadius: 8,
    padding: '6px 12px',
  },
  scoreNum: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 18 },
  scoreLbl: { fontSize: 10, color: ({ t }) => t.textFaint, lineHeight: 1.2 },
  ver: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi },
  tagMono: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, marginLeft: 6 },
  sub: { fontSize: 12.5, color: ({ t }) => t.textLo, marginTop: 2 },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 11,
    letterSpacing: '0.03em',
    padding: '4px 10px',
    borderRadius: 99,
    whiteSpace: 'nowrap',
  },
  pillDot: { width: 6, height: 6, borderRadius: '50%' },
  date: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, whiteSpace: 'nowrap' },
  actions: { display: 'flex', alignItems: 'center', gap: 6 },
  chevron: { color: ({ t }) => t.textFaint, fontSize: 16, lineHeight: 1 },
  btn: {
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 11,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textLo,
    padding: '7px 12px',
    borderRadius: 6,
    cursor: 'pointer',
  },
  btnSky: { backgroundColor: ({ t }) => t.skySoft, borderColor: ({ t }) => t.skyLine, color: ({ t }) => t.sky },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, flexWrap: 'wrap', gap: 8 },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi },
  countNote: { fontSize: 12, color: ({ t }) => t.textFaint },
}));

export function confidenceColor(t: HangarTokens, confidence: number): string {
  if (confidence >= 80) return t.good;
  if (confidence >= 50) return t.amberInk;
  return t.bad;
}

export function statusPill(t: HangarTokens, record: ReleaseRecord): { label: string; bg: string; border: string; fg: string } {
  if (record.current) {
    if (record.status === 'degraded') return { label: 'DEGRADED', bg: t.badSoft, border: t.bad, fg: t.bad };
    return { label: 'CURRENT', bg: t.amberSoft, border: t.amberLine, fg: t.amberInk };
  }
  return { label: 'SUPERSEDED', bg: t.goodSoft, border: t.good, fg: t.good };
}

export function ReleaseRecordList({
  records,
  totalKnown,
  onOpen,
}: {
  records: ReleaseRecord[];
  totalKnown: number;
  onOpen: (id: string) => void;
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
        <Typography className={classes.title}>Release records</Typography>
        <Typography className={classes.countNote}>
          {records.length} of this app's {totalKnown} recent release{totalKnown === 1 ? '' : 's'} reached Flight
        </Typography>
      </div>
      <div className={classes.list}>
        {records.map(record => {
          const pill = statusPill(t, record);
          const prAuthor = record.pullRequests[0]?.author;
          return (
            <button
              key={record.id}
              type="button"
              className={`${classes.card} ${record.current ? classes.cardCurrent : ''}`}
              onClick={() => onOpen(record.id)}
            >
              <div className={classes.score}>
                <span className={classes.scoreNum} style={{ color: confidenceColor(t, record.confidence) }}>
                  {record.confidence}
                </span>
                <span className={classes.scoreLbl}>confidence</span>
              </div>
              <div>
                <span className={classes.ver}>
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
              </div>
              <span className={classes.pill} style={{ backgroundColor: pill.bg, borderColor: pill.border, color: pill.fg }}>
                <span className={classes.pillDot} style={{ backgroundColor: pill.fg }} />
                {pill.label}
              </span>
              <span className={classes.date}>{formatDateTime(record.createdAt)}</span>
              <div className={classes.actions}>
                <button
                  type="button"
                  className={classes.btn}
                  title="Download HTML"
                  onClick={e => {
                    e.stopPropagation();
                    downloadReleaseRecordHtml(record);
                  }}
                >
                  ⤓
                </button>
                <span className={classes.chevron}>›</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
