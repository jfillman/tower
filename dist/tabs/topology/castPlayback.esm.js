function parseCast(text, idleLimit = 2) {
  const lines = text.split("\n").filter((l) => l.trim());
  if (!lines.length) throw new Error("the recording is empty");
  let header;
  try {
    header = JSON.parse(lines[0]);
  } catch {
    throw new Error("the recording has no asciicast header");
  }
  if (header.version !== 2) throw new Error(`unsupported asciicast version ${String(header.version)}`);
  const events = [];
  let inputs = 0;
  let last = 0;
  let played = 0;
  for (const line of lines.slice(1)) {
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (!Array.isArray(ev) || typeof ev[0] !== "number" || typeof ev[2] !== "string") continue;
    const [t, kind, data] = ev;
    if (kind === "i") {
      inputs++;
      continue;
    }
    if (kind !== "o" && kind !== "r") continue;
    played += Math.min(Math.max(t - last, 0), idleLimit);
    last = Math.max(last, t);
    events.push({ t: played, kind, data });
  }
  return {
    width: typeof header.width === "number" ? header.width : 80,
    height: typeof header.height === "number" ? header.height : 24,
    ...typeof header.title === "string" ? { title: header.title } : {},
    ...typeof header.timestamp === "number" ? { startedAt: header.timestamp } : {},
    events,
    duration: played,
    recordedDuration: last,
    inputs
  };
}
function eventsUntil(events, t, from = 0) {
  let i = from;
  while (i < events.length && events[i].t <= t) i++;
  return i;
}
function parseSize(data) {
  const m = /^(\d+)x(\d+)$/.exec(data);
  return m ? { cols: Number(m[1]), rows: Number(m[2]) } : void 0;
}
function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
async function sha256Hex(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return sha256HexJs(new Uint8Array(bytes));
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
const K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
function sha256HexJs(data) {
  const h = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225]);
  const bitLen = data.length * 8;
  const padded = new Uint8Array(Math.ceil((data.length + 9) / 64) * 64);
  padded.set(data);
  padded[data.length] = 128;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296));
  view.setUint32(padded.length - 4, bitLen >>> 0);
  const w = new Uint32Array(64);
  const rotr = (x, n) => x >>> n | x << 32 - n;
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ w[i - 15] >>> 3;
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ w[i - 2] >>> 10;
      w[i] = w[i - 16] + s0 + w[i - 7] + s1 >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = e & f ^ ~e & g;
      const t1 = hh + S1 + ch + K[i] + w[i] >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const t2 = S0 + maj >>> 0;
      hh = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    h[0] = h[0] + a >>> 0;
    h[1] = h[1] + b >>> 0;
    h[2] = h[2] + c >>> 0;
    h[3] = h[3] + d >>> 0;
    h[4] = h[4] + e >>> 0;
    h[5] = h[5] + f >>> 0;
    h[6] = h[6] + g >>> 0;
    h[7] = h[7] + hh >>> 0;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, "0")).join("");
}

export { clock, eventsUntil, parseCast, parseSize, sha256Hex, sha256HexJs };
//# sourceMappingURL=castPlayback.esm.js.map
