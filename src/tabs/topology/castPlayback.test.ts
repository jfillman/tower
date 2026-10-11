import { createHash, webcrypto } from 'node:crypto';
import { clock, eventsUntil, parseCast, parseSize, sha256Hex } from './castPlayback';

const cast = [
  JSON.stringify({ version: 2, width: 100, height: 30, timestamp: 1760000000, title: 'break-glass copy sky-marshall/staging' }),
  JSON.stringify([0.5, 'o', '$ ']),
  JSON.stringify([1.0, 'i', 'id\r']),
  JSON.stringify([1.1, 'o', 'id\r\nuid=65532\r\n$ ']),
  JSON.stringify([1.2, 'r', '120x40']),
  JSON.stringify([61.2, 'o', 'later\r\n']),
  '[61.3, "o", "cut off mid-wri',
].join('\n');

describe('parseCast', () => {
  it('reads the header and the output and resize events; counts input, does not replay it', () => {
    const c = parseCast(cast);
    expect(c).toMatchObject({ width: 100, height: 30, startedAt: 1760000000, title: 'break-glass copy sky-marshall/staging', inputs: 1 });
    expect(c.events.map(e => e.kind)).toEqual(['o', 'o', 'r', 'o']);
  });

  it('plays a long idle gap as the idle limit, and says how long it really was', () => {
    const c = parseCast(cast, 2);
    expect(c.recordedDuration).toBeCloseTo(61.2);
    expect(c.duration).toBeCloseTo(1.2 + 2);
    expect(c.events[3].t).toBeCloseTo(3.2);
  });

  it('skips a line cut off mid-write (a checkpoint from a backend that died)', () => {
    expect(parseCast(cast).events).toHaveLength(4);
  });

  it('refuses what is not an asciicast v2 recording', () => {
    expect(() => parseCast('')).toThrow(/empty/);
    expect(() => parseCast('not json')).toThrow(/header/);
    expect(() => parseCast(JSON.stringify({ version: 1 }))).toThrow(/version 1/);
  });
});

describe('playback helpers', () => {
  it('finds the events up to a time, from where it left off', () => {
    const { events } = parseCast(cast);
    expect(eventsUntil(events, 0)).toBe(0);
    expect(eventsUntil(events, 1.1)).toBe(2);
    expect(eventsUntil(events, 1.2, 2)).toBe(3);
    expect(eventsUntil(events, 99)).toBe(4);
  });

  it('reads resize events and formats a clock', () => {
    expect(parseSize('120x40')).toEqual({ cols: 120, rows: 40 });
    expect(parseSize('wide')).toBeUndefined();
    expect(clock(0)).toBe('0:00');
    expect(clock(61.9)).toBe('1:01');
  });

  it('hashes the bytes as the backend does, and says so when the browser cannot hash', async () => {
    const bytes = Buffer.from(cast);
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    try {
      // jsdom has no crypto.subtle; a browser on https (or localhost) does.
      Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
      expect(await sha256Hex(buf)).toBe(createHash('sha256').update(cast).digest('hex'));
      Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
      expect(await sha256Hex(buf)).toBeUndefined();
    } finally {
      if (saved) Object.defineProperty(globalThis, 'crypto', saved);
      else delete (globalThis as { crypto?: unknown }).crypto;
    }
  });
});
