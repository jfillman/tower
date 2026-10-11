import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useRef, useState, useEffect, useCallback } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';
import { formatDateTime } from '../../shared/format.esm.js';
import { StatusChip, Button } from '../../ui/index.esm.js';
import { sha256Hex, parseCast, parseSize, eventsUntil, clock } from './castPlayback.esm.js';

const useStyles = makeStyles(() => ({
  root: { display: "flex", flexDirection: "column", gap: 6, padding: 8, borderRadius: 6, border: ({ t }) => `1px solid ${t.line}` },
  bar: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontFamily: fontMono, fontSize: 11 },
  meta: { color: ({ t }) => t.textFaint, fontFamily: fontMono, fontSize: 11 },
  bad: { fontSize: 11.5, color: ({ t }) => t.bad },
  screen: { maxHeight: 420, overflow: "auto", borderRadius: 6, backgroundColor: "#0b0f14", padding: 6 },
  seek: { flex: 1, minWidth: 120 },
  clock: { fontVariantNumeric: "tabular-nums" }
}));
const playLabel = (playing, pos, duration) => {
  if (playing) return "Pause";
  return duration > 0 && pos >= duration ? "Replay" : "Play";
};
function RecordingPlayer({ session, onClose }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const screenRef = useRef(null);
  const termRef = useRef();
  const at = useRef({ t: 0, i: 0 });
  const [cast, setCast] = useState();
  const [integrity, setIntegrity] = useState();
  const [error, setError] = useState();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [pos, setPos] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const base = await discoveryApi.getBaseUrl("glidepath");
      const res = await fetchApi.fetch(`${base}/breakglass/sessions/${session.id}/recording?purpose=play`);
      if (!res.ok) throw new Error((await res.json().catch(() => void 0))?.error ?? `the recording could not be loaded (${res.status})`);
      const bytes = await res.arrayBuffer();
      const hex = session.recordingSha256 ? await sha256Hex(bytes) : void 0;
      const parsed = parseCast(new TextDecoder().decode(bytes));
      if (cancelled) return;
      if (!session.recordingSha256 || hex === void 0) setIntegrity("unchecked");
      else setIntegrity(hex === session.recordingSha256 ? "match" : "mismatch");
      setCast(parsed);
    })().catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [discoveryApi, fetchApi, session.id, session.recordingSha256]);
  useEffect(() => {
    if (!cast || !screenRef.current) return void 0;
    const term = new Terminal({
      cols: cast.width,
      rows: cast.height,
      disableStdin: true,
      cursorBlink: false,
      fontFamily: fontMono,
      fontSize: 12,
      scrollback: 5e3
    });
    term.open(screenRef.current);
    termRef.current = term;
    at.current = { t: 0, i: 0 };
    return () => {
      termRef.current = void 0;
      term.dispose();
    };
  }, [cast]);
  const apply = useCallback(
    (from, to) => {
      const term = termRef.current;
      if (!term || !cast) return;
      let chunk = "";
      for (let i = from; i < to; i++) {
        const ev = cast.events[i];
        if (ev.kind === "o") {
          chunk += ev.data;
          continue;
        }
        const size = parseSize(ev.data);
        if (!size) continue;
        if (chunk) term.write(chunk);
        chunk = "";
        term.resize(size.cols, size.rows);
      }
      if (chunk) term.write(chunk);
    },
    [cast]
  );
  const seek = useCallback(
    (target) => {
      const term = termRef.current;
      if (!term || !cast) return;
      term.reset();
      term.resize(cast.width, cast.height);
      const to = eventsUntil(cast.events, target);
      apply(0, to);
      at.current = { t: target, i: to };
      setPos(target);
    },
    [apply, cast]
  );
  useEffect(() => {
    if (!playing || !cast) return void 0;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const target = Math.min(at.current.t + (now - last) / 1e3 * speed, cast.duration);
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
    setPlaying((p) => !p);
  };
  return /* @__PURE__ */ jsxs("div", { className: classes.root, "data-testid": "breakglass-player", children: [
    /* @__PURE__ */ jsxs("div", { className: classes.bar, children: [
      /* @__PURE__ */ jsx("b", { children: "Recording" }),
      /* @__PURE__ */ jsx("span", { className: classes.meta, children: session.id }),
      integrity === "match" && /* @__PURE__ */ jsx(StatusChip, { tone: "ok", title: `SHA-256 ${session.recordingSha256}`, children: "SHA-256 matches the session record" }),
      integrity === "mismatch" && /* @__PURE__ */ jsx(StatusChip, { tone: "bad", title: `The record says ${session.recordingSha256}`, children: "SHA-256 does not match the session record" }),
      session.recordingRekorIndex !== void 0 && /* @__PURE__ */ jsxs(StatusChip, { tone: "ok", title: `rekor-cli get --log-index ${session.recordingRekorIndex} returns this SHA-256 (entry ${session.recordingRekorUuid ?? ""})`, children: [
        "anchored in Rekor #",
        session.recordingRekorIndex
      ] }),
      session.recordingRekorIndex === void 0 && session.recordingSha256 && /* @__PURE__ */ jsx(StatusChip, { tone: "warn", title: session.anchorError ?? "The backend retries for a day after the session ends", children: "not anchored in Rekor" }),
      integrity === "unchecked" && /* @__PURE__ */ jsx(StatusChip, { tone: "neutral", title: "The browser can hash only on https or localhost, and only a session with a stored hash", children: "integrity not checked" }),
      /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx(Button, { small: true, onClick: onClose, children: "Close" })
    ] }),
    error && /* @__PURE__ */ jsx("span", { className: classes.bad, children: error }),
    !error && !cast && /* @__PURE__ */ jsx("span", { className: classes.meta, children: "Loading the recording\u2026" }),
    cast && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: classes.bar, children: [
        /* @__PURE__ */ jsx(Button, { small: true, onClick: togglePlay, children: playLabel(playing, pos, cast.duration) }),
        /* @__PURE__ */ jsx(
          "input",
          {
            "aria-label": "Seek",
            className: classes.seek,
            type: "range",
            min: 0,
            max: Math.max(cast.duration, 1e-3),
            step: 0.1,
            value: pos,
            onChange: (e) => seek(Number(e.target.value))
          }
        ),
        /* @__PURE__ */ jsxs("span", { className: classes.clock, children: [
          clock(pos),
          " / ",
          clock(cast.duration)
        ] }),
        /* @__PURE__ */ jsx("select", { "aria-label": "Speed", value: speed, onChange: (e) => setSpeed(Number(e.target.value)), children: [0.5, 1, 2, 4, 8].map((s) => /* @__PURE__ */ jsxs("option", { value: s, children: [
          s,
          "\xD7"
        ] }, s)) })
      ] }),
      /* @__PURE__ */ jsxs("span", { className: classes.meta, children: [
        cast.startedAt ? `Started ${formatDateTime(new Date(cast.startedAt * 1e3).toISOString())}. ` : "",
        "Recorded ",
        clock(cast.recordedDuration),
        cast.recordedDuration - cast.duration > 1 ? `; pauses over 2 s play as 2 s` : "",
        ". ",
        cast.inputs,
        " keystroke events (their echo is in the output).",
        session.recordingExpiresAt ? ` Kept until ${formatDateTime(session.recordingExpiresAt)}.` : ""
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { ref: screenRef, className: classes.screen, hidden: !cast, "data-testid": "breakglass-player-screen" })
  ] });
}

export { RecordingPlayer };
//# sourceMappingURL=RecordingPlayer.esm.js.map
