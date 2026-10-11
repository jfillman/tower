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
  if (!subtle) return void 0;
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export { clock, eventsUntil, parseCast, parseSize, sha256Hex };
//# sourceMappingURL=castPlayback.esm.js.map
