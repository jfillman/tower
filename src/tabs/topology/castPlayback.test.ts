import { createHash, webcrypto } from 'node:crypto';
import { clock, eventsUntil, parseCast, parseSize, sha256Hex } from './castPlayback';
import { sha256HexJs } from './castPlayback';

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

  it('hashes the bytes as the backend does, with crypto.subtle or without it (plain-HTTP pages)', async () => {
    const bytes = Buffer.from(cast);
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    try {
      // jsdom has no crypto.subtle, nor does a browser on plain http; one on https (or localhost) does.
      Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
      expect(await sha256Hex(buf)).toBe(createHash('sha256').update(cast).digest('hex'));
      Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
      expect(await sha256Hex(buf)).toBe(createHash('sha256').update(cast).digest('hex'));
    } finally {
      if (saved) Object.defineProperty(globalThis, 'crypto', saved);
      else delete (globalThis as { crypto?: unknown }).crypto;
    }
  });
});

describe('sha256HexJs (the player`s digest without crypto.subtle, over plain HTTP)', () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  it('matches the FIPS 180-4 vectors, one block and two', () => {
    expect(sha256HexJs(enc(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256HexJs(enc('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256HexJs(enc('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });
  it('handles a length that lands on the padding boundary and a million characters', () => {
    expect(sha256HexJs(enc('a'.repeat(55)))).toBe('9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318');
    expect(sha256HexJs(enc('a'.repeat(64)))).toBe('ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb');
    expect(sha256HexJs(enc('a'.repeat(1_000_000)))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });
});
