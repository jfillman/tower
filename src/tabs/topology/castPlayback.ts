// Break-glass recordings are asciicast v2 (backstage breakglassSpec.ts CastRecorder): a JSON header line, then one
// [seconds, kind, data] line per event, kind 'o' (output), 'i' (input) or 'r' (resize, "COLSxROWS"). Tower replays them
// in the same xterm.js it uses for the live terminal, so a recording looks exactly as the session did; no player
// dependency (phase 4, 2026-10-11). Input is not replayed: the shell's own echo is in the output.

export interface CastEvent {
  /** Seconds from the start, with idle gaps shortened (see parseCast). */
  t: number;
  kind: 'o' | 'r';
  data: string;
}

export interface Cast {
  width: number;
  height: number;
  title?: string;
  /** When the session started (the header's timestamp, Unix seconds). */
  startedAt?: number;
  events: CastEvent[];
  /** Playback length in seconds, after idle gaps are shortened. */
  duration: number;
  /** Length as recorded, in seconds. */
  recordedDuration: number;
  /** How many input events the recording holds (shown, not replayed). */
  inputs: number;
}

/**
 * Parse a recording. Gaps longer than `idleLimit` seconds play as `idleLimit` (asciinema's idle_time_limit), so a
 * session where someone stopped to read does not replay minutes of nothing. A malformed line is skipped, not fatal:
 * the last checkpoint of a session whose backend died can end mid-write.
 */
export function parseCast(text: string, idleLimit = 2): Cast {
  const lines = text.split('\n').filter(l => l.trim());
  if (!lines.length) throw new Error('the recording is empty');
  let header: { version?: unknown; width?: unknown; height?: unknown; title?: unknown; timestamp?: unknown };
  try {
    header = JSON.parse(lines[0]);
  } catch {
    throw new Error('the recording has no asciicast header');
  }
  if (header.version !== 2) throw new Error(`unsupported asciicast version ${String(header.version)}`);
  const events: CastEvent[] = [];
  let inputs = 0;
  let last = 0;
  let played = 0;
  for (const line of lines.slice(1)) {
    let ev: unknown;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (!Array.isArray(ev) || typeof ev[0] !== 'number' || typeof ev[2] !== 'string') continue;
    const [t, kind, data] = ev as [number, string, string];
    if (kind === 'i') {
      inputs++;
      continue;
    }
    if (kind !== 'o' && kind !== 'r') continue;
    played += Math.min(Math.max(t - last, 0), idleLimit);
    last = Math.max(last, t);
    events.push({ t: played, kind, data });
  }
  return {
    width: typeof header.width === 'number' ? header.width : 80,
    height: typeof header.height === 'number' ? header.height : 24,
    ...(typeof header.title === 'string' ? { title: header.title } : {}),
    ...(typeof header.timestamp === 'number' ? { startedAt: header.timestamp } : {}),
    events,
    duration: played,
    recordedDuration: last,
    inputs,
  };
}

/** The index just past the last event at or before `t` seconds, searching from `from`. */
export function eventsUntil(events: CastEvent[], t: number, from = 0): number {
  let i = from;
  while (i < events.length && events[i].t <= t) i++;
  return i;
}

/** A resize event's "COLSxROWS", or undefined when it is not one. */
export function parseSize(data: string): { cols: number; rows: number } | undefined {
  const m = /^(\d+)x(\d+)$/.exec(data);
  return m ? { cols: Number(m[1]), rows: Number(m[2]) } : undefined;
}

/** m:ss */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Hex SHA-256 of the recording's bytes, to check against the session record. Undefined where Web Crypto is missing. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return undefined;
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
