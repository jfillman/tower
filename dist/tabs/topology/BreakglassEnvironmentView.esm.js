import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState, useRef, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import LockOpenIcon from '@material-ui/icons/LockOpen';
import { fontDisplay, useHangarTokens } from '../../brand/tokens.esm.js';
import { relativeTime, formatDateTime } from '../../shared/format.esm.js';
import { Button, StatusChip } from '../../ui/index.esm.js';
import { RecordingPlayer } from './RecordingPlayer.esm.js';
import { useBreakglassStyles, useBreakglassSessions, needsYou, useNow, toDecideOf, OpenSession, shortUser, remaining, mayReview, breakglassApi, mayEnd } from './breakglassShared.esm.js';

const useCardStyles = makeStyles(() => ({
  card: { display: "flex", flexDirection: "column", gap: 10, marginTop: 18 },
  head: { display: "flex", alignItems: "center", gap: 9 },
  headIcon: { display: "flex", color: ({ t }) => t.sky, flexShrink: 0 },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14.5, color: ({ t }) => t.textHi }
}));
function BreakglassEnvironmentView({
  env,
  data,
  linkedSessionId,
  hostTerminal = true
}) {
  const t = useHangarTokens();
  const classes = useBreakglassStyles({ t });
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const { sessions, info, load } = data;
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState();
  const [confirmEnd, setConfirmEnd] = useState();
  const [error, setError] = useState();
  const [note, setNote] = useState();
  const [decisionNote, setDecisionNote] = useState({});
  const [keepPod, setKeepPod] = useState({});
  const [reviewNote, setReviewNote] = useState({});
  const [playing, setPlaying] = useState();
  const [open, setOpen] = useState();
  const linkedRef = useRef(null);
  const waiting = sessions.some((s) => s.state === "requested" || s.state === "approved");
  const now = useNow(waiting || !!open);
  useEffect(() => {
    if (linkedSessionId && linkedRef.current) linkedRef.current.scrollIntoView({ block: "center" });
  }, [linkedSessionId, sessions.some((s) => s.id === linkedSessionId)]);
  const toDecide = toDecideOf(sessions, info);
  const toStart = hostTerminal ? sessions.filter((s) => s.state === "approved" && s.requester === info.user) : [];
  const active = sessions.filter((s) => s.state === "active");
  const call = async (path, body, done) => {
    setBusy(true);
    setError(void 0);
    setNote(void 0);
    try {
      const res = await breakglassApi(discoveryApi, fetchApi, path, {
        method: "POST",
        ...body !== void 0 ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}
      });
      if (done) setNote(done);
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return void 0;
    } finally {
      setBusy(false);
      load();
    }
  };
  const decide = async (id, decision) => {
    const n = decisionNote[id]?.trim();
    const k = keepPod[id];
    const body = {
      ...n ? { note: n } : {},
      ...decision === "approve" && k?.on ? { keepPod: true, keepPodReason: k.reason.trim() } : {}
    };
    await call(`/sessions/${id}/${decision}`, body, decision === "approve" ? "Approved. The requester has 10 minutes to start the session." : "Denied.");
  };
  const review = async (id) => {
    await call(`/sessions/${id}/review`, { note: reviewNote[id]?.trim() ?? "" }, "Marked reviewed.");
    setReviewNote((n) => ({ ...n, [id]: "" }));
  };
  const end = async (s) => {
    setConfirmEnd(void 0);
    setEnding(s.id);
    try {
      await breakglassApi(discoveryApi, fetchApi, `/sessions/${s.id}/end`, { method: "POST" });
      if (open?.id === s.id) setOpen(void 0);
      setNote(s.state === "active" ? "Session ended." : "Request withdrawn.");
      setError(void 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnding(void 0);
      load();
    }
  };
  const start = async (id) => {
    const res = await call(`/sessions/${id}/start`);
    if (res?.session) setOpen(res.session);
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
  const stateTone = (s) => {
    if (s.state === "active") return "warn";
    return s.state === "ended" ? "neutral" : "info";
  };
  const endControl = (s) => {
    if (!mayEnd(s, info)) return null;
    const own = s.requester === info.user;
    const label = s.state === "active" ? "End" : "Withdraw";
    if (own) {
      return /* @__PURE__ */ jsx(Button, { small: true, variant: s.state === "active" ? "danger" : "default", disabled: ending === s.id, onClick: () => end(s), children: ending === s.id ? "Ending\u2026" : label });
    }
    if (confirmEnd === s.id) {
      return /* @__PURE__ */ jsxs("span", { className: classes.actions, "data-testid": `breakglass-confirm-end-${s.id}`, children: [
        /* @__PURE__ */ jsxs("span", { className: classes.warn, children: [
          "End ",
          shortUser(s.requester),
          "'s session now?"
        ] }),
        /* @__PURE__ */ jsx(Button, { small: true, variant: "danger", disabled: ending === s.id, onClick: () => end(s), children: ending === s.id ? "Ending\u2026" : "Confirm" }),
        /* @__PURE__ */ jsx(Button, { small: true, onClick: () => setConfirmEnd(void 0), children: "Keep it" })
      ] });
    }
    return /* @__PURE__ */ jsx(Button, { small: true, variant: "danger", disabled: ending === s.id, title: `End ${shortUser(s.requester)}'s session (${s.approver === info.user ? "you approved it" : "admin"})`, onClick: () => setConfirmEnd(s.id), children: label });
  };
  return /* @__PURE__ */ jsxs("div", { className: classes.root, "data-testid": "breakglass-environment-view", children: [
    open && /* @__PURE__ */ jsx(
      OpenSession,
      {
        open,
        now,
        ending: ending === open.id,
        onExtend: extend,
        onEnd: (id) => {
          const s = sessions.find((x) => x.id === id) ?? open;
          end(s);
        },
        onClosed: (_note, ended) => {
          if (ended) setOpen(void 0);
          load();
        }
      }
    ),
    toDecide.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.history, "data-testid": "breakglass-to-decide", children: [
      /* @__PURE__ */ jsx("span", { className: classes.hint, style: { fontWeight: 700 }, children: "Requests awaiting a second person" }),
      toDecide.map((r) => /* @__PURE__ */ jsxs("div", { ref: r.id === linkedSessionId ? linkedRef : void 0, className: classes.banner, style: { flexDirection: "column", alignItems: "stretch", gap: 6 }, children: [
        /* @__PURE__ */ jsxs("span", { className: classes.bannerMeta, children: [
          /* @__PURE__ */ jsx("b", { children: shortUser(r.requester) }),
          " asks for a ",
          r.durationMinutes ?? "",
          "-minute ",
          r.mode,
          " session on ",
          r.pod,
          r.processAccess ? ", with process access" : "",
          r.volumeAccess ? ", with volume access" : "",
          ". Expires in ",
          remaining(r.expiresAt, now),
          "."
        ] }),
        /* @__PURE__ */ jsxs("span", { className: classes.bannerMeta, children: [
          "Reason: ",
          r.reason
        ] }),
        r.ticketUrl && /* @__PURE__ */ jsx("a", { className: classes.link, href: r.ticketUrl, target: "_blank", rel: "noopener noreferrer", children: r.ticketUrl }),
        (r.podImage || r.podImageId) && /* @__PURE__ */ jsxs("span", { className: classes.bannerMeta, "data-testid": `breakglass-request-image-${r.id}`, title: r.podImageId ?? "", children: [
          "The pod runs ",
          r.podImage ?? "an unknown image",
          r.podImageId?.includes("@sha256:") ? ` (${r.podImageId.slice(r.podImageId.indexOf("@sha256:") + 8, r.podImageId.indexOf("@sha256:") + 20)}\u2026)` : "",
          r.podImage?.includes(":") ? `; release ${r.podImage.slice(r.podImage.lastIndexOf(":") + 1)} in the Releases tab` : ""
        ] }),
        r.mode === "copy" && /* @__PURE__ */ jsx("span", { className: r.holdApp ? classes.bannerMeta : classes.warn, children: r.holdApp ? "The copy holds the app: no work runs in it." : "The copy runs the app: it consumes queues, schedules work and takes leases like a real replica." }),
        r.sensitive && /* @__PURE__ */ jsx("span", { className: classes.warn, children: "This session can read Secrets (volume or process access); its recording will be restricted to admins, you, the reviewer and the requester." }),
        r.mode === "live" && r.tier === "flight" && /* @__PURE__ */ jsxs("label", { className: classes.radio, "data-testid": `breakglass-keep-pod-${r.id}`, children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "checkbox",
              checked: keepPod[r.id]?.on ?? false,
              onChange: (e) => setKeepPod((k) => ({ ...k, [r.id]: { on: e.target.checked, reason: k[r.id]?.reason ?? "" } }))
            }
          ),
          /* @__PURE__ */ jsxs("span", { children: [
            "Keep the pod after the session (it is the evidence)",
            /* @__PURE__ */ jsx("br", {}),
            /* @__PURE__ */ jsx("span", { className: classes.hint, children: "Normally the pod is restarted at the end because the debug container stays in it. A reason is required and goes on the record." }),
            keepPod[r.id]?.on && /* @__PURE__ */ jsx(
              "input",
              {
                "aria-label": `Reason to keep the pod for ${r.id}`,
                placeholder: "Why the pod must stay (required)",
                value: keepPod[r.id]?.reason ?? "",
                onChange: (e) => setKeepPod((k) => ({ ...k, [r.id]: { on: true, reason: e.target.value } })),
                style: { display: "block", width: "100%", marginTop: 4 }
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.actions, children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              "aria-label": `Note for ${r.id}`,
              placeholder: "Note (optional)",
              value: decisionNote[r.id] ?? "",
              onChange: (e) => setDecisionNote((n) => ({ ...n, [r.id]: e.target.value })),
              style: { flex: 1, minWidth: 160 }
            }
          ),
          /* @__PURE__ */ jsx(Button, { variant: "danger", small: true, disabled: busy || !!keepPod[r.id]?.on && !keepPod[r.id]?.reason.trim(), onClick: () => decide(r.id, "approve"), children: "Approve" }),
          /* @__PURE__ */ jsx(Button, { small: true, disabled: busy, onClick: () => decide(r.id, "deny"), children: "Deny" })
        ] })
      ] }, r.id))
    ] }),
    toStart.map((s) => /* @__PURE__ */ jsxs("div", { ref: s.id === linkedSessionId ? linkedRef : void 0, className: classes.actions, "data-testid": "breakglass-approved", children: [
      /* @__PURE__ */ jsxs("span", { className: classes.warn, children: [
        "Approved by ",
        shortUser(s.approver ?? ""),
        s.decisionNote ? ` (\u201C${s.decisionNote}\u201D)` : "",
        ": a ",
        s.durationMinutes ?? "",
        "-minute ",
        s.mode,
        " session on ",
        s.pod,
        ". Start within",
        " ",
        remaining(s.expiresAt, now),
        "."
      ] }),
      /* @__PURE__ */ jsx(Button, { variant: "danger", disabled: busy || !!open, onClick: () => start(s.id), children: busy ? "Preparing the debug container\u2026" : "Start recorded session" }),
      endControl(s)
    ] }, s.id)),
    active.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.history, "data-testid": "breakglass-active", children: [
      /* @__PURE__ */ jsx("span", { className: classes.hint, style: { fontWeight: 700 }, children: "Active now" }),
      active.map((s) => /* @__PURE__ */ jsxs("div", { ref: s.id === linkedSessionId ? linkedRef : void 0, className: `${classes.row} ${s.id === linkedSessionId ? classes.rowLinked : ""}`, children: [
        /* @__PURE__ */ jsx(StatusChip, { tone: "warn", children: "active" }),
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx("b", { children: shortUser(s.requester) }),
          " on ",
          s.pod,
          " (",
          s.mode,
          s.processAccess ? " + process access" : "",
          s.volumeAccess ? " + volume access" : "",
          ")"
        ] }),
        /* @__PURE__ */ jsxs("span", { className: classes.rowMeta, title: `Ends at ${formatDateTime(s.expiresAt)}`, children: [
          "ends ",
          relativeTime(s.expiresAt)
        ] }),
        s.glassBroken && /* @__PURE__ */ jsx(StatusChip, { tone: "bad", title: "Opened by an admin with no second person", children: "glass broken" }),
        s.attached === false && /* @__PURE__ */ jsx("span", { className: classes.rowMeta, children: "terminal closed" }),
        hostTerminal && s.requester === info.user && open?.id !== s.id && /* @__PURE__ */ jsx(Button, { small: true, onClick: () => setOpen(s), children: "Reopen terminal" }),
        endControl(s)
      ] }, s.id))
    ] }),
    note && /* @__PURE__ */ jsx("span", { className: classes.hint, children: note }),
    error && /* @__PURE__ */ jsx("span", { className: classes.bad, children: error }),
    /* @__PURE__ */ jsxs("div", { className: classes.history, children: [
      /* @__PURE__ */ jsxs("span", { className: classes.hint, style: { fontWeight: 700 }, children: [
        "Break-glass sessions in ",
        env.env
      ] }),
      info.error && /* @__PURE__ */ jsx("span", { className: classes.bad, children: info.error }),
      !info.error && sessions.length === 0 && /* @__PURE__ */ jsx("span", { className: classes.hint, children: "None yet." }),
      sessions.map((s) => /* @__PURE__ */ jsxs(
        "div",
        {
          ref: s.id === linkedSessionId && s.state === "ended" ? linkedRef : void 0,
          className: `${classes.row} ${s.id === linkedSessionId ? classes.rowLinked : ""}`,
          "data-testid": `breakglass-session-${s.id}`,
          children: [
            /* @__PURE__ */ jsx(StatusChip, { tone: stateTone(s), children: s.state }),
            /* @__PURE__ */ jsx("span", { title: formatDateTime(s.createdAt), children: relativeTime(s.createdAt) }),
            /* @__PURE__ */ jsxs("span", { children: [
              s.mode,
              s.processAccess ? " + process access" : "",
              s.volumeAccess ? /* @__PURE__ */ jsx("span", { title: (s.volumes ?? []).map((v) => v.path).join("\n") || "no volumes", children: " + volume access" }) : "",
              s.mode === "copy" && s.holdApp ? /* @__PURE__ */ jsx("span", { title: "The copy ran a sleep instead of the app", children: " \xB7 app held" }) : ""
            ] }),
            /* @__PURE__ */ jsx("span", { children: s.pod }),
            s.sensitive && /* @__PURE__ */ jsx(StatusChip, { tone: "warn", title: "Could read Secrets: the recording is for admins, the approver, the reviewer and the requester", children: "sensitive" }),
            s.recycleWaivedReason && /* @__PURE__ */ jsx("span", { className: classes.rowMeta, title: s.recycleWaivedReason, children: "pod kept by the approver" }),
            /* @__PURE__ */ jsx("span", { className: classes.rowMeta, children: shortUser(s.requester) }),
            /* @__PURE__ */ jsxs("span", { className: classes.rowMeta, title: s.reason, children: [
              "\u201C",
              s.reason.length > 60 ? `${s.reason.slice(0, 60)}\u2026` : s.reason,
              "\u201D"
            ] }),
            s.ticketUrl && /* @__PURE__ */ jsx("a", { className: classes.link, href: s.ticketUrl, target: "_blank", rel: "noopener noreferrer", children: "ticket" }),
            s.approver && !(s.endReason ?? "").startsWith("denied") && /* @__PURE__ */ jsxs("span", { className: classes.rowMeta, children: [
              "approved by ",
              shortUser(s.approver)
            ] }),
            s.glassBroken && /* @__PURE__ */ jsx(StatusChip, { tone: "bad", title: "Opened by an admin with no second person", children: "glass broken" }),
            s.reviewState === "due" && /* @__PURE__ */ jsx(StatusChip, { tone: "warn", children: "review due" }),
            s.reviewState === "due" && s.noReviewer && /* @__PURE__ */ jsx("span", { className: classes.bad, title: "Owners, admins and the fallback reviewers group hold nobody but the requester; name a reviewers group (glidepath.breakglass.reviewers)", children: "no one else can review this" }),
            s.reviewState === "due" && s.reviewEscalatedAt && /* @__PURE__ */ jsx(StatusChip, { tone: "bad", title: `Escalated ${formatDateTime(s.reviewEscalatedAt)}`, children: "overdue" }),
            s.reviewState === "done" && /* @__PURE__ */ jsxs("span", { className: classes.rowMeta, title: `${formatDateTime(s.reviewedAt)}: ${s.reviewNote ?? ""}`, children: [
              "reviewed by ",
              shortUser(s.reviewedBy ?? "")
            ] }),
            s.endReason && /* @__PURE__ */ jsx("span", { className: classes.rowMeta, title: s.endReason, children: s.endReason.length > 80 ? `${s.endReason.slice(0, 80)}\u2026` : s.endReason }),
            s.mode === "live" && s.state === "ended" && /* @__PURE__ */ jsx("span", { className: classes.rowMeta, children: s.recycled ? "pod restarted" : "pod not restarted" }),
            s.cleanupNotes && /* @__PURE__ */ jsx("span", { className: classes.warn, title: s.cleanupNotes, children: "notes" }),
            s.recordingKey && /* @__PURE__ */ jsxs(Fragment, { children: [
              s.recordingRekorIndex !== void 0 ? /* @__PURE__ */ jsxs("span", { className: classes.rowMeta, title: `Rekor log index ${s.recordingRekorIndex} (${s.recordingRekorUuid ?? ""}) holds this recording's SHA-256, signed by the platform`, children: [
                "anchored #",
                s.recordingRekorIndex
              ] }) : /* @__PURE__ */ jsx("span", { className: classes.warn, title: s.anchorError ?? "Not yet anchored in the transparency log", children: "not anchored" }),
              /* @__PURE__ */ jsx("button", { type: "button", className: classes.link, onClick: () => setPlaying(s), title: "Play the recording here", children: "play" }),
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  className: classes.link,
                  onClick: () => download(s),
                  title: `SHA-256 ${s.recordingSha256 ?? ""}${s.recordingExpiresAt ? `
Kept until ${formatDateTime(s.recordingExpiresAt)}` : ""}`,
                  children: "download"
                }
              )
            ] }),
            mayReview(s, info) && /* @__PURE__ */ jsxs("div", { className: classes.actions, style: { flexBasis: "100%" }, "data-testid": `breakglass-review-${s.id}`, children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  "aria-label": `Review note for ${s.id}`,
                  placeholder: "What the recording shows, and whether breaking the glass was justified (required)",
                  value: reviewNote[s.id] ?? "",
                  onChange: (e) => setReviewNote((n) => ({ ...n, [s.id]: e.target.value })),
                  style: { flex: 1, minWidth: 200 }
                }
              ),
              /* @__PURE__ */ jsx(Button, { small: true, disabled: busy || !reviewNote[s.id]?.trim(), onClick: () => review(s.id), children: "Mark reviewed" })
            ] })
          ]
        },
        s.id
      ))
    ] }),
    playing && /* @__PURE__ */ jsx(RecordingPlayer, { session: playing, onClose: () => setPlaying(void 0) }, playing.id)
  ] });
}
function BreakglassEnvironmentCard({ env, tier, linkedSessionId }) {
  const t = useHangarTokens();
  const classes = useCardStyles({ t });
  const shared = useBreakglassStyles({ t });
  const data = useBreakglassSessions(env.appName, env.env, linkedSessionId);
  const count = needsYou(data.sessions, data.info);
  if (!env.appName) return null;
  return /* @__PURE__ */ jsxs("div", { className: classes.card, "data-testid": "breakglass-card", children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsx("span", { className: classes.headIcon, children: /* @__PURE__ */ jsx(LockOpenIcon, { fontSize: "small" }) }),
      /* @__PURE__ */ jsxs(Typography, { className: classes.title, children: [
        "Break-glass",
        count > 0 && /* @__PURE__ */ jsx("span", { className: shared.badge, "data-testid": "breakglass-needs-you", title: "Requests you can decide, your approved request, or reviews you can do", children: count })
      ] })
    ] }),
    /* @__PURE__ */ jsx(BreakglassEnvironmentView, { env, tier, data, linkedSessionId })
  ] });
}

export { BreakglassEnvironmentCard, BreakglassEnvironmentView };
//# sourceMappingURL=BreakglassEnvironmentView.esm.js.map
