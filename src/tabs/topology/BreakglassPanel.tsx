import { useCallback, useEffect, useRef, useState } from 'react';
import { discoveryApiRef, fetchApiRef, identityApiRef, useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { formatDateTime, relativeTime } from '../../shared/format';
import type { EnvironmentSummary, EnvTier } from '../../types';
import { Button, Field, StatusChip } from '../../ui';

// Break-glass debug, phase 2 (Ground only, no approval; backstage breakglass.ts). An owner opens a recorded,
// time-boxed terminal on one pod: in a copy of the pod (copy mode, recommended: the live pod is untouched) or in a
// debug container added to the live pod (live mode, which restarts the pod when the session ends, because the debug
// container stays in the pod spec for the pod's life). The terminal never sees a Kubernetes credential: it is a
// WebSocket to the Backstage backend, which attaches to the debug container and records every byte both ways.

export interface BreakglassSession {
  id: string;
  app: string;
  env: string;
  pod: string;
  container: string;
  mode: 'copy' | 'live';
  processAccess: boolean;
  reason: string;
  ticketUrl?: string;
  requester: string;
  createdAt: string;
  expiresAt: string;
  endedAt?: string;
  endReason?: string;
  endedBy?: string;
  copyPod?: string;
  recordingKey?: string;
  recordingSha256?: string;
  recordingBytes?: number;
  recycled?: boolean;
  cleanupNotes?: string;
  state: 'active' | 'ended';
  attached?: boolean;
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  root: { display: 'flex', flexDirection: 'column', gap: 12 },
  form: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px 16px' },
  full: { gridColumn: '1 / -1' },
  radios: { display: 'flex', flexDirection: 'column', gap: 6 },
  radio: { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: ({ t }) => t.textHi, cursor: 'pointer' },
  hint: { fontSize: 11, color: ({ t }) => t.textFaint, lineHeight: 1.45 },
  warn: { fontSize: 11, color: ({ t }) => t.amberInk, lineHeight: 1.45 },
  bad: { fontSize: 11.5, color: ({ t }) => t.bad },
  actions: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  banner: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    flexWrap: 'wrap',
    padding: '8px 12px',
    borderRadius: 6,
    backgroundColor: ({ t }) => t.badSoft,
    border: ({ t }) => `1px solid ${t.bad}`,
    color: ({ t }) => t.bad,
    fontFamily: fontMono,
    fontSize: 11.5,
    fontWeight: 700,
  },
  bannerMeta: { fontWeight: 400, color: ({ t }) => t.textHi },
  countdown: { fontVariantNumeric: 'tabular-nums' },
  terminal: { height: 380, borderRadius: 6, overflow: 'hidden', backgroundColor: '#0b0f14', padding: 6 },
  history: { display: 'flex', flexDirection: 'column', gap: 4 },
  row: { display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', fontFamily: fontMono, fontSize: 11 },
  rowMeta: { color: ({ t }) => t.textFaint },
  link: { color: ({ t }) => t.sky, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' },
}));

async function api<T>(discoveryApi: { getBaseUrl(id: string): Promise<string> }, fetchApi: { fetch: typeof fetch }, path: string, init?: RequestInit): Promise<T> {
  const base = await discoveryApi.getBaseUrl('glidepath');
  const res = await fetchApi.fetch(`${base}/breakglass${path}`, init);
  const body = await res.json().catch(() => undefined);
  if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
  return body as T;
}

function remaining(expiresAt: string, now: number): string {
  const s = Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The live terminal: xterm.js over the backend's attach WebSocket (the user's Backstage token as the subprotocol). */
function BreakglassTerminal({ session, onClosed }: { session: BreakglassSession; onClosed: (reason: string, ended: boolean) => void }) {
  const discoveryApi = useApi(discoveryApiRef);
  const identityApi = useApi(identityApiRef);
  const ref = useRef<HTMLDivElement>(null);
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;

  useEffect(() => {
    if (!ref.current) return undefined;
    const term = new Terminal({ cursorBlink: true, fontFamily: fontMono, fontSize: 12, convertEol: false, scrollback: 5000 });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(ref.current);
    fit.fit();
    let ws: WebSocket | undefined;
    let done = false;
    const finish = (reason: string, ended: boolean) => {
      if (done) return;
      done = true;
      closedRef.current(reason, ended);
    };
    const send = (msg: Record<string, unknown>) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };
    (async () => {
      const base = await discoveryApi.getBaseUrl('glidepath');
      const { token } = await identityApi.getCredentials();
      if (!token) {
        finish('You need to be signed in to open a terminal.', false);
        return;
      }
      ws = new WebSocket(`${base.replace(/^http/, 'ws')}/breakglass/sessions/${session.id}/attach`, token);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        send({ type: 'resize', cols: term.cols, rows: term.rows });
        term.focus();
      };
      ws.onmessage = ev => {
        if (typeof ev.data !== 'string') {
          term.write(new Uint8Array(ev.data as ArrayBuffer));
          return;
        }
        try {
          const msg = JSON.parse(ev.data) as { type: string; reason?: string; message?: string };
          if (msg.type === 'ended') finish(`Session ended: ${msg.reason ?? ''}`, true);
          else if (msg.type === 'detached') finish(msg.reason ?? 'Disconnected.', false);
          else if (msg.type === 'error') term.write(`\r\n\x1b[31m${msg.message ?? 'error'}\x1b[0m\r\n`);
        } catch {
          // not a control message
        }
      };
      ws.onclose = ev => finish(ev.code === 1000 ? 'Session ended.' : 'Disconnected from the session. Reopen it within 2 minutes or it ends.', ev.code === 1000);
    })().catch(e => finish(e instanceof Error ? e.message : String(e), false));
    const input = term.onData(data => send({ type: 'input', data }));
    const resize = term.onResize(({ cols, rows }) => send({ type: 'resize', cols, rows }));
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // detached element
      }
    });
    observer.observe(ref.current);
    return () => {
      done = true;
      observer.disconnect();
      input.dispose();
      resize.dispose();
      ws?.close();
      term.dispose();
    };
  }, [discoveryApi, identityApi, session.id]);

  const t = useHangarTokens();
  const classes = useStyles({ t });
  return <div ref={ref} className={classes.terminal} data-testid="breakglass-terminal" />;
}

export function BreakglassPanel({ env, podName, containers, tier }: { env: EnvironmentSummary; podName: string; containers: string[]; tier: EnvTier }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const appName = env.appName;

  const [mode, setMode] = useState<'copy' | 'live'>('copy');
  const [processAccess, setProcessAccess] = useState(false);
  const [recycleLastPod, setRecycleLastPod] = useState(false);
  const [duration, setDuration] = useState<15 | 30 | 60>(15);
  const [reason, setReason] = useState('');
  const [ticketUrl, setTicketUrl] = useState('');
  const [container, setContainer] = useState(containers[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [sessions, setSessions] = useState<BreakglassSession[]>([]);
  const [listInfo, setListInfo] = useState<{ user?: string; recordingsConfigured?: boolean; error?: string }>({});
  const [open, setOpen] = useState<BreakglassSession | undefined>();
  const [closedNote, setClosedNote] = useState<string | undefined>();
  const [attachKey, setAttachKey] = useState(0);
  const [detached, setDetached] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    if (!appName) return;
    try {
      const body = await api<{ sessions: BreakglassSession[]; user: string; recordingsConfigured: boolean }>(
        discoveryApi,
        fetchApi,
        `/sessions?${new URLSearchParams({ app: appName, env: env.env })}`,
      );
      setSessions(body.sessions);
      setListInfo({ user: body.user, recordingsConfigured: body.recordingsConfigured });
    } catch (e) {
      setListInfo({ error: e instanceof Error ? e.message : String(e) });
    }
  }, [discoveryApi, fetchApi, appName, env.env]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);

  if (!appName) return <span className={classes.hint}>No app is known for this environment.</span>;
  if (tier !== 'lower') {
    return (
      <span className={classes.hint}>
        Break-glass debug is available on Ground environments only. Flight needs a second person's approval, which is not built yet.
      </span>
    );
  }

  const mine = sessions.find(s => s.state === 'active' && s.requester === listInfo.user && s.pod === podName);

  const start = async () => {
    setBusy(true);
    setError(undefined);
    setClosedNote(undefined);
    try {
      const body = await api<{ session: BreakglassSession }>(discoveryApi, fetchApi, '/sessions', {
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
          recycleLastPod: mode === 'live' && recycleLastPod,
          durationMinutes: duration,
          reason,
          ...(ticketUrl.trim() ? { ticketUrl: ticketUrl.trim() } : {}),
        }),
      });
      setOpen(body.session);
      setDetached(false);
      setReason('');
      setTicketUrl('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      load();
    }
  };

  const end = async (id: string) => {
    setEnding(true);
    try {
      await api(discoveryApi, fetchApi, `/sessions/${id}/end`, { method: 'POST' });
      setOpen(undefined);
      setClosedNote('Session ended.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnding(false);
      load();
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

  return (
    <div className={classes.root} data-testid="breakglass-panel">
      {open ? (
        <>
          <div className={classes.banner} role="status">
            <span>● Recorded break-glass session</span>
            <span className={classes.bannerMeta}>
              {open.mode === 'live' ? `live: debug container in ${open.pod}` : `copy of ${open.pod}${open.copyPod ? ` (${open.copyPod})` : ''}`}
              {open.processAccess ? ', with process access' : ''}
            </span>
            <span className={`${classes.bannerMeta} ${classes.countdown}`} title={`Ends at ${formatDateTime(open.expiresAt)}`}>
              {remaining(open.expiresAt, now)} left
            </span>
            <span style={{ flex: 1 }} />
            <Button variant="danger" small disabled={ending} onClick={() => end(open.id)}>
              {ending ? 'Ending…' : 'End session'}
            </Button>
          </div>
          {open.mode === 'live' && <span className={classes.warn}>This pod will be restarted when you end the session.</span>}
          <BreakglassTerminal
            key={attachKey}
            session={open}
            onClosed={(note, ended) => {
              setClosedNote(note);
              if (ended) setOpen(undefined);
              else setDetached(true);
              load();
            }}
          />
          {closedNote && (
            <div className={classes.actions}>
              <span className={classes.hint}>{closedNote}</span>
              {detached && (
                <Button
                  small
                  onClick={() => {
                    setDetached(false);
                    setClosedNote(undefined);
                    setAttachKey(k => k + 1);
                  }}
                >
                  Reconnect
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {mine && (
            <div className={classes.actions}>
              <span className={classes.warn}>
                You have an active session on this pod (ends {relativeTime(mine.expiresAt)}).
              </span>
              <Button
                small
                onClick={() => {
                  setClosedNote(undefined);
                  setDetached(false);
                  setOpen(mine);
                }}
              >
                Reopen terminal
              </Button>
              <Button small variant="danger" disabled={ending} onClick={() => end(mine.id)}>{ending ? 'Ending…' : 'End it'}</Button>
            </div>
          )}
          {closedNote && <span className={classes.hint}>{closedNote}</span>}
          {ending && <span className={classes.hint}>Ending the session: removing the grant and the debug pod, saving the recording…</span>}
          <span className={classes.hint}>
            A time-boxed shell in a hardened debug container (busybox, non-root, read-only, no capabilities). Everything typed and shown is
            recorded and kept for a year; the session is audited.
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
              {mode === 'live' && (
                <>
                  <label className={classes.radio}>
                    <input type="checkbox" checked={processAccess} onChange={e => setProcessAccess(e.target.checked)} />
                    <span>
                      Process access to <code>{container}</code>
                      <br />
                      <span className={classes.warn}>
                        Shares the container's process namespace: you see its processes and, as the same user, its files and environment
                        (secrets) under /proc. Shown on the session record.
                      </span>
                    </span>
                  </label>
                  <label className={classes.radio}>
                    <input type="checkbox" checked={recycleLastPod} onChange={e => setRecycleLastPod(e.target.checked)} />
                    <span>
                      Restart the pod at the end even if it is the only ready one
                      <br />
                      <span className={classes.hint}>Otherwise a last ready pod keeps the debug container until you restart it.</span>
                    </span>
                  </label>
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
          <div className={classes.actions}>
            <Button variant="danger" disabled={busy || ending || !reason.trim() || !!mine || listInfo.recordingsConfigured === false} onClick={start}>
              {busy ? 'Preparing the debug container…' : 'Start recorded session'}
            </Button>
            {busy && <span className={classes.hint}>This can take up to two minutes.</span>}
          </div>
        </>
      )}
      {error && <span className={classes.bad}>{error}</span>}

      <div className={classes.history}>
        <span className={classes.hint} style={{ fontWeight: 700 }}>Break-glass sessions in {env.env}</span>
        {listInfo.error && <span className={classes.bad}>{listInfo.error}</span>}
        {!listInfo.error && sessions.length === 0 && <span className={classes.hint}>None yet.</span>}
        {sessions.map(s => (
          <div key={s.id} className={classes.row}>
            <StatusChip tone={s.state === 'active' ? 'warn' : 'neutral'}>{s.state}</StatusChip>
            <span title={formatDateTime(s.createdAt)}>{relativeTime(s.createdAt)}</span>
            <span>{s.mode}{s.processAccess ? ' + process access' : ''}</span>
            <span>{s.pod}</span>
            <span className={classes.rowMeta}>{s.requester.replace(/^user:[^/]+\//, '')}</span>
            <span className={classes.rowMeta} title={s.reason}>“{s.reason.length > 60 ? `${s.reason.slice(0, 60)}…` : s.reason}”</span>
            {s.ticketUrl && (
              <a className={classes.link} href={s.ticketUrl} target="_blank" rel="noopener noreferrer">ticket</a>
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
              <button type="button" className={classes.link} onClick={() => download(s)} title={`SHA-256 ${s.recordingSha256 ?? ''}`}>
                recording
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
