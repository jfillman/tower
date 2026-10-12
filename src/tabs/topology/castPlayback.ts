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
  // crypto.subtle exists only in a secure context (HTTPS or localhost). This Backstage is served over plain HTTP, so
  // the player showed "integrity not checked" for every recording (2026-10-12); the pure-JS digest below is the same
  // SHA-256, just slower, and a recording is a few hundred KB at most.
  if (!subtle) return sha256HexJs(new Uint8Array(bytes));
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 (FIPS 180-4) in plain JavaScript, for pages without crypto.subtle. */
export function sha256HexJs(data: Uint8Array): string {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const bitLen = data.length * 8;
  const padded = new Uint8Array(Math.ceil((data.length + 9) / 64) * 64);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(padded.length - 4, bitLen >>> 0);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return Array.from(h, x => x.toString(16).padStart(8, '0')).join('');
}
