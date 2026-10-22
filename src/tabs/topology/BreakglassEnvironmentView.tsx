import { useEffect, useRef, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import LockOpenIcon from '@material-ui/icons/LockOpen';
import { useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { formatDateTime, relativeTime } from '../../shared/format';
import type { EnvironmentSummary, EnvTier } from '../../types';
import { Button, SectionTitle, StatusChip, Tooltip } from '../../ui';
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
  // Phase C (G13): the approver may keep the pod after a live Flight session (it is the evidence), with a reason.
  const [keepPod, setKeepPod] = useState<Record<string, { on: boolean; reason: string }>>({});
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
    const k = keepPod[id];
    const body = {
      ...(n ? { note: n } : {}),
      ...(decision === 'approve' && k?.on ? { keepPod: true, keepPodReason: k.reason.trim() } : {}),
    };
    await call(`/sessions/${id}/${decision}`, body, decision === 'approve' ? 'Approved. The requester has 10 minutes to start the session.' : 'Denied.');
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
      <Tooltip title={`End ${shortUser(s.requester)}'s session (${s.approver === info.user ? 'you approved it' : 'admin'})`}>
        <Button small variant="danger" disabled={ending === s.id} onClick={() => setConfirmEnd(s.id)}>
          {label}
        </Button>
      </Tooltip>
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
              {(r.podImage || r.podImageId) && (
                <Tooltip title={r.podImageId ?? ''}>
                  <span className={classes.bannerMeta} data-testid={`breakglass-request-image-${r.id}`}>
                    The pod runs {r.podImage ?? 'an unknown image'}
                    {r.podImageId?.includes('@sha256:') ? ` (${r.podImageId.slice(r.podImageId.indexOf('@sha256:') + 8, r.podImageId.indexOf('@sha256:') + 20)}…)` : ''}
                    {r.podImage?.includes(':') ? `; release ${r.podImage.slice(r.podImage.lastIndexOf(':') + 1)} in the Releases tab` : ''}
                  </span>
                </Tooltip>
              )}
              {r.mode === 'copy' && (
                <span className={r.holdApp ? classes.bannerMeta : classes.warn}>
                  {r.holdApp ? 'The copy holds the app: no work runs in it.' : 'The copy runs the app: it consumes queues, schedules work and takes leases like a real replica.'}
                </span>
              )}
              {r.sensitive && (
                <span className={classes.warn}>
                  This session can read Secrets (volume or process access); its recording will be restricted to admins, you, the reviewer and
                  the requester.
                </span>
              )}
              {r.mode === 'live' && r.tier === 'flight' && (
                <label className={classes.radio} data-testid={`breakglass-keep-pod-${r.id}`}>
                  <input
                    type="checkbox"
                    checked={keepPod[r.id]?.on ?? false}
                    onChange={e => setKeepPod(k => ({ ...k, [r.id]: { on: e.target.checked, reason: k[r.id]?.reason ?? '' } }))}
                  />
                  <span>
                    Keep the pod after the session (it is the evidence)
                    <br />
                    <span className={classes.hint}>Normally the pod is restarted at the end because the debug container stays in it. A reason is required and goes on the record.</span>
                    {keepPod[r.id]?.on && (
                      <input
                        aria-label={`Reason to keep the pod for ${r.id}`}
                        placeholder="Why the pod must stay (required)"
                        value={keepPod[r.id]?.reason ?? ''}
                        onChange={e => setKeepPod(k => ({ ...k, [r.id]: { on: true, reason: e.target.value } }))}
                        style={{ display: 'block', width: '100%', marginTop: 4 }}
                      />
                    )}
                  </span>
                </label>
              )}
              <div className={classes.actions}>
                <input
                  aria-label={`Note for ${r.id}`}
                  placeholder="Note (optional)"
                  value={decisionNote[r.id] ?? ''}
                  onChange={e => setDecisionNote(n => ({ ...n, [r.id]: e.target.value }))}
                  style={{ flex: 1, minWidth: 160 }}
                />
                <Button variant="danger" small disabled={busy || (!!keepPod[r.id]?.on && !keepPod[r.id]?.reason.trim())} onClick={() => decide(r.id, 'approve')}>Approve</Button>
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
              <Tooltip title={`Ends at ${formatDateTime(s.expiresAt)}`}>
                <span className={classes.rowMeta}>ends {relativeTime(s.expiresAt)}</span>
              </Tooltip>
              {s.glassBroken && <Tooltip title="Opened by an admin with no second person">
                <StatusChip tone="bad">glass broken</StatusChip>
              </Tooltip>}
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
            <Tooltip title={formatDateTime(s.createdAt)}>
              <span>{relativeTime(s.createdAt)}</span>
            </Tooltip>
            <span>
              {s.mode}
              {s.processAccess ? ' + process access' : ''}
              {s.volumeAccess ? (
                <Tooltip title={(s.volumes ?? []).map(v => v.path).join('\n') || 'no volumes'}>
                  <span> + volume access</span>
                </Tooltip>
              ) : (
                ''
              )}
              {s.mode === 'copy' && s.holdApp ? <Tooltip title="The copy ran a sleep instead of the app">
                <span> · app held</span>
              </Tooltip> : ''}
            </span>
            <span>{s.pod}</span>
            {s.sensitive && (
              <Tooltip title="Could read Secrets: the recording is for admins, the approver, the reviewer and the requester">
                <StatusChip tone="warn">sensitive</StatusChip>
              </Tooltip>
            )}
            {s.recycleWaivedReason && (
              <Tooltip title={s.recycleWaivedReason}>
                <span className={classes.rowMeta}>pod kept by the approver</span>
              </Tooltip>
            )}
            <span className={classes.rowMeta}>{shortUser(s.requester)}</span>
            <Tooltip title={s.reason}>
              <span className={classes.rowMeta}>“{s.reason.length > 60 ? `${s.reason.slice(0, 60)}…` : s.reason}”</span>
            </Tooltip>
            {s.ticketUrl && (
              <a className={classes.link} href={s.ticketUrl} target="_blank" rel="noopener noreferrer">ticket</a>
            )}
            {s.approver && !(s.endReason ?? '').startsWith('denied') && <span className={classes.rowMeta}>approved by {shortUser(s.approver)}</span>}
            {s.glassBroken && <Tooltip title="Opened by an admin with no second person">
              <StatusChip tone="bad">glass broken</StatusChip>
            </Tooltip>}
            {s.reviewState === 'due' && <StatusChip tone="warn">review due</StatusChip>}
            {s.reviewState === 'due' && s.noReviewer && (
              <Tooltip title="Owners, admins and the fallback reviewers group hold nobody but the requester; name a reviewers group (glidepath.breakglass.reviewers)">
                <span className={classes.bad}>
                  no one else can review this
                </span>
              </Tooltip>
            )}
            {s.reviewState === 'due' && s.reviewEscalatedAt && <Tooltip title={`Escalated ${formatDateTime(s.reviewEscalatedAt)}`}>
              <StatusChip tone="bad">overdue</StatusChip>
            </Tooltip>}
            {s.reviewState === 'done' && (
              <Tooltip title={`${formatDateTime(s.reviewedAt)}: ${s.reviewNote ?? ''}`}>
                <span className={classes.rowMeta}>
                  reviewed by {shortUser(s.reviewedBy ?? '')}
                </span>
              </Tooltip>
            )}
            {s.endReason && (
              <Tooltip title={s.endReason}>
                <span className={classes.rowMeta}>
                  {s.endReason.length > 80 ? `${s.endReason.slice(0, 80)}…` : s.endReason}
                </span>
              </Tooltip>
            )}
            {s.mode === 'live' && s.state === 'ended' && (
              <span className={classes.rowMeta}>{s.recycled ? 'pod restarted' : 'pod not restarted'}</span>
            )}
            {s.cleanupNotes && <Tooltip title={s.cleanupNotes}>
              <span className={classes.warn}>notes</span>
            </Tooltip>}
            {s.recordingKey && (
              <>
                {s.recordingRekorIndex !== undefined ? (
                  <Tooltip title={`Rekor log index ${s.recordingRekorIndex} (${s.recordingRekorUuid ?? ''}) holds this recording's SHA-256, signed by the platform`}>
                    <span className={classes.rowMeta}>
                      anchored #{s.recordingRekorIndex}
                    </span>
                  </Tooltip>
                ) : (
                  <Tooltip title={s.anchorError ?? 'Not yet anchored in the transparency log'}>
                    <span className={classes.warn}>
                      not anchored
                    </span>
                  </Tooltip>
                )}
                <Tooltip title="Play the recording here">
                  <button type="button" className={classes.link} onClick={() => setPlaying(s)}>
                    play
                  </button>
                </Tooltip>
                <Tooltip title={`SHA-256 ${s.recordingSha256 ?? ''}${s.recordingExpiresAt ? `\nKept until ${formatDateTime(s.recordingExpiresAt)}` : ''}`}>
                  <button
                    type="button"
                    className={classes.link}
                    onClick={() => download(s)}
                  >
                    download
                  </button>
                </Tooltip>
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
        <SectionTitle level={2}>
          Break-glass
          {count > 0 && (
            <Tooltip title="Requests you can decide, your approved request, or reviews you can do">
              <span className={shared.badge} data-testid="breakglass-needs-you">
                {count}
              </span>
            </Tooltip>
          )}
        </SectionTitle>
      </div>
      <BreakglassEnvironmentView env={env} tier={tier} data={data} linkedSessionId={linkedSessionId} />
    </div>
  );
}
