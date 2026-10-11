import { useCallback, useEffect, useRef, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { formatDateTime } from '../../shared/format';
import { Button, StatusChip } from '../../ui';
import { clock, eventsUntil, parseCast, parseSize, sha256Hex, type Cast } from './castPlayback';

// The break-glass recording player (phase 4): the session's asciicast replayed in xterm.js, read-only, with play/pause,
// speed and a seek bar. The bytes are fetched through the backend (audited as a play, owners and admins only) and
// hashed in the browser against the SHA-256 the backend stored when the session ended, so a viewer can see the
// recording is the one the session record names.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  root: { display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 6, border: ({ t }) => `1px solid ${t.line}` },
  bar: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontFamily: fontMono, fontSize: 11 },
  meta: { color: ({ t }) => t.textFaint, fontFamily: fontMono, fontSize: 11 },
  bad: { fontSize: 11.5, color: ({ t }) => t.bad },
  screen: { maxHeight: 420, overflow: 'auto', borderRadius: 6, backgroundColor: '#0b0f14', padding: 6 },
  seek: { flex: 1, minWidth: 120 },
  clock: { fontVariantNumeric: 'tabular-nums' },
}));

export interface PlayableSession {
  id: string;
  app: string;
  env: string;
  recordingSha256?: string;
  recordingExpiresAt?: string;
  /** Phase B: the Rekor entry holding this SHA-256 (verify with `rekor-cli get --log-index N`), or why there is none yet. */
  recordingRekorIndex?: number;
  recordingRekorUuid?: string;
  anchorError?: string;
}

type Integrity = 'match' | 'mismatch' | 'unchecked';

const playLabel = (playing: boolean, pos: number, duration: number) => {
  if (playing) return 'Pause';
  return duration > 0 && pos >= duration ? 'Replay' : 'Play';
};

export function RecordingPlayer({ session, onClose }: { session: PlayableSession; onClose: () => void }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const screenRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal>();
  // Where playback is: seconds into the (idle-shortened) timeline, and the next event to apply.
  const at = useRef({ t: 0, i: 0 });
  const [cast, setCast] = useState<Cast>();
  const [integrity, setIntegrity] = useState<Integrity>();
  const [error, setError] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [pos, setPos] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const base = await discoveryApi.getBaseUrl('glidepath');
      const res = await fetchApi.fetch(`${base}/breakglass/sessions/${session.id}/recording?purpose=play`);
      if (!res.ok) throw new Error((await res.json().catch(() => undefined))?.error ?? `the recording could not be loaded (${res.status})`);
      const bytes = await res.arrayBuffer();
      const hex = session.recordingSha256 ? await sha256Hex(bytes) : undefined;
      const parsed = parseCast(new TextDecoder().decode(bytes));
      if (cancelled) return;
      if (!session.recordingSha256 || hex === undefined) setIntegrity('unchecked');
      else setIntegrity(hex === session.recordingSha256 ? 'match' : 'mismatch');
      setCast(parsed);
    })().catch(e => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [discoveryApi, fetchApi, session.id, session.recordingSha256]);

  useEffect(() => {
    if (!cast || !screenRef.current) return undefined;
    const term = new Terminal({
      cols: cast.width,
      rows: cast.height,
      disableStdin: true,
      cursorBlink: false,
      fontFamily: fontMono,
      fontSize: 12,
      scrollback: 5000,
    });
    term.open(screenRef.current);
    termRef.current = term;
    at.current = { t: 0, i: 0 };
    return () => {
      termRef.current = undefined;
      term.dispose();
    };
  }, [cast]);

  /** Apply events [from, to) in order: output is batched between resizes. */
  const apply = useCallback(
    (from: number, to: number) => {
      const term = termRef.current;
      if (!term || !cast) return;
      let chunk = '';
      for (let i = from; i < to; i++) {
        const ev = cast.events[i];
        if (ev.kind === 'o') {
          chunk += ev.data;
          continue;
        }
        const size = parseSize(ev.data);
        if (!size) continue;
        if (chunk) term.write(chunk);
        chunk = '';
        term.resize(size.cols, size.rows);
      }
      if (chunk) term.write(chunk);
    },
    [cast],
  );

  const seek = useCallback(
    (target: number) => {
      const term = termRef.current;
      if (!term || !cast) return;
      term.reset();
      term.resize(cast.width, cast.height);
      const to = eventsUntil(cast.events, target);
      apply(0, to);
      at.current = { t: target, i: to };
      setPos(target);
    },
    [apply, cast],
  );

  useEffect(() => {
    if (!playing || !cast) return undefined;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const target = Math.min(at.current.t + ((now - last) / 1000) * speed, cast.duration);
      last = now;
      const to = eventsUntil(cast.events, target, at.current.i);
      apply(at.current.i, to);
      at.current = { t: target, i: to };
      setPos(target);
      if (target >= cast.duration) setPlaying(false);
    }, 50);
    return () => clearInterval(timer);
  }, [playing, speed, cast, apply]);

  const togglePlay = () => {
    if (!cast) return;
    if (!playing && at.current.t >= cast.duration) seek(0);
    setPlaying(p => !p);
  };

  return (
    <div className={classes.root} data-testid="breakglass-player">
      <div className={classes.bar}>
        <b>Recording</b>
        <span className={classes.meta}>{session.id}</span>
        {integrity === 'match' && (
          <StatusChip tone="ok" title={`SHA-256 ${session.recordingSha256}`}>SHA-256 matches the session record</StatusChip>
        )}
        {integrity === 'mismatch' && (
          <StatusChip tone="bad" title={`The record says ${session.recordingSha256}`}>SHA-256 does not match the session record</StatusChip>
        )}
        {session.recordingRekorIndex !== undefined && (
          <StatusChip tone="ok" title={`rekor-cli get --log-index ${session.recordingRekorIndex} returns this SHA-256 (entry ${session.recordingRekorUuid ?? ''})`}>
            anchored in Rekor #{session.recordingRekorIndex}
          </StatusChip>
        )}
        {session.recordingRekorIndex === undefined && session.recordingSha256 && (
          <StatusChip tone="warn" title={session.anchorError ?? 'The backend retries for a day after the session ends'}>
            not anchored in Rekor
          </StatusChip>
        )}
        {integrity === 'unchecked' && (
          <StatusChip tone="neutral" title="The browser can hash only on https or localhost, and only a session with a stored hash">
            integrity not checked
          </StatusChip>
        )}
        <span style={{ flex: 1 }} />
        <Button small onClick={onClose}>Close</Button>
      </div>
      {error && <span className={classes.bad}>{error}</span>}
      {!error && !cast && <span className={classes.meta}>Loading the recording…</span>}
      {cast && (
        <>
          <div className={classes.bar}>
            <Button small onClick={togglePlay}>{playLabel(playing, pos, cast.duration)}</Button>
            <input
              aria-label="Seek"
              className={classes.seek}
              type="range"
              min={0}
              max={Math.max(cast.duration, 0.001)}
              step={0.1}
              value={pos}
              onChange={e => seek(Number(e.target.value))}
            />
            <span className={classes.clock}>
              {clock(pos)} / {clock(cast.duration)}
            </span>
            <select aria-label="Speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}>
              {[0.5, 1, 2, 4, 8].map(s => (
                <option key={s} value={s}>{s}×</option>
              ))}
            </select>
          </div>
          <span className={classes.meta}>
            {cast.startedAt ? `Started ${formatDateTime(new Date(cast.startedAt * 1000).toISOString())}. ` : ''}
            Recorded {clock(cast.recordedDuration)}
            {cast.recordedDuration - cast.duration > 1 ? `; pauses over 2 s play as 2 s` : ''}. {cast.inputs} keystroke events (their echo is in the
            output).
            {session.recordingExpiresAt ? ` Kept until ${formatDateTime(session.recordingExpiresAt)}.` : ''}
          </span>
        </>
      )}
      <div ref={screenRef} className={classes.screen} hidden={!cast} data-testid="breakglass-player-screen" />
    </div>
  );
}
