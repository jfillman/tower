import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useApi, discoveryApiRef, fetchApiRef, identityApiRef } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';
import { formatDateTime, relativeTime } from '../../shared/format.esm.js';
import { Button, Field, StatusChip } from '../../ui/index.esm.js';

const useStyles = makeStyles(() => ({
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
  rowMeta: { color: ({ t }) => t.textFaint },
  link: { color: ({ t }) => t.sky, background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit" }
}));
async function api(discoveryApi, fetchApi, path, init) {
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
  const classes = useStyles({ t });
  return /* @__PURE__ */ jsx("div", { ref, className: classes.terminal, "data-testid": "breakglass-terminal" });
}
function BreakglassPanel({ env, podName, containers, tier }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const appName = env.appName;
  const [mode, setMode] = useState("copy");
  const [processAccess, setProcessAccess] = useState(false);
  const [recycleLastPod, setRecycleLastPod] = useState(false);
  const [duration, setDuration] = useState(15);
  const [reason, setReason] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const [container, setContainer] = useState(containers[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState();
  const [sessions, setSessions] = useState([]);
  const [listInfo, setListInfo] = useState({});
  const [open, setOpen] = useState();
  const [closedNote, setClosedNote] = useState();
  const [attachKey, setAttachKey] = useState(0);
  const [detached, setDetached] = useState(false);
  const [now, setNow] = useState(Date.now());
  const load = useCallback(async () => {
    if (!appName) return;
    try {
      const body = await api(
        discoveryApi,
        fetchApi,
        `/sessions?${new URLSearchParams({ app: appName, env: env.env })}`
      );
      setSessions(body.sessions);
      setListInfo({ user: body.user, recordingsConfigured: body.recordingsConfigured });
    } catch (e) {
      setListInfo({ error: e instanceof Error ? e.message : String(e) });
    }
  }, [discoveryApi, fetchApi, appName, env.env]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!open) return void 0;
    const timer = setInterval(() => setNow(Date.now()), 1e3);
    return () => clearInterval(timer);
  }, [open]);
  if (!appName) return /* @__PURE__ */ jsx("span", { className: classes.hint, children: "No app is known for this environment." });
  if (tier !== "lower") {
    return /* @__PURE__ */ jsx("span", { className: classes.hint, children: "Break-glass debug is available on Ground environments only. Flight needs a second person's approval, which is not built yet." });
  }
  const mine = sessions.find((s) => s.state === "active" && s.requester === listInfo.user && s.pod === podName);
  const start = async () => {
    setBusy(true);
    setError(void 0);
    setClosedNote(void 0);
    try {
      const body = await api(discoveryApi, fetchApi, "/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName,
          env: env.env,
          cluster: env.cluster,
          namespace: env.namespace,
          podName,
          container,
          mode,
          processAccess: mode === "live" && processAccess,
          recycleLastPod: mode === "live" && recycleLastPod,
          durationMinutes: duration,
          reason,
          ...ticketUrl.trim() ? { ticketUrl: ticketUrl.trim() } : {}
        })
      });
      setOpen(body.session);
      setDetached(false);
      setReason("");
      setTicketUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      load();
    }
  };
  const end = async (id) => {
    setEnding(true);
    try {
      await api(discoveryApi, fetchApi, `/sessions/${id}/end`, { method: "POST" });
      setOpen(void 0);
      setClosedNote("Session ended.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnding(false);
      load();
    }
  };
  const download = async (s) => {
    try {
      const base = await discoveryApi.getBaseUrl("glidepath");
      const res = await fetchApi.fetch(`${base}/breakglass/sessions/${s.id}/recording`);
      if (!res.ok) throw new Error((await res.json().catch(() => void 0))?.error ?? `download failed with ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `breakglass-${s.app}-${s.env}-${s.id}.cast`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5e3);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: classes.root, "data-testid": "breakglass-panel", children: [
    open ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: classes.banner, role: "status", children: [
        /* @__PURE__ */ jsx("span", { children: "\u25CF Recorded break-glass session" }),
        /* @__PURE__ */ jsxs("span", { className: classes.bannerMeta, children: [
          open.mode === "live" ? `live: debug container in ${open.pod}` : `copy of ${open.pod}${open.copyPod ? ` (${open.copyPod})` : ""}`,
          open.processAccess ? ", with process access" : ""
        ] }),
        /* @__PURE__ */ jsxs("span", { className: `${classes.bannerMeta} ${classes.countdown}`, title: `Ends at ${formatDateTime(open.expiresAt)}`, children: [
          remaining(open.expiresAt, now),
          " left"
        ] }),
        /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx(Button, { variant: "danger", small: true, disabled: ending, onClick: () => end(open.id), children: ending ? "Ending\u2026" : "End session" })
      ] }),
      open.mode === "live" && /* @__PURE__ */ jsx("span", { className: classes.warn, children: "This pod will be restarted when you end the session." }),
      /* @__PURE__ */ jsx(
        BreakglassTerminal,
        {
          session: open,
          onClosed: (note, ended) => {
            setClosedNote(note);
            if (ended) setOpen(void 0);
            else setDetached(true);
            load();
          }
        },
        attachKey
      ),
      closedNote && /* @__PURE__ */ jsxs("div", { className: classes.actions, children: [
        /* @__PURE__ */ jsx("span", { className: classes.hint, children: closedNote }),
        detached && /* @__PURE__ */ jsx(
          Button,
          {
            small: true,
            onClick: () => {
              setDetached(false);
              setClosedNote(void 0);
              setAttachKey((k) => k + 1);
            },
            children: "Reconnect"
          }
        )
      ] })
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      mine && /* @__PURE__ */ jsxs("div", { className: classes.actions, children: [
        /* @__PURE__ */ jsxs("span", { className: classes.warn, children: [
          "You have an active session on this pod (ends ",
          relativeTime(mine.expiresAt),
          ")."
        ] }),
        /* @__PURE__ */ jsx(
          Button,
          {
            small: true,
            onClick: () => {
              setClosedNote(void 0);
              setDetached(false);
              setOpen(mine);
            },
            children: "Reopen terminal"
          }
        ),
        /* @__PURE__ */ jsx(Button, { small: true, variant: "danger", disabled: ending, onClick: () => end(mine.id), children: ending ? "Ending\u2026" : "End it" })
      ] }),
      closedNote && /* @__PURE__ */ jsx("span", { className: classes.hint, children: closedNote }),
      ending && /* @__PURE__ */ jsx("span", { className: classes.hint, children: "Ending the session: removing the grant and the debug pod, saving the recording\u2026" }),
      /* @__PURE__ */ jsx("span", { className: classes.hint, children: "A time-boxed shell in a hardened debug container (busybox, non-root, read-only, no capabilities). Everything typed and shown is recorded and kept for a year; the session is audited." }),
      listInfo.recordingsConfigured === false && /* @__PURE__ */ jsx("span", { className: classes.bad, children: "Recordings are not configured on the backend, so no session can start." }),
      /* @__PURE__ */ jsxs("div", { className: classes.form, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.radios, children: [
          /* @__PURE__ */ jsxs("label", { className: classes.radio, children: [
            /* @__PURE__ */ jsx("input", { type: "radio", name: "bg-mode", checked: mode === "copy", onChange: () => setMode("copy") }),
            /* @__PURE__ */ jsxs("span", { children: [
              /* @__PURE__ */ jsx("b", { children: "Copy of the pod" }),
              " (recommended)",
              /* @__PURE__ */ jsx("br", {}),
              /* @__PURE__ */ jsx("span", { className: classes.hint, children: "A new pod from this pod's spec that takes no traffic. The live pod is untouched; the copy is deleted at the end." })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: classes.radio, children: [
            /* @__PURE__ */ jsx("input", { type: "radio", name: "bg-mode", checked: mode === "live", onChange: () => setMode("live") }),
            /* @__PURE__ */ jsxs("span", { children: [
              /* @__PURE__ */ jsx("b", { children: "The live pod" }),
              /* @__PURE__ */ jsx("br", {}),
              /* @__PURE__ */ jsx("span", { className: classes.hint, children: "A debug container added to the running pod, for problems a copy cannot reproduce. The pod is restarted at the end." })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.radios, children: [
          mode === "live" && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsxs("label", { className: classes.radio, children: [
              /* @__PURE__ */ jsx("input", { type: "checkbox", checked: processAccess, onChange: (e) => setProcessAccess(e.target.checked) }),
              /* @__PURE__ */ jsxs("span", { children: [
                "Process access to ",
                /* @__PURE__ */ jsx("code", { children: container }),
                /* @__PURE__ */ jsx("br", {}),
                /* @__PURE__ */ jsx("span", { className: classes.warn, children: "Shares the container's process namespace: you see its processes and, as the same user, its files and environment (secrets) under /proc. Shown on the session record." })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("label", { className: classes.radio, children: [
              /* @__PURE__ */ jsx("input", { type: "checkbox", checked: recycleLastPod, onChange: (e) => setRecycleLastPod(e.target.checked) }),
              /* @__PURE__ */ jsxs("span", { children: [
                "Restart the pod at the end even if it is the only ready one",
                /* @__PURE__ */ jsx("br", {}),
                /* @__PURE__ */ jsx("span", { className: classes.hint, children: "Otherwise a last ready pod keeps the debug container until you restart it." })
              ] })
            ] })
          ] }),
          containers.length > 1 && /* @__PURE__ */ jsx(Field, { id: "bg-container", label: "Container", children: (p) => /* @__PURE__ */ jsx("select", { ...p, value: container, onChange: (e) => setContainer(e.target.value), children: containers.map((c) => /* @__PURE__ */ jsx("option", { value: c, children: c }, c)) }) }),
          /* @__PURE__ */ jsx(Field, { id: "bg-duration", label: "Duration", children: (p) => /* @__PURE__ */ jsxs("select", { ...p, value: duration, onChange: (e) => setDuration(Number(e.target.value)), children: [
            /* @__PURE__ */ jsx("option", { value: 15, children: "15 minutes" }),
            /* @__PURE__ */ jsx("option", { value: 30, children: "30 minutes" }),
            /* @__PURE__ */ jsx("option", { value: 60, children: "60 minutes" })
          ] }) })
        ] }),
        /* @__PURE__ */ jsx("div", { className: classes.full, children: /* @__PURE__ */ jsx(Field, { id: "bg-reason", label: "Reason (required)", children: (p) => /* @__PURE__ */ jsx("textarea", { ...p, rows: 2, maxLength: 2e3, value: reason, onChange: (e) => setReason(e.target.value), placeholder: "What are you looking for?" }) }) }),
        /* @__PURE__ */ jsx("div", { className: classes.full, children: /* @__PURE__ */ jsx(Field, { id: "bg-ticket", label: "Incident or ticket link (optional)", children: (p) => /* @__PURE__ */ jsx("input", { ...p, type: "url", value: ticketUrl, onChange: (e) => setTicketUrl(e.target.value), placeholder: "https://" }) }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.actions, children: [
        /* @__PURE__ */ jsx(Button, { variant: "danger", disabled: busy || ending || !reason.trim() || !!mine || listInfo.recordingsConfigured === false, onClick: start, children: busy ? "Preparing the debug container\u2026" : "Start recorded session" }),
        busy && /* @__PURE__ */ jsx("span", { className: classes.hint, children: "This can take up to two minutes." })
      ] })
    ] }),
    error && /* @__PURE__ */ jsx("span", { className: classes.bad, children: error }),
    /* @__PURE__ */ jsxs("div", { className: classes.history, children: [
      /* @__PURE__ */ jsxs("span", { className: classes.hint, style: { fontWeight: 700 }, children: [
        "Break-glass sessions in ",
        env.env
      ] }),
      listInfo.error && /* @__PURE__ */ jsx("span", { className: classes.bad, children: listInfo.error }),
      !listInfo.error && sessions.length === 0 && /* @__PURE__ */ jsx("span", { className: classes.hint, children: "None yet." }),
      sessions.map((s) => /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
        /* @__PURE__ */ jsx(StatusChip, { tone: s.state === "active" ? "warn" : "neutral", children: s.state }),
        /* @__PURE__ */ jsx("span", { title: formatDateTime(s.createdAt), children: relativeTime(s.createdAt) }),
        /* @__PURE__ */ jsxs("span", { children: [
          s.mode,
          s.processAccess ? " + process access" : ""
        ] }),
        /* @__PURE__ */ jsx("span", { children: s.pod }),
        /* @__PURE__ */ jsx("span", { className: classes.rowMeta, children: s.requester.replace(/^user:[^/]+\//, "") }),
        /* @__PURE__ */ jsxs("span", { className: classes.rowMeta, title: s.reason, children: [
          "\u201C",
          s.reason.length > 60 ? `${s.reason.slice(0, 60)}\u2026` : s.reason,
          "\u201D"
        ] }),
        s.ticketUrl && /* @__PURE__ */ jsx("a", { className: classes.link, href: s.ticketUrl, target: "_blank", rel: "noopener noreferrer", children: "ticket" }),
        s.endReason && /* @__PURE__ */ jsx("span", { className: classes.rowMeta, title: s.endReason, children: s.endReason.length > 80 ? `${s.endReason.slice(0, 80)}\u2026` : s.endReason }),
        s.mode === "live" && s.state === "ended" && /* @__PURE__ */ jsx("span", { className: classes.rowMeta, children: s.recycled ? "pod restarted" : "pod not restarted" }),
        s.cleanupNotes && /* @__PURE__ */ jsx("span", { className: classes.warn, title: s.cleanupNotes, children: "notes" }),
        s.recordingKey && /* @__PURE__ */ jsx("button", { type: "button", className: classes.link, onClick: () => download(s), title: `SHA-256 ${s.recordingSha256 ?? ""}`, children: "recording" })
      ] }, s.id))
    ] })
  ] });
}

export { BreakglassPanel };
//# sourceMappingURL=BreakglassPanel.esm.js.map
