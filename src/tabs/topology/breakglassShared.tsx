import { useCallback, useEffect, useRef, useState } from 'react';
import { discoveryApiRef, fetchApiRef, identityApiRef, useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { Button, Hint } from '../../ui';

// What the break-glass form (BreakglassPanel, per pod) and the environment view (BreakglassEnvironmentView, per
// environment) share: the session record as the backend lists it, the API helper, the sessions hook, the terminal
// and the styles. See BreakglassPanel.tsx for the design notes.

export interface BreakglassSession {
  id: string;
  app: string;
  env: string;
  pod: string;
  container: string;
  mode: 'copy' | 'live';
  processAccess: boolean;
  volumeAccess?: boolean;
  volumes?: Array<{ volume: string; kind: string; path: string; appPaths: string[] }>;
  /** Phase C: could read Secrets (volume or process access), so the recording is restricted. */
  sensitive?: boolean;
  /** Phase C: copy mode with the app's containers held (no work runs). */
  holdApp?: boolean;
  /** Phase C: what the target pod ran when the session was requested, for the approver. */
  podImage?: string;
  podImageId?: string;
  /** Phase C: the approver kept the pod after a live session, with their reason. */
  recycleWaivedReason?: string;
  /** Phase C: a review-due session nobody but the requester could review (owners, admins and the fallback group). */
  noReviewer?: boolean;
  reviewRemindedAt?: string;
  reviewEscalatedAt?: string;
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
  /** Phase B: the object-locked bucket and the version the hash names; older rows have neither. */
  recordingBucket?: string;
  recordingVersion?: string;
  /** Phase B: the Rekor entry anchoring the recording's SHA-256, or why the last attempt failed. */
  recordingRekorIndex?: number;
  recordingRekorUuid?: string;
  anchorAttemptedAt?: string;
  anchorError?: string;
  recycled?: boolean;
  cleanupNotes?: string;
  /** Ground: active -> ended. Flight: requested -> approved -> active -> ended (a deny or expiry ends it early). */
  state: 'requested' | 'approved' | 'active' | 'ended';
  tier?: 'ground' | 'flight';
  durationMinutes?: number;
  approver?: string;
  approvedAt?: string;
  decisionNote?: string;
  startedAt?: string;
  /** The session's one free extension (+15 minutes), if used. */
  extendedAt?: string;
  /** Phase 4: opened by an admin with no second person; review-due until someone else reviews it. */
  glassBroken?: boolean;
  reviewState?: 'due' | 'done';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  /** When the recordings bucket deletes the recording (its retention, counted from the end). */
  recordingExpiresAt?: string;
  attached?: boolean;
}

/** What the list route says about the viewer: who they are and which controls they get (each route checks again). */
export interface BreakglassListInfo {
  user?: string;
  recordingsConfigured?: boolean;
  recordingRetentionDays?: number;
  canBreakGlass?: boolean;
  canReview?: boolean;
  canTerminate?: boolean;
  error?: string;
}

export const shortUser = (ref: string) => ref.replace(/^user:[^/]+\//, '');

export const useBreakglassStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  root: { display: 'flex', flexDirection: 'column', gap: 12 },
  form: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px 16px' },
  full: { gridColumn: '1 / -1' },
  radios: { display: 'flex', flexDirection: 'column', gap: 6 },
  radio: { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: ({ t }) => t.textHi, cursor: 'pointer' },
  warn: { fontSize: 11, color: ({ t }) => t.amberInk, lineHeight: 1.45 },
  bad: { fontSize: 11.5, color: ({ t }) => t.bad },
  // Shared with BreakglassEnvironmentView and BreakglassPanel, which use them inline inside labels and rows.
  hint: { fontSize: 11, color: ({ t }) => t.textFaint, lineHeight: 1.45 },
  link: { color: ({ t }) => t.sky, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' },
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
  rowLinked: { outline: ({ t }) => `1px solid ${t.skyLine}`, backgroundColor: ({ t }) => t.skySoft, borderRadius: 4, padding: '4px 6px' },
  rowMeta: { color: ({ t }) => t.textFaint },
  badge: {
    fontFamily: fontMono,
    fontSize: 10.5,
    fontWeight: 700,
    padding: '0 6px',
    borderRadius: 9,
    backgroundColor: ({ t }) => t.amber,
    color: ({ t }) => t.bg,
    marginLeft: 6,
  },
}));

export async function breakglassApi<T>(
  discoveryApi: { getBaseUrl(id: string): Promise<string> },
  fetchApi: { fetch: typeof fetch },
  path: string,
  init?: RequestInit,
): Promise<T> {
  const base = await discoveryApi.getBaseUrl('glidepath');
  const res = await fetchApi.fetch(`${base}/breakglass${path}`, init);
  const body = await res.json().catch(() => undefined);
  if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
  return body as T;
}

export function remaining(expiresAt: string, now: number): string {
  const s = Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Someone else's request this viewer could decide (the route checks tower.breakglass.approve again). */
export const toDecideOf = (sessions: BreakglassSession[], info: BreakglassListInfo) =>
  sessions.filter(s => s.state === 'requested' && s.requester !== info.user);

/** An ended glass-broken session this viewer may review: someone who could have approved, never the requester. */
export const mayReview = (s: BreakglassSession, info: BreakglassListInfo) =>
  !!info.canReview && !!s.glassBroken && s.reviewState === 'due' && s.state === 'ended' && s.requester !== info.user;

/** Who may end a session from the UI: its own user, its approver, or an admin (tower.breakglass.terminate). */
export const mayEnd = (s: BreakglassSession, info: BreakglassListInfo) =>
  s.state !== 'ended' && (s.requester === info.user || (!!s.approver && s.approver === info.user) || !!info.canTerminate);

/** How many things in this list need the viewer: requests to decide, their own approved request, reviews to do. */
export function needsYou(sessions: BreakglassSession[], info: BreakglassListInfo): number {
  if (!info.user) return 0;
  const decide = info.canReview === false ? 0 : toDecideOf(sessions, info).length;
  const start = sessions.filter(s => s.state === 'approved' && s.requester === info.user).length;
  const review = sessions.filter(s => mayReview(s, info)).length;
  return decide + start + review;
}

export interface BreakglassData {
  sessions: BreakglassSession[];
  info: BreakglassListInfo;
  load: () => Promise<void>;
}

/**
 * The environment's sessions and the viewer's capabilities, from GET /breakglass/sessions. A linked session (a deep
 * link from a notification or the queue) past the list's window is fetched by id and listed with the rest. The list
 * is read again every 10 s while a request is waiting on someone or a session is running.
 */
export function useBreakglassSessions(appName: string | undefined, env: string, linkedSessionId?: string): BreakglassData {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [sessions, setSessions] = useState<BreakglassSession[]>([]);
  const [info, setInfo] = useState<BreakglassListInfo>({});

  const load = useCallback(async () => {
    if (!appName) return;
    try {
      const body = await breakglassApi<{ sessions: BreakglassSession[] } & BreakglassListInfo>(
        discoveryApi,
        fetchApi,
        `/sessions?${new URLSearchParams({ app: appName, env })}`,
      );
      let rows = body.sessions;
      if (linkedSessionId && !rows.some(s => s.id === linkedSessionId)) {
        try {
          const one = await breakglassApi<{ session: BreakglassSession }>(discoveryApi, fetchApi, `/sessions/${encodeURIComponent(linkedSessionId)}`);
          if (one.session.app === appName && one.session.env === env) rows = [...rows, one.session];
        } catch {
          // No such session, or not this viewer's to see: the list stands.
        }
      }
      setSessions(rows);
      setInfo({
        user: body.user,
        recordingsConfigured: body.recordingsConfigured,
        recordingRetentionDays: body.recordingRetentionDays,
        canBreakGlass: body.canBreakGlass,
        canReview: body.canReview,
        canTerminate: body.canTerminate,
      });
    } catch (e) {
      setInfo(i => ({ ...i, error: e instanceof Error ? e.message : String(e) }));
    }
  }, [discoveryApi, fetchApi, appName, env, linkedSessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const moving = sessions.some(s => s.state !== 'ended');
  useEffect(() => {
    if (!moving) return undefined;
    const timer = setInterval(() => load(), 10_000);
    return () => clearInterval(timer);
  }, [moving, load]);

  return { sessions, info, load };
}

/** Seconds ticking while something has a countdown. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** The live terminal: xterm.js over the backend's attach WebSocket (the user's Backstage token as the subprotocol). */
export function BreakglassTerminal({ session, onClosed }: { session: BreakglassSession; onClosed: (reason: string, ended: boolean) => void }) {
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
  const classes = useBreakglassStyles({ t });
  return <div ref={ref} className={classes.terminal} data-testid="breakglass-terminal" />;
}

/**
 * An open session's banner, terminal and after-close controls, hosted by whichever component started or reopened it
 * (the pod's form for a new session; the environment view for a Start or Reopen from there).
 */
export function OpenSession({
  open,
  now,
  onExtend,
  onEnd,
  onClosed,
  ending,
}: {
  open: BreakglassSession;
  now: number;
  onExtend: (id: string) => void;
  onEnd: (id: string) => void;
  onClosed: (note: string, ended: boolean) => void;
  ending: boolean;
}) {
  const t = useHangarTokens();
  const classes = useBreakglassStyles({ t });
  const [closedNote, setClosedNote] = useState<string | undefined>();
  const [attachKey, setAttachKey] = useState(0);
  const [detached, setDetached] = useState(false);
  return (
    <>
      <div className={classes.banner} role="status">
        <span>● Recorded break-glass session</span>
        {open.glassBroken && <span>Glass broken: no second person, review due</span>}
        <span className={classes.bannerMeta}>
          {open.mode === 'live' ? `live: debug container in ${open.pod}` : `copy of ${open.pod}${open.copyPod ? ` (${open.copyPod})` : ''}`}
          {open.processAccess ? ', with process access' : ''}
          {open.volumeAccess ? ', with volume access' : ''}
        </span>
        <span className={`${classes.bannerMeta} ${classes.countdown}`} title={`Ends at ${new Date(open.expiresAt).toLocaleString()}`}>
          {remaining(open.expiresAt, now)} left{open.extendedAt ? ' (extended)' : ''}
        </span>
        <span style={{ flex: 1 }} />
        {!open.extendedAt && (
          <Button small disabled={ending} title="Your one free extension: 15 more minutes, no approval." onClick={() => onExtend(open.id)}>
            Extend +15 min
          </Button>
        )}
        <Button small variant="danger" disabled={ending} onClick={() => onEnd(open.id)}>
          {ending ? 'Ending…' : 'End session'}
        </Button>
      </div>
      {open.mode === 'live' && <span className={classes.warn}>This pod will be restarted when you end the session.</span>}
      {open.volumeAccess && (
        <div className={classes.history} data-testid="breakglass-volumes">
          {(open.volumes ?? []).length === 0 ? (
            <Hint>Volume access: {open.container} mounts no volumes besides its service account token.</Hint>
          ) : (
            (open.volumes ?? []).map(v => (
              <span key={v.volume} className={classes.row}>
                <span>{v.path}</span>
                <span className={classes.rowMeta}>
                  {v.kind}, read-only · in the app: {v.appPaths.join(', ')}
                </span>
              </span>
            ))
          )}
        </div>
      )}
      <BreakglassTerminal
        key={attachKey}
        session={open}
        onClosed={(note, ended) => {
          setClosedNote(note);
          if (!ended) setDetached(true);
          onClosed(note, ended);
        }}
      />
      {closedNote && (
        <div className={classes.actions}>
          <Hint>{closedNote}</Hint>
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
  );
}
