import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { formatDateTime, relativeTime } from '../shared/format';
import { isStale } from '../fleet/usePolled';
import { queueRowLink, queueSize, useBreakglassQueue, type BreakglassQueueRow } from './useBreakglassQueue';
import { Tooltip } from '../ui';

// The Break-glass strip on the Tower home page and the Ops Wall (gap G2): the requests you can decide, your approved
// request waiting for its Start, and the reviews you can do, across every app. Hidden when there is nothing. Each
// row opens the session in Topology (BreakglassEnvironmentView), by deep link.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  strip: {
    border: ({ t }) => `1px solid ${t.line}`,
    borderLeft: ({ t }) => `3px solid ${t.bad}`,
    borderRadius: 6,
    backgroundColor: ({ t }) => t.panel,
    padding: '12px 14px',
    marginBottom: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: {
    fontFamily: fontMono,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: ({ t }) => t.textFaint,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    fontFamily: fontMono,
    fontSize: 11,
    fontWeight: 600,
    padding: '1px 7px',
    borderRadius: 10,
    backgroundColor: ({ t }) => t.bad,
    color: ({ t }) => t.bg,
  },
  stale: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.amberInk },
  group: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, marginTop: 4 },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(140px, 1fr) minmax(200px, 2.4fr) minmax(110px, 0.9fr)',
    gap: 16,
    alignItems: 'center',
    width: '100%',
    textAlign: 'left',
    padding: '8px 12px',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textHi,
    '&:hover': { outline: ({ t }) => `1px solid ${t.skyLine}` },
    '&:disabled': { cursor: 'default', opacity: 0.7 },
    '@media (max-width: 700px)': { gridTemplateColumns: '1fr' },
  },
  name: { fontFamily: fontDisplay, fontWeight: 600, fontSize: 13, overflowWrap: 'anywhere' },
  nameSub: { display: 'block', fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, fontWeight: 400 },
  what: { fontSize: 12, color: ({ t }) => t.textLo, minWidth: 0 },
  whatMain: { display: 'block', color: ({ t }) => t.textHi, fontWeight: 500 },
  when: { fontFamily: fontMono, fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  whenSub: { display: 'block', fontSize: 11, letterSpacing: '0.08em', color: ({ t }) => t.textFaint },
  overdue: { color: ({ t }) => t.bad, fontWeight: 700 },
}));

const shortUser = (ref: string) => ref.replace(/^user:[^/]+\//, '');

function remaining(expiresAt: string, now: number): string {
  const s = Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function options(r: BreakglassQueueRow): string {
  return `${r.mode}${r.processAccess ? ' + process access' : ''}${r.volumeAccess ? ' + volume access' : ''}`;
}

export function BreakglassQueueStrip({ onOpen }: { onOpen: (row: BreakglassQueueRow, link: string) => void }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const queue = useBreakglassQueue();
  const [now, setNow] = useState(Date.now());
  const size = queueSize(queue.data);
  useEffect(() => {
    if (size === 0) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [size]);
  if (!queue.data || size === 0) return null;
  const stale = isStale(queue, now);

  const row = (r: BreakglassQueueRow, what: string, when: JSX.Element) => {
    const link = queueRowLink(r);
    return (
      <Tooltip key={r.id} title={link ? `Open in Tower: ${r.app} ${r.env}` : 'The catalog no longer knows this app'}>
        <button
          type="button"
          className={classes.row}
          disabled={!link}
          onClick={() => link && onOpen(r, link)}
          data-testid={`breakglass-queue-${r.id}`}
        >
          <span className={classes.name}>
            {r.app}
            <span className={classes.nameSub}>{r.env} · {r.pod}</span>
          </span>
          <span className={classes.what}>
            <span className={classes.whatMain}>{what}</span>
            <Tooltip title={r.reason}>
              <span>“{r.reason.length > 90 ? `${r.reason.slice(0, 90)}…` : r.reason}”</span>
            </Tooltip>
          </span>
          <span className={classes.when}>{when}</span>
        </button>
      </Tooltip>
    );
  };

  const { toApprove, toStart, toReview } = queue.data;
  return (
    <div className={classes.strip} data-testid="breakglass-queue">
      <div className={classes.head}>
        <span className={classes.label}>
          Break-glass
          <span className={classes.badge}>{size}</span>
          {stale && <Tooltip title={queue.error}>
            <span className={classes.stale}>stale: last read {queue.updatedAt ? relativeTime(new Date(queue.updatedAt).toISOString()) : 'never'}</span>
          </Tooltip>}
        </span>
        <span className={classes.group}>what needs you, across every app</span>
      </div>
      {toApprove.length > 0 && <span className={classes.group}>To approve or deny</span>}
      {toApprove.map(r =>
        row(
          r,
          `${shortUser(r.requester)} asks for a ${options(r)} session`,
          <>
            {remaining(r.expiresAt, now)}
            <span className={classes.whenSub}>until it expires</span>
          </>,
        ),
      )}
      {toStart.length > 0 && <span className={classes.group}>Approved, waiting for you to start</span>}
      {toStart.map(r =>
        row(
          r,
          `approved by ${shortUser(r.approver ?? '')}: your ${options(r)} session`,
          <>
            {remaining(r.expiresAt, now)}
            <span className={classes.whenSub}>to press Start</span>
          </>,
        ),
      )}
      {toReview.length > 0 && <span className={classes.group}>Reviews due</span>}
      {toReview.map(r =>
        row(
          r,
          `${shortUser(r.requester)} broke the glass: ${options(r)} session`,
          <>
            <Tooltip title={r.endedAt ? `Ended ${formatDateTime(r.endedAt)}` : undefined}>
              <span className={r.overdue ? classes.overdue : undefined}>
                {r.overdue ? 'overdue' : 'ended'} {r.endedAt ? relativeTime(r.endedAt) : ''}
              </span>
            </Tooltip>
            <span className={classes.whenSub}>{r.overdue ? 'more than 72 h ago' : 'review due'}</span>
          </>,
        ),
      )}
    </div>
  );
}
