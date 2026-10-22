import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { formatDateTime, relativeTime } from '../shared/format';
import type { ReleaseRecord } from '../useReleaseRecords';
import { EmptyNote, StatusChip, TextLink, Tooltip } from '../ui';
import { shortUser, useBreakglassSessions, type BreakglassSession } from '../tabs/topology/breakglassShared';

// Break-glass sessions during a release (gaps phase C, G12): the sessions started in an environment while this
// release was what it ran, from the record's deploy there until the next release's deploy to the same environment.
// Read from the environment's session list at view time rather than written into the committed record: sessions
// happen after the record is generated, and the record is a PR per change.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  list: { display: 'flex', flexDirection: 'column', gap: 6 },
  row: { display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', fontFamily: fontMono, fontSize: 11 },
  meta: { color: ({ t }) => t.textFaint },
}));

/** The window a release occupied an environment: from its deploy there to the next release's deploy to the same env. */
export function releaseWindow(record: ReleaseRecord, others: ReleaseRecord[], env: string): { from: string; to?: string } | undefined {
  const own = record.deployments.find(d => d.env === env);
  if (!own) return undefined;
  const later = others
    .filter(r => r.id !== record.id)
    .flatMap(r => r.deployments.filter(d => d.env === env && Date.parse(d.deployedAt) > Date.parse(own.deployedAt)))
    .sort((a, b) => Date.parse(a.deployedAt) - Date.parse(b.deployedAt));
  return { from: own.deployedAt, ...(later[0] ? { to: later[0].deployedAt } : {}) };
}

export function sessionsInWindow(sessions: BreakglassSession[], window: { from: string; to?: string }): BreakglassSession[] {
  return sessions.filter(s => {
    if (!s.startedAt) return false;
    const t = Date.parse(s.startedAt);
    return t >= Date.parse(window.from) && (!window.to || t < Date.parse(window.to));
  });
}

function EnvSessions({ appName, env, window, onOpen }: { appName: string; env: string; window: { from: string; to?: string }; onOpen?: (s: BreakglassSession) => void }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { sessions, info } = useBreakglassSessions(appName, env);
  const inWindow = sessionsInWindow(sessions, window);
  if (info.error) return <EmptyNote>{env}: {info.error}</EmptyNote>;
  if (inWindow.length === 0) return <EmptyNote>{env}: none while this release ran here.</EmptyNote>;
  return (
    <div className={classes.list} data-testid={`breakglass-release-${env}`}>
      {inWindow.map(s => (
        <div key={s.id} className={classes.row}>
          <span className={classes.meta}>{env}</span>
          <Tooltip title={formatDateTime(s.startedAt)}>
            <span>{relativeTime(s.startedAt!)}</span>
          </Tooltip>
          <span>
            <b>{shortUser(s.requester)}</b> · {s.mode}
            {s.processAccess ? ' + process access' : ''}
            {s.volumeAccess ? ' + volume access' : ''} on {s.pod}
          </span>
          {s.glassBroken && <StatusChip tone="bad">glass broken</StatusChip>}
          {s.sensitive && <StatusChip tone="warn">sensitive</StatusChip>}
          {s.reviewState === 'due' && <StatusChip tone="warn">review due</StatusChip>}
          <Tooltip title={s.reason}>
            <span className={classes.meta}>“{s.reason.length > 50 ? `${s.reason.slice(0, 50)}…` : s.reason}”</span>
          </Tooltip>
          {onOpen && (
            <TextLink onClick={() => onOpen(s)}>
              open
            </TextLink>
          )}
        </div>
      ))}
    </div>
  );
}

export function BreakglassReleaseSessions({ appName, record, others, onOpen }: { appName?: string; record: ReleaseRecord; others: ReleaseRecord[]; onOpen?: (s: BreakglassSession) => void }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  if (!appName) return null;
  const windows = record.deployments
    .map(d => ({ env: d.env, window: releaseWindow(record, others, d.env) }))
    .filter((x): x is { env: string; window: { from: string; to?: string } } => !!x.window);
  if (windows.length === 0) return <EmptyNote>No deployment to look at.</EmptyNote>;
  return (
    <div className={classes.list}>
      {windows.map(w => (
        <EnvSessions key={w.env} appName={appName} env={w.env} window={w.window} onOpen={onOpen} />
      ))}
    </div>
  );
}
