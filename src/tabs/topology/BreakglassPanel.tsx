import { useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { useHangarTokens } from '../../brand/tokens';
import { relativeTime } from '../../shared/format';
import type { EnvironmentSummary, EnvTier } from '../../types';
import { Button, Field } from '../../ui';
import { BreakglassEnvironmentView } from './BreakglassEnvironmentView';
import {
  OpenSession,
  breakglassApi,
  remaining,
  shortUser,
  useBreakglassSessions,
  useBreakglassStyles,
  useNow,
  type BreakglassSession,
} from './breakglassShared';

export type { BreakglassSession } from './breakglassShared';

// Break-glass debug, phase 2 (Ground only, no approval; backstage breakglass.ts). An owner opens a recorded,
// time-boxed terminal on one pod: in a copy of the pod (copy mode, recommended: the live pod is untouched) or in a
// debug container added to the live pod (live mode, which restarts the pod when the session ends, because the debug
// container stays in the pod spec for the pod's life). The terminal never sees a Kubernetes credential: it is a
// WebSocket to the Backstage backend, which attaches to the debug container and records every byte both ways.
//
// Flight (phase 3) needs a second person to approve. Phase 4: an admin may break the glass instead (no second person;
// announced to everyone, audited critical) and the session is then review-due until an owner other than them, or an
// admin, watches the recording and marks it reviewed. Recordings play here, checked against the stored SHA-256.
//
// This is the per-pod form (what to open on this pod, and the terminal it opens). Everything about the environment's
// sessions that needs no pod, from approvals to reviews and the player, is BreakglassEnvironmentView, shown below the
// form here and as its own card under Pods in Topology (gap G1).

export function BreakglassPanel({
  env,
  podName,
  containers,
  tier,
  linkedSessionId,
}: {
  env: EnvironmentSummary;
  podName: string;
  containers: string[];
  tier: EnvTier;
  linkedSessionId?: string;
}) {
  const t = useHangarTokens();
  const classes = useBreakglassStyles({ t });
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const appName = env.appName;

  const [mode, setMode] = useState<'copy' | 'live'>('copy');
  const [processAccess, setProcessAccess] = useState(false);
  const [volumeAccess, setVolumeAccess] = useState(false);
  const [recycleLastPod, setRecycleLastPod] = useState(false);
  const [duration, setDuration] = useState<15 | 30 | 60>(15);
  const [reason, setReason] = useState('');
  const [ticketUrl, setTicketUrl] = useState('');
  const [container, setContainer] = useState(containers[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [glassBroken, setGlassBroken] = useState(false);
  const [open, setOpen] = useState<BreakglassSession | undefined>();
  const [closedNote, setClosedNote] = useState<string | undefined>();
  const flight = tier === 'upper';

  const data = useBreakglassSessions(appName, env.env, linkedSessionId);
  const { sessions, info: listInfo, load } = data;
  const waiting = sessions.some(s => s.state === 'requested' || s.state === 'approved');
  const now = useNow(!!open || waiting);

  if (!appName) return <span className={classes.hint}>No app is known for this environment.</span>;
  const mine = sessions.find(s => s.state !== 'ended' && s.requester === listInfo.user && s.pod === podName);
  const mineElsewhere = sessions.find(s => s.state !== 'ended' && s.requester === listInfo.user && s.pod !== podName);
  const breakingGlass = flight && glassBroken && !!listInfo.canBreakGlass;
  const startLabel = () => {
    const waits = flight && !breakingGlass;
    if (busy) return waits ? 'Sending the request…' : 'Preparing the debug container…';
    if (breakingGlass) return 'Break glass and start';
    return waits ? 'Request approval' : 'Start recorded session';
  };

  const start = async () => {
    setBusy(true);
    setError(undefined);
    setClosedNote(undefined);
    try {
      const body = await breakglassApi<{ session: BreakglassSession }>(discoveryApi, fetchApi, '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appName,
          env: env.env,
          cluster: env.cluster,
          namespace: env.namespace,
          podName,
          container,
          mode,
          processAccess: mode === 'live' && processAccess,
          volumeAccess,
          recycleLastPod: !flight && mode === 'live' && recycleLastPod,
          durationMinutes: duration,
          reason,
          ...(ticketUrl.trim() ? { ticketUrl: ticketUrl.trim() } : {}),
          ...(breakingGlass ? { glassBroken: true } : {}),
        }),
      });
      setGlassBroken(false);
      if (body.session.state === 'active') {
        setOpen(body.session);
      } else {
        setClosedNote('Request sent. An owner of this app other than you, or an admin, must approve it within 30 minutes.');
      }
      setReason('');
      setTicketUrl('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      load();
    }
  };

  const startApproved = async (id: string) => {
    setBusy(true);
    setError(undefined);
    setClosedNote(undefined);
    try {
      const body = await breakglassApi<{ session: BreakglassSession }>(discoveryApi, fetchApi, `/sessions/${id}/start`, { method: 'POST' });
      setOpen(body.session);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      load();
    }
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

  const end = async (id: string) => {
    setEnding(true);
    try {
      await breakglassApi(discoveryApi, fetchApi, `/sessions/${id}/end`, { method: 'POST' });
      setOpen(undefined);
      setClosedNote('Session ended.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnding(false);
      load();
    }
  };

  return (
    <div className={classes.root} data-testid="breakglass-panel">
      {open ? (
        <OpenSession
          open={open}
          now={now}
          ending={ending}
          onExtend={extend}
          onEnd={end}
          onClosed={(note, ended) => {
            setClosedNote(note);
            if (ended) setOpen(undefined);
            load();
          }}
        />
      ) : (
        <>
          {mine?.state === 'requested' && (
            <div className={classes.actions} data-testid="breakglass-awaiting">
              <span className={classes.warn}>
                Waiting for approval: an owner of {appName} other than you, or an admin. The request expires in {remaining(mine.expiresAt, now)}.
              </span>
              <Button small disabled={ending} onClick={() => end(mine.id)}>{ending ? 'Withdrawing…' : 'Withdraw'}</Button>
            </div>
          )}
          {mine?.state === 'approved' && (
            <div className={classes.actions} data-testid="breakglass-approved">
              <span className={classes.warn}>
                Approved by {shortUser(mine.approver ?? '')}
                {mine.decisionNote ? ` (“${mine.decisionNote}”)` : ''}. Start within {remaining(mine.expiresAt, now)}; the
                {` ${mine.durationMinutes ?? ''}`}-minute clock starts then.
              </span>
              <Button variant="danger" disabled={busy} onClick={() => startApproved(mine.id)}>
                {busy ? 'Preparing the debug container…' : 'Start recorded session'}
              </Button>
              <Button small disabled={ending} onClick={() => end(mine.id)}>Withdraw</Button>
            </div>
          )}
          {mine?.state === 'active' && (
            <div className={classes.actions}>
              <span className={classes.warn}>
                You have an active session on this pod (ends {relativeTime(mine.expiresAt)}).
              </span>
              <Button
                small
                onClick={() => {
                  setClosedNote(undefined);
                  setOpen(mine);
                }}
              >
                Reopen terminal
              </Button>
              <Button small variant="danger" disabled={ending} onClick={() => end(mine.id)}>{ending ? 'Ending…' : 'End it'}</Button>
            </div>
          )}
          {mineElsewhere && !mine && (
            <span className={classes.warn}>
              You have a break-glass {mineElsewhere.state === 'active' ? 'session' : 'request'} open on {mineElsewhere.pod}; one at a time.
            </span>
          )}
          {closedNote && <span className={classes.hint}>{closedNote}</span>}
          {ending && <span className={classes.hint}>Ending the session: removing the grant and the debug pod, saving the recording…</span>}
          <span className={classes.hint}>
            A time-boxed shell in a hardened debug container (the signed Tower debug image: curl, dig, openssl, jq, ss, ps, nc, psql,
            redis-cli; non-root, read-only, no capabilities). Everything typed and shown is recorded and kept for
            {listInfo.recordingRetentionDays && listInfo.recordingRetentionDays !== 365 ? ` ${listInfo.recordingRetentionDays} days` : ' a year'}; the
            session is audited.
            {flight && ' On Flight a second person approves first: an owner of this app other than you, or an admin.'}
          </span>
          {listInfo.recordingsConfigured === false && (
            <span className={classes.bad}>Recordings are not configured on the backend, so no session can start.</span>
          )}
          <div className={classes.form}>
            <div className={classes.radios}>
              <label className={classes.radio}>
                <input type="radio" name="bg-mode" checked={mode === 'copy'} onChange={() => setMode('copy')} />
                <span>
                  <b>Copy of the pod</b> (recommended)
                  <br />
                  <span className={classes.hint}>A new pod from this pod's spec that takes no traffic. The live pod is untouched; the copy is deleted at the end.</span>
                </span>
              </label>
              <label className={classes.radio}>
                <input type="radio" name="bg-mode" checked={mode === 'live'} onChange={() => setMode('live')} />
                <span>
                  <b>The live pod</b>
                  <br />
                  <span className={classes.hint}>A debug container added to the running pod, for problems a copy cannot reproduce. The pod is restarted at the end.</span>
                </span>
              </label>
            </div>
            <div className={classes.radios}>
              <label className={classes.radio}>
                <input type="checkbox" checked={volumeAccess} onChange={e => setVolumeAccess(e.target.checked)} />
                <span>
                  Volume access to <code>{container}</code>
                  <br />
                  <span className={classes.warn}>
                    Mounts the volumes the container mounts (ConfigMaps, Secrets, emptyDirs, claims), read-only, under /pod-volumes/&lt;volume&gt;.
                    Secrets included; the service account token never. Shown on the session record.
                  </span>
                </span>
              </label>
              {mode === 'live' && (
                <>
                  <label className={classes.radio}>
                    <input type="checkbox" checked={processAccess} onChange={e => setProcessAccess(e.target.checked)} />
                    <span>
                      Process access to <code>{container}</code>
                      <br />
                      <span className={classes.warn}>
                        Shares the container's process namespace: you see its processes. Its files and environment (secrets) under
                        /proc are readable only when the app runs as the same non-root user as the debug container (65532); an app
                        running as root keeps them. Shown on the session record.
                      </span>
                    </span>
                  </label>
                  {flight ? (
                    <span className={classes.hint}>
                      On Flight the last ready pod is never restarted for you: it keeps the debug container until the next rollout.
                    </span>
                  ) : (
                    <label className={classes.radio}>
                      <input type="checkbox" checked={recycleLastPod} onChange={e => setRecycleLastPod(e.target.checked)} />
                      <span>
                        Restart the pod at the end even if it is the only ready one
                        <br />
                        <span className={classes.hint}>Otherwise a last ready pod keeps the debug container until you restart it.</span>
                      </span>
                    </label>
                  )}
                </>
              )}
              {containers.length > 1 && (
                <Field id="bg-container" label="Container">
                  {p => (
                    <select {...p} value={container} onChange={e => setContainer(e.target.value)}>
                      {containers.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  )}
                </Field>
              )}
              <Field id="bg-duration" label="Duration">
                {p => (
                  <select {...p} value={duration} onChange={e => setDuration(Number(e.target.value) as 15 | 30 | 60)}>
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>60 minutes</option>
                  </select>
                )}
              </Field>
            </div>
            <div className={classes.full}>
              <Field id="bg-reason" label="Reason (required)">
                {p => <textarea {...p} rows={2} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} placeholder="What are you looking for?" />}
              </Field>
            </div>
            <div className={classes.full}>
              <Field id="bg-ticket" label="Incident or ticket link (optional)">
                {p => <input {...p} type="url" value={ticketUrl} onChange={e => setTicketUrl(e.target.value)} placeholder="https://" />}
              </Field>
            </div>
          </div>
          {flight && listInfo.canBreakGlass && (
            <label className={classes.radio} data-testid="breakglass-glass-broken">
              <input type="checkbox" checked={glassBroken} onChange={e => setGlassBroken(e.target.checked)} />
              <span>
                <b>Break glass: start now, with no second person</b> (admins)
                <br />
                <span className={classes.warn}>
                  For when no one else can approve in time. Everyone is told at once, it is audited as critical, and the session is
                  review-due until an owner of {appName} other than you, or another admin, watches the recording and signs it off.
                </span>
              </span>
            </label>
          )}
          <div className={classes.actions}>
            <Button
              variant="danger"
              disabled={busy || ending || !reason.trim() || !!mine || !!mineElsewhere || listInfo.recordingsConfigured === false}
              onClick={start}
            >
              {startLabel()}
            </Button>
            {busy && <span className={classes.hint}>This can take up to two minutes.</span>}
          </div>
        </>
      )}
      {error && <span className={classes.bad}>{error}</span>}

      <BreakglassEnvironmentView env={env} tier={tier} data={data} linkedSessionId={linkedSessionId} hostTerminal={false} />
    </div>
  );
}
