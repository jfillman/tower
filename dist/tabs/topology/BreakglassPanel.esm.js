import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { useHangarTokens } from '../../brand/tokens.esm.js';
import { relativeTime } from '../../shared/format.esm.js';
import { Button, Field } from '../../ui/index.esm.js';
import { BreakglassEnvironmentView } from './BreakglassEnvironmentView.esm.js';
import { useBreakglassStyles, useBreakglassSessions, useNow, OpenSession, remaining, shortUser, breakglassApi } from './breakglassShared.esm.js';

function BreakglassPanel({
  env,
  podName,
  containers,
  tier,
  linkedSessionId
}) {
  const t = useHangarTokens();
  const classes = useBreakglassStyles({ t });
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const appName = env.appName;
  const [mode, setMode] = useState("copy");
  const [processAccess, setProcessAccess] = useState(false);
  const [volumeAccess, setVolumeAccess] = useState(false);
  const [recycleLastPod, setRecycleLastPod] = useState(false);
  const [duration, setDuration] = useState(15);
  const [reason, setReason] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const [container, setContainer] = useState(containers[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState();
  const [glassBroken, setGlassBroken] = useState(false);
  const [open, setOpen] = useState();
  const [closedNote, setClosedNote] = useState();
  const flight = tier === "upper";
  const data = useBreakglassSessions(appName, env.env, linkedSessionId);
  const { sessions, info: listInfo, load } = data;
  const waiting = sessions.some((s) => s.state === "requested" || s.state === "approved");
  const now = useNow(!!open || waiting);
  if (!appName) return /* @__PURE__ */ jsx("span", { className: classes.hint, children: "No app is known for this environment." });
  const mine = sessions.find((s) => s.state !== "ended" && s.requester === listInfo.user && s.pod === podName);
  const mineElsewhere = sessions.find((s) => s.state !== "ended" && s.requester === listInfo.user && s.pod !== podName);
  const breakingGlass = flight && glassBroken && !!listInfo.canBreakGlass;
  const startLabel = () => {
    const waits = flight && !breakingGlass;
    if (busy) return waits ? "Sending the request\u2026" : "Preparing the debug container\u2026";
    if (breakingGlass) return "Break glass and start";
    return waits ? "Request approval" : "Start recorded session";
  };
  const start = async () => {
    setBusy(true);
    setError(void 0);
    setClosedNote(void 0);
    try {
      const body = await breakglassApi(discoveryApi, fetchApi, "/sessions", {
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
          volumeAccess,
          recycleLastPod: !flight && mode === "live" && recycleLastPod,
          durationMinutes: duration,
          reason,
          ...ticketUrl.trim() ? { ticketUrl: ticketUrl.trim() } : {},
          ...breakingGlass ? { glassBroken: true } : {}
        })
      });
      setGlassBroken(false);
      if (body.session.state === "active") {
        setOpen(body.session);
      } else {
        setClosedNote("Request sent. An owner of this app other than you, or an admin, must approve it within 30 minutes.");
      }
      setReason("");
      setTicketUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      load();
    }
  };
  const startApproved = async (id) => {
    setBusy(true);
    setError(void 0);
    setClosedNote(void 0);
    try {
      const body = await breakglassApi(discoveryApi, fetchApi, `/sessions/${id}/start`, { method: "POST" });
      setOpen(body.session);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      load();
    }
  };
  const extend = async (id) => {
    setError(void 0);
    try {
      const body = await breakglassApi(discoveryApi, fetchApi, `/sessions/${id}/extend`, { method: "POST" });
      setOpen((o) => o && o.id === id ? { ...o, expiresAt: body.session.expiresAt, extendedAt: body.session.extendedAt } : o);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const end = async (id) => {
    setEnding(true);
    try {
      await breakglassApi(discoveryApi, fetchApi, `/sessions/${id}/end`, { method: "POST" });
      setOpen(void 0);
      setClosedNote("Session ended.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnding(false);
      load();
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: classes.root, "data-testid": "breakglass-panel", children: [
    open ? /* @__PURE__ */ jsx(
      OpenSession,
      {
        open,
        now,
        ending,
        onExtend: extend,
        onEnd: end,
        onClosed: (note, ended) => {
          setClosedNote(note);
          if (ended) setOpen(void 0);
          load();
        }
      }
    ) : /* @__PURE__ */ jsxs(Fragment, { children: [
      mine?.state === "requested" && /* @__PURE__ */ jsxs("div", { className: classes.actions, "data-testid": "breakglass-awaiting", children: [
        /* @__PURE__ */ jsxs("span", { className: classes.warn, children: [
          "Waiting for approval: an owner of ",
          appName,
          " other than you, or an admin. The request expires in ",
          remaining(mine.expiresAt, now),
          "."
        ] }),
        /* @__PURE__ */ jsx(Button, { small: true, disabled: ending, onClick: () => end(mine.id), children: ending ? "Withdrawing\u2026" : "Withdraw" })
      ] }),
      mine?.state === "approved" && /* @__PURE__ */ jsxs("div", { className: classes.actions, "data-testid": "breakglass-approved", children: [
        /* @__PURE__ */ jsxs("span", { className: classes.warn, children: [
          "Approved by ",
          shortUser(mine.approver ?? ""),
          mine.decisionNote ? ` (\u201C${mine.decisionNote}\u201D)` : "",
          ". Start within ",
          remaining(mine.expiresAt, now),
          "; the",
          ` ${mine.durationMinutes ?? ""}`,
          "-minute clock starts then."
        ] }),
        /* @__PURE__ */ jsx(Button, { variant: "danger", disabled: busy, onClick: () => startApproved(mine.id), children: busy ? "Preparing the debug container\u2026" : "Start recorded session" }),
        /* @__PURE__ */ jsx(Button, { small: true, disabled: ending, onClick: () => end(mine.id), children: "Withdraw" })
      ] }),
      mine?.state === "active" && /* @__PURE__ */ jsxs("div", { className: classes.actions, children: [
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
              setOpen(mine);
            },
            children: "Reopen terminal"
          }
        ),
        /* @__PURE__ */ jsx(Button, { small: true, variant: "danger", disabled: ending, onClick: () => end(mine.id), children: ending ? "Ending\u2026" : "End it" })
      ] }),
      mineElsewhere && !mine && /* @__PURE__ */ jsxs("span", { className: classes.warn, children: [
        "You have a break-glass ",
        mineElsewhere.state === "active" ? "session" : "request",
        " open on ",
        mineElsewhere.pod,
        "; one at a time."
      ] }),
      closedNote && /* @__PURE__ */ jsx("span", { className: classes.hint, children: closedNote }),
      ending && /* @__PURE__ */ jsx("span", { className: classes.hint, children: "Ending the session: removing the grant and the debug pod, saving the recording\u2026" }),
      /* @__PURE__ */ jsxs("span", { className: classes.hint, children: [
        "A time-boxed shell in a hardened debug container (the signed Tower debug image: curl, dig, openssl, jq, ss, ps, nc, psql, redis-cli; non-root, read-only, no capabilities). Everything typed and shown is recorded and kept for",
        listInfo.recordingRetentionDays && listInfo.recordingRetentionDays !== 365 ? ` ${listInfo.recordingRetentionDays} days` : " a year",
        "; the session is audited.",
        flight && " On Flight a second person approves first: an owner of this app other than you, or an admin."
      ] }),
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
          /* @__PURE__ */ jsxs("label", { className: classes.radio, children: [
            /* @__PURE__ */ jsx("input", { type: "checkbox", checked: volumeAccess, onChange: (e) => setVolumeAccess(e.target.checked) }),
            /* @__PURE__ */ jsxs("span", { children: [
              "Volume access to ",
              /* @__PURE__ */ jsx("code", { children: container }),
              /* @__PURE__ */ jsx("br", {}),
              /* @__PURE__ */ jsx("span", { className: classes.warn, children: "Mounts the volumes the container mounts (ConfigMaps, Secrets, emptyDirs, claims), read-only, under /pod-volumes/<volume>. Secrets included; the service account token never. Shown on the session record." })
            ] })
          ] }),
          mode === "live" && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsxs("label", { className: classes.radio, children: [
              /* @__PURE__ */ jsx("input", { type: "checkbox", checked: processAccess, onChange: (e) => setProcessAccess(e.target.checked) }),
              /* @__PURE__ */ jsxs("span", { children: [
                "Process access to ",
                /* @__PURE__ */ jsx("code", { children: container }),
                /* @__PURE__ */ jsx("br", {}),
                /* @__PURE__ */ jsx("span", { className: classes.warn, children: "Shares the container's process namespace: you see its processes. Its files and environment (secrets) under /proc are readable only when the app runs as the same non-root user as the debug container (65532); an app running as root keeps them. Shown on the session record." })
              ] })
            ] }),
            flight ? /* @__PURE__ */ jsx("span", { className: classes.hint, children: "On Flight the last ready pod is never restarted for you: it keeps the debug container until the next rollout." }) : /* @__PURE__ */ jsxs("label", { className: classes.radio, children: [
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
      flight && listInfo.canBreakGlass && /* @__PURE__ */ jsxs("label", { className: classes.radio, "data-testid": "breakglass-glass-broken", children: [
        /* @__PURE__ */ jsx("input", { type: "checkbox", checked: glassBroken, onChange: (e) => setGlassBroken(e.target.checked) }),
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx("b", { children: "Break glass: start now, with no second person" }),
          " (admins)",
          /* @__PURE__ */ jsx("br", {}),
          /* @__PURE__ */ jsxs("span", { className: classes.warn, children: [
            "For when no one else can approve in time. Everyone is told at once, it is audited as critical, and the session is review-due until an owner of ",
            appName,
            " other than you, or another admin, watches the recording and signs it off."
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.actions, children: [
        /* @__PURE__ */ jsx(
          Button,
          {
            variant: "danger",
            disabled: busy || ending || !reason.trim() || !!mine || !!mineElsewhere || listInfo.recordingsConfigured === false,
            onClick: start,
            children: startLabel()
          }
        ),
        busy && /* @__PURE__ */ jsx("span", { className: classes.hint, children: "This can take up to two minutes." })
      ] })
    ] }),
    error && /* @__PURE__ */ jsx("span", { className: classes.bad, children: error }),
    /* @__PURE__ */ jsx(BreakglassEnvironmentView, { env, tier, data, linkedSessionId, hostTerminal: false })
  ] });
}

export { BreakglassPanel };
//# sourceMappingURL=BreakglassPanel.esm.js.map
