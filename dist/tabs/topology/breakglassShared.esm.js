import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useApi, discoveryApiRef, fetchApiRef, identityApiRef } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';

const shortUser = (ref) => ref.replace(/^user:[^/]+\//, "");
const useBreakglassStyles = makeStyles(() => ({
  root: { display: "flex", flexDirection: "column", gap: 12 },
  form: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px 16px" },
  full: { gridColumn: "1 / -1" },
  radios: { display: "flex", flexDirection: "column", gap: 6 },
  radio: { display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: ({ t }) => t.textHi, cursor: "pointer" },
  hint: { fontSize: 11, color: ({ t }) => t.textFaint, lineHeight: 1.45 },
  warn: { fontSize: 11, color: ({ t }) => t.amberInk, lineHeight: 1.45 },
  bad: { fontSize: 11.5, color: ({ t }) => t.bad },
  actions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  banner: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    padding: "8px 12px",
    borderRadius: 6,
    backgroundColor: ({ t }) => t.badSoft,
    border: ({ t }) => `1px solid ${t.bad}`,
    color: ({ t }) => t.bad,
    fontFamily: fontMono,
    fontSize: 11.5,
    fontWeight: 700
  },
  bannerMeta: { fontWeight: 400, color: ({ t }) => t.textHi },
  countdown: { fontVariantNumeric: "tabular-nums" },
  terminal: { height: 380, borderRadius: 6, overflow: "hidden", backgroundColor: "#0b0f14", padding: 6 },
  history: { display: "flex", flexDirection: "column", gap: 4 },
  row: { display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", fontFamily: fontMono, fontSize: 11 },
  rowLinked: { outline: ({ t }) => `1px solid ${t.skyLine}`, backgroundColor: ({ t }) => t.skySoft, borderRadius: 4, padding: "4px 6px" },
  rowMeta: { color: ({ t }) => t.textFaint },
  link: { color: ({ t }) => t.sky, background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit" },
  badge: {
    fontFamily: fontMono,
    fontSize: 10.5,
    fontWeight: 700,
    padding: "0 6px",
    borderRadius: 9,
    backgroundColor: ({ t }) => t.amber,
    color: ({ t }) => t.bg,
    marginLeft: 6
  }
}));
async function breakglassApi(discoveryApi, fetchApi, path, init) {
  const base = await discoveryApi.getBaseUrl("glidepath");
  const res = await fetchApi.fetch(`${base}/breakglass${path}`, init);
  const body = await res.json().catch(() => void 0);
  if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
  return body;
}
function remaining(expiresAt, now) {
  const s = Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1e3));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
const toDecideOf = (sessions, info) => sessions.filter((s) => s.state === "requested" && s.requester !== info.user);
const mayReview = (s, info) => !!info.canReview && !!s.glassBroken && s.reviewState === "due" && s.state === "ended" && s.requester !== info.user;
const mayEnd = (s, info) => s.state !== "ended" && (s.requester === info.user || !!s.approver && s.approver === info.user || !!info.canTerminate);
function needsYou(sessions, info) {
  if (!info.user) return 0;
  const decide = info.canReview === false ? 0 : toDecideOf(sessions, info).length;
  const start = sessions.filter((s) => s.state === "approved" && s.requester === info.user).length;
  const review = sessions.filter((s) => mayReview(s, info)).length;
  return decide + start + review;
}
function useBreakglassSessions(appName, env, linkedSessionId) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [sessions, setSessions] = useState([]);
  const [info, setInfo] = useState({});
  const load = useCallback(async () => {
    if (!appName) return;
    try {
      const body = await breakglassApi(
        discoveryApi,
        fetchApi,
        `/sessions?${new URLSearchParams({ app: appName, env })}`
      );
      let rows = body.sessions;
      if (linkedSessionId && !rows.some((s) => s.id === linkedSessionId)) {
        try {
          const one = await breakglassApi(discoveryApi, fetchApi, `/sessions/${encodeURIComponent(linkedSessionId)}`);
          if (one.session.app === appName && one.session.env === env) rows = [...rows, one.session];
        } catch {
        }
      }
      setSessions(rows);
      setInfo({
        user: body.user,
        recordingsConfigured: body.recordingsConfigured,
        recordingRetentionDays: body.recordingRetentionDays,
        canBreakGlass: body.canBreakGlass,
        canReview: body.canReview,
        canTerminate: body.canTerminate
      });
    } catch (e) {
      setInfo((i) => ({ ...i, error: e instanceof Error ? e.message : String(e) }));
    }
  }, [discoveryApi, fetchApi, appName, env, linkedSessionId]);
  useEffect(() => {
    load();
  }, [load]);
  const moving = sessions.some((s) => s.state !== "ended");
  useEffect(() => {
    if (!moving) return void 0;
    const timer = setInterval(() => load(), 1e4);
    return () => clearInterval(timer);
  }, [moving, load]);
  return { sessions, info, load };
}
function useNow(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return void 0;
    const timer = setInterval(() => setNow(Date.now()), 1e3);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}
function BreakglassTerminal({ session, onClosed }) {
  const discoveryApi = useApi(discoveryApiRef);
  const identityApi = useApi(identityApiRef);
  const ref = useRef(null);
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;
  useEffect(() => {
    if (!ref.current) return void 0;
    const term = new Terminal({ cursorBlink: true, fontFamily: fontMono, fontSize: 12, convertEol: false, scrollback: 5e3 });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(ref.current);
    fit.fit();
    let ws;
    let done = false;
    const finish = (reason, ended) => {
      if (done) return;
      done = true;
      closedRef.current(reason, ended);
    };
    const send = (msg) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };
    (async () => {
      const base = await discoveryApi.getBaseUrl("glidepath");
      const { token } = await identityApi.getCredentials();
      if (!token) {
        finish("You need to be signed in to open a terminal.", false);
        return;
      }
      ws = new WebSocket(`${base.replace(/^http/, "ws")}/breakglass/sessions/${session.id}/attach`, token);
      ws.binaryType = "arraybuffer";
      ws.onopen = () => {
        send({ type: "resize", cols: term.cols, rows: term.rows });
        term.focus();
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data !== "string") {
          term.write(new Uint8Array(ev.data));
          return;
        }
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "ended") finish(`Session ended: ${msg.reason ?? ""}`, true);
          else if (msg.type === "detached") finish(msg.reason ?? "Disconnected.", false);
          else if (msg.type === "error") term.write(`\r
\x1B[31m${msg.message ?? "error"}\x1B[0m\r
`);
        } catch {
        }
      };
      ws.onclose = (ev) => finish(ev.code === 1e3 ? "Session ended." : "Disconnected from the session. Reopen it within 2 minutes or it ends.", ev.code === 1e3);
    })().catch((e) => finish(e instanceof Error ? e.message : String(e), false));
    const input = term.onData((data) => send({ type: "input", data }));
    const resize = term.onResize(({ cols, rows }) => send({ type: "resize", cols, rows }));
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
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
  return /* @__PURE__ */ jsx("div", { ref, className: classes.terminal, "data-testid": "breakglass-terminal" });
}
function OpenSession({
  open,
  now,
  onExtend,
  onEnd,
  onClosed,
  ending
}) {
  const t = useHangarTokens();
  const classes = useBreakglassStyles({ t });
  const [closedNote, setClosedNote] = useState();
  const [attachKey, setAttachKey] = useState(0);
  const [detached, setDetached] = useState(false);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: classes.banner, role: "status", children: [
      /* @__PURE__ */ jsx("span", { children: "\u25CF Recorded break-glass session" }),
      open.glassBroken && /* @__PURE__ */ jsx("span", { children: "Glass broken: no second person, review due" }),
      /* @__PURE__ */ jsxs("span", { className: classes.bannerMeta, children: [
        open.mode === "live" ? `live: debug container in ${open.pod}` : `copy of ${open.pod}${open.copyPod ? ` (${open.copyPod})` : ""}`,
        open.processAccess ? ", with process access" : "",
        open.volumeAccess ? ", with volume access" : ""
      ] }),
      /* @__PURE__ */ jsxs("span", { className: `${classes.bannerMeta} ${classes.countdown}`, title: `Ends at ${new Date(open.expiresAt).toLocaleString()}`, children: [
        remaining(open.expiresAt, now),
        " left",
        open.extendedAt ? " (extended)" : ""
      ] }),
      /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
      !open.extendedAt && /* @__PURE__ */ jsx("button", { type: "button", className: classes.link, disabled: ending, title: "Your one free extension: 15 more minutes, no approval.", onClick: () => onExtend(open.id), children: "Extend +15 min" }),
      /* @__PURE__ */ jsx("button", { type: "button", className: classes.link, style: { color: t.bad }, disabled: ending, onClick: () => onEnd(open.id), children: ending ? "Ending\u2026" : "End session" })
    ] }),
    open.mode === "live" && /* @__PURE__ */ jsx("span", { className: classes.warn, children: "This pod will be restarted when you end the session." }),
    open.volumeAccess && /* @__PURE__ */ jsx("div", { className: classes.history, "data-testid": "breakglass-volumes", children: (open.volumes ?? []).length === 0 ? /* @__PURE__ */ jsxs("span", { className: classes.hint, children: [
      "Volume access: ",
      open.container,
      " mounts no volumes besides its service account token."
    ] }) : (open.volumes ?? []).map((v) => /* @__PURE__ */ jsxs("span", { className: classes.row, children: [
      /* @__PURE__ */ jsx("span", { children: v.path }),
      /* @__PURE__ */ jsxs("span", { className: classes.rowMeta, children: [
        v.kind,
        ", read-only \xB7 in the app: ",
        v.appPaths.join(", ")
      ] })
    ] }, v.volume)) }),
    /* @__PURE__ */ jsx(
      BreakglassTerminal,
      {
        session: open,
        onClosed: (note, ended) => {
          setClosedNote(note);
          if (!ended) setDetached(true);
          onClosed(note, ended);
        }
      },
      attachKey
    ),
    closedNote && /* @__PURE__ */ jsxs("div", { className: classes.actions, children: [
      /* @__PURE__ */ jsx("span", { className: classes.hint, children: closedNote }),
      detached && /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          className: classes.link,
          onClick: () => {
            setDetached(false);
            setClosedNote(void 0);
            setAttachKey((k) => k + 1);
          },
          children: "Reconnect"
        }
      )
    ] })
  ] });
}

export { BreakglassTerminal, OpenSession, breakglassApi, mayEnd, mayReview, needsYou, remaining, shortUser, toDecideOf, useBreakglassSessions, useBreakglassStyles, useNow };
//# sourceMappingURL=breakglassShared.esm.js.map
