import { useEffect, useRef, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import LockOpenIcon from '@material-ui/icons/LockOpen';
import { fontDisplay, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { formatDateTime, relativeTime } from '../../shared/format';
import type { EnvironmentSummary, EnvTier } from '../../types';
import { Button, StatusChip } from '../../ui';
import { RecordingPlayer } from './RecordingPlayer';
import {
  OpenSession,
  breakglassApi,
  mayEnd,
  mayReview,
  needsYou,
  remaining,
  shortUser,
  toDecideOf,
  useBreakglassSessions,
  useBreakglassStyles,
  useNow,
  type BreakglassData,
  type BreakglassSession,
} from './breakglassShared';

// The environment's break-glass view (gap G1): everything about an environment's sessions that does not need a pod.
// A live session recycles its pod and a copy session deletes its copy, so a record (and its review) used to be
// reachable only through some other pod's Debug panel; approvers hunted for the right pod. This view lists requests
// awaiting a second person, approvals waiting on their requester, active sessions (with End for the session's user,
// its approver and admins), the history with play and download, and reviews due. It shows under Pods in Topology
// (the card) and under the form in a pod's Debug panel. A deep link (?breakglass=<id>) opens and highlights one
// session, fetched by id when it is past the list's window.

const useCardStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  card: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 },
  head: { display: 'flex', alignItems: 'center', gap: 9 },
  headIcon: { display: 'flex', color: ({ t }) => t.sky, flexShrink: 0 },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14.5, color: ({ t }) => t.textHi },
}));

export function BreakglassEnvironmentView({
  env,
  data,
  linkedSessionId,
  hostTerminal = true,
}: {
  env: EnvironmentSummary;
  tier: EnvTier;
  data: BreakglassData;
  /** The session a deep link named: listed, highlighted and scrolled to. */
  linkedSessionId?: string;
  /** Offer Start and Reopen here (the pod's form hosts the terminal when this view sits under it). */
  hostTerminal?: boolean;
}) {
  const t = useHangarTokens();
  const classes = useBreakglassStyles({ t });
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const { sessions, info, load } = data;

  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState<string | undefined>();
  const [confirmEnd, setConfirmEnd] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [note, setNote] = useState<string | undefined>();
  const [decisionNote, setDecisionNote] = useState<Record<string, string>>({});
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [playing, setPlaying] = useState<BreakglassSession | undefined>();
  const [open, setOpen] = useState<BreakglassSession | undefined>();
  const linkedRef = useRef<HTMLDivElement>(null);

  const waiting = sessions.some(s => s.state === 'requested' || s.state === 'approved');
  const now = useNow(waiting || !!open);

  useEffect(() => {
    if (linkedSessionId && linkedRef.current) linkedRef.current.scrollIntoView({ block: 'center' });
    // Once per linked session, after its row exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedSessionId, sessions.some(s => s.id === linkedSessionId)]);

  const toDecide = toDecideOf(sessions, info);
  const toStart = hostTerminal ? sessions.filter(s => s.state === 'approved' && s.requester === info.user) : [];
  const active = sessions.filter(s => s.state === 'active');

  const call = async (path: string, body?: unknown, done?: string) => {
    setBusy(true);
    setError(undefined);
    setNote(undefined);
    try {
      const res = await breakglassApi<{ session?: BreakglassSession }>(discoveryApi, fetchApi, path, {
        method: 'POST',
        ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      if (done) setNote(done);
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy(false);
      load();
    }
  };

  const decide = async (id: string, decision: 'approve' | 'deny') => {
    const n = decisionNote[id]?.trim();
    await call(`/sessions/${id}/${decision}`, n ? { note: n } : {}, decision === 'approve' ? 'Approved. The requester has 10 minutes to start the session.' : 'Denied.');
  };

  const review = async (id: string) => {
    await call(`/sessions/${id}/review`, { note: reviewNote[id]?.trim() ?? '' }, 'Marked reviewed.');
    setReviewNote(n => ({ ...n, [id]: '' }));
  };

  const end = async (s: BreakglassSession) => {
    setConfirmEnd(undefined);
    setEnding(s.id);
    try {
      await breakglassApi(discoveryApi, fetchApi, `/sessions/${s.id}/end`, { method: 'POST' });
      if (open?.id === s.id) setOpen(undefined);
      setNote(s.state === 'active' ? 'Session ended.' : 'Request withdrawn.');
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnding(undefined);
      load();
    }
  };

  const start = async (id: string) => {
    const res = await call(`/sessions/${id}/start`);
    if (res?.session) setOpen(res.session);
  };

  const extend = async (id: string) => {
    setError(undefined);
    try {
      const body = await breakglassApi<{ session: BreakglassSession }>(discoveryApi, fetchApi, `/sessions/${id}/extend`, { method: 'POST' });
      setOpen(o => (o && o.id === id ? { ...o, expiresAt: body.session.expiresAt, extendedAt: body.session.extendedAt } : o));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const download = async (s: BreakglassSession) => {
    try {
      const base = await discoveryApi.getBaseUrl('glidepath');
      const res = await fetchApi.fetch(`${base}/breakglass/sessions/${s.id}/recording`);
      if (!res.ok) throw new Error((await res.json().catch(() => undefined))?.error ?? `download failed with ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `breakglass-${s.app}-${s.env}-${s.id}.cast`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const stateTone = (s: BreakglassSession) => {
    if (s.state === 'active') return 'warn' as const;
    return s.state === 'ended' ? ('neutral' as const) : ('info' as const);
  };

  const endControl = (s: BreakglassSession) => {
    if (!mayEnd(s, info)) return null;
    const own = s.requester === info.user;
    const label = s.state === 'active' ? 'End' : 'Withdraw';
    if (own) {
      return (
        <Button small variant={s.state === 'active' ? 'danger' : 'default'} disabled={ending === s.id} onClick={() => end(s)}>
          {ending === s.id ? 'Ending…' : label}
        </Button>
      );
    }
    if (confirmEnd === s.id) {
      return (
        <span className={classes.actions} data-testid={`breakglass-confirm-end-${s.id}`}>
          <span className={classes.warn}>End {shortUser(s.requester)}'s session now?</span>
          <Button small variant="danger" disabled={ending === s.id} onClick={() => end(s)}>
            {ending === s.id ? 'Ending…' : 'Confirm'}
          </Button>
          <Button small onClick={() => setConfirmEnd(undefined)}>Keep it</Button>
        </span>
      );
    }
    return (
      <Button small variant="danger" disabled={ending === s.id} title={`End ${shortUser(s.requester)}'s session (${s.approver === info.user ? 'you approved it' : 'admin'})`} onClick={() => setConfirmEnd(s.id)}>
        {label}
      </Button>
    );
  };

  return (
    <div className={classes.root} data-testid="breakglass-environment-view">
      {open && (
        <OpenSession
          open={open}
          now={now}
          ending={ending === open.id}
          onExtend={extend}
          onEnd={id => {
            const s = sessions.find(x => x.id === id) ?? open;
            end(s);
          }}
          onClosed={(_note, ended) => {
            if (ended) setOpen(undefined);
            load();
          }}
        />
      )}
      {toDecide.length > 0 && (
        <div className={classes.history} data-testid="breakglass-to-decide">
          <span className={classes.hint} style={{ fontWeight: 700 }}>Requests awaiting a second person</span>
          {toDecide.map(r => (
            <div key={r.id} ref={r.id === linkedSessionId ? linkedRef : undefined} className={classes.banner} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
              <span className={classes.bannerMeta}>
                <b>{shortUser(r.requester)}</b> asks for a {r.durationMinutes ?? ''}-minute {r.mode} session on {r.pod}
                {r.processAccess ? ', with process access' : ''}
                {r.volumeAccess ? ', with volume access' : ''}. Expires in {remaining(r.expiresAt, now)}.
              </span>
              <span className={classes.bannerMeta}>Reason: {r.reason}</span>
              {r.ticketUrl && (
                <a className={classes.link} href={r.ticketUrl} target="_blank" rel="noopener noreferrer">{r.ticketUrl}</a>
              )}
              <div className={classes.actions}>
                <input
                  aria-label={`Note for ${r.id}`}
                  placeholder="Note (optional)"
                  value={decisionNote[r.id] ?? ''}
                  onChange={e => setDecisionNote(n => ({ ...n, [r.id]: e.target.value }))}
                  style={{ flex: 1, minWidth: 160 }}
                />
                <Button variant="danger" small disabled={busy} onClick={() => decide(r.id, 'approve')}>Approve</Button>
                <Button small disabled={busy} onClick={() => decide(r.id, 'deny')}>Deny</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {toStart.map(s => (
        <div key={s.id} ref={s.id === linkedSessionId ? linkedRef : undefined} className={classes.actions} data-testid="breakglass-approved">
          <span className={classes.warn}>
            Approved by {shortUser(s.approver ?? '')}
            {s.decisionNote ? ` (“${s.decisionNote}”)` : ''}: a {s.durationMinutes ?? ''}-minute {s.mode} session on {s.pod}. Start within{' '}
            {remaining(s.expiresAt, now)}.
          </span>
          <Button variant="danger" disabled={busy || !!open} onClick={() => start(s.id)}>
            {busy ? 'Preparing the debug container…' : 'Start recorded session'}
          </Button>
          {endControl(s)}
        </div>
      ))}
      {active.length > 0 && (
        <div className={classes.history} data-testid="breakglass-active">
          <span className={classes.hint} style={{ fontWeight: 700 }}>Active now</span>
          {active.map(s => (
            <div key={s.id} ref={s.id === linkedSessionId ? linkedRef : undefined} className={`${classes.row} ${s.id === linkedSessionId ? classes.rowLinked : ''}`}>
              <StatusChip tone="warn">active</StatusChip>
              <span>
                <b>{shortUser(s.requester)}</b> on {s.pod} ({s.mode}
                {s.processAccess ? ' + process access' : ''}
                {s.volumeAccess ? ' + volume access' : ''})
              </span>
              <span className={classes.rowMeta} title={`Ends at ${formatDateTime(s.expiresAt)}`}>ends {relativeTime(s.expiresAt)}</span>
              {s.glassBroken && <StatusChip tone="bad" title="Opened by an admin with no second person">glass broken</StatusChip>}
              {s.attached === false && <span className={classes.rowMeta}>terminal closed</span>}
              {hostTerminal && s.requester === info.user && open?.id !== s.id && (
                <Button small onClick={() => setOpen(s)}>Reopen terminal</Button>
              )}
              {endControl(s)}
            </div>
          ))}
        </div>
      )}
      {note && <span className={classes.hint}>{note}</span>}
      {error && <span className={classes.bad}>{error}</span>}

      <div className={classes.history}>
        <span className={classes.hint} style={{ fontWeight: 700 }}>Break-glass sessions in {env.env}</span>
        {info.error && <span className={classes.bad}>{info.error}</span>}
        {!info.error && sessions.length === 0 && <span className={classes.hint}>None yet.</span>}
        {sessions.map(s => (
          <div
            key={s.id}
            ref={s.id === linkedSessionId && s.state === 'ended' ? linkedRef : undefined}
            className={`${classes.row} ${s.id === linkedSessionId ? classes.rowLinked : ''}`}
            data-testid={`breakglass-session-${s.id}`}
          >
            <StatusChip tone={stateTone(s)}>{s.state}</StatusChip>
            <span title={formatDateTime(s.createdAt)}>{relativeTime(s.createdAt)}</span>
            <span>
              {s.mode}
              {s.processAccess ? ' + process access' : ''}
              {s.volumeAccess ? (
                <span title={(s.volumes ?? []).map(v => v.path).join('\n') || 'no volumes'}> + volume access</span>
              ) : (
                ''
              )}
            </span>
            <span>{s.pod}</span>
            <span className={classes.rowMeta}>{shortUser(s.requester)}</span>
            <span className={classes.rowMeta} title={s.reason}>“{s.reason.length > 60 ? `${s.reason.slice(0, 60)}…` : s.reason}”</span>
            {s.ticketUrl && (
              <a className={classes.link} href={s.ticketUrl} target="_blank" rel="noopener noreferrer">ticket</a>
            )}
            {s.approver && !(s.endReason ?? '').startsWith('denied') && <span className={classes.rowMeta}>approved by {shortUser(s.approver)}</span>}
            {s.glassBroken && <StatusChip tone="bad" title="Opened by an admin with no second person">glass broken</StatusChip>}
            {s.reviewState === 'due' && <StatusChip tone="warn">review due</StatusChip>}
            {s.reviewState === 'done' && (
              <span className={classes.rowMeta} title={`${formatDateTime(s.reviewedAt)}: ${s.reviewNote ?? ''}`}>
                reviewed by {shortUser(s.reviewedBy ?? '')}
              </span>
            )}
            {s.endReason && (
              <span className={classes.rowMeta} title={s.endReason}>
                {s.endReason.length > 80 ? `${s.endReason.slice(0, 80)}…` : s.endReason}
              </span>
            )}
            {s.mode === 'live' && s.state === 'ended' && (
              <span className={classes.rowMeta}>{s.recycled ? 'pod restarted' : 'pod not restarted'}</span>
            )}
            {s.cleanupNotes && <span className={classes.warn} title={s.cleanupNotes}>notes</span>}
            {s.recordingKey && (
              <>
                {s.recordingRekorIndex !== undefined ? (
                  <span className={classes.rowMeta} title={`Rekor log index ${s.recordingRekorIndex} (${s.recordingRekorUuid ?? ''}) holds this recording's SHA-256, signed by the platform`}>
                    anchored #{s.recordingRekorIndex}
                  </span>
                ) : (
                  <span className={classes.warn} title={s.anchorError ?? 'Not yet anchored in the transparency log'}>
                    not anchored
                  </span>
                )}
                <button type="button" className={classes.link} onClick={() => setPlaying(s)} title="Play the recording here">
                  play
                </button>
                <button
                  type="button"
                  className={classes.link}
                  onClick={() => download(s)}
                  title={`SHA-256 ${s.recordingSha256 ?? ''}${s.recordingExpiresAt ? `\nKept until ${formatDateTime(s.recordingExpiresAt)}` : ''}`}
                >
                  download
                </button>
              </>
            )}
            {mayReview(s, info) && (
              <div className={classes.actions} style={{ flexBasis: '100%' }} data-testid={`breakglass-review-${s.id}`}>
                <input
                  aria-label={`Review note for ${s.id}`}
                  placeholder="What the recording shows, and whether breaking the glass was justified (required)"
                  value={reviewNote[s.id] ?? ''}
                  onChange={e => setReviewNote(n => ({ ...n, [s.id]: e.target.value }))}
                  style={{ flex: 1, minWidth: 200 }}
                />
                <Button small disabled={busy || !reviewNote[s.id]?.trim()} onClick={() => review(s.id)}>
                  Mark reviewed
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      {playing && <RecordingPlayer key={playing.id} session={playing} onClose={() => setPlaying(undefined)} />}
    </div>
  );
}

/** The Break-glass card under Pods in Topology: the environment view with its own data, and a badge when something needs you. */
export function BreakglassEnvironmentCard({ env, tier, linkedSessionId }: { env: EnvironmentSummary; tier: EnvTier; linkedSessionId?: string }) {
  const t = useHangarTokens();
  const classes = useCardStyles({ t });
  const shared = useBreakglassStyles({ t });
  const data = useBreakglassSessions(env.appName, env.env, linkedSessionId);
  const count = needsYou(data.sessions, data.info);
  if (!env.appName) return null;
  return (
    <div className={classes.card} data-testid="breakglass-card">
      <div className={classes.head}>
        <span className={classes.headIcon}><LockOpenIcon fontSize="small" /></span>
        <Typography className={classes.title}>
          Break-glass
          {count > 0 && (
            <span className={shared.badge} data-testid="breakglass-needs-you" title="Requests you can decide, your approved request, or reviews you can do">
              {count}
            </span>
          )}
        </Typography>
      </div>
      <BreakglassEnvironmentView env={env} tier={tier} data={data} linkedSessionId={linkedSessionId} />
    </div>
  );
}
