import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, fontDisplay, useHangarTokens } from '../brand/tokens.esm.js';
import { relativeTime, formatDateTime } from '../shared/format.esm.js';
import { isStale } from '../fleet/usePolled.esm.js';
import { useBreakglassQueue, queueSize, queueRowLink } from './useBreakglassQueue.esm.js';

const useStyles = makeStyles(() => ({
  strip: {
    border: ({ t }) => `1px solid ${t.line}`,
    borderLeft: ({ t }) => `3px solid ${t.bad}`,
    borderRadius: 6,
    backgroundColor: ({ t }) => t.panel,
    padding: "12px 14px",
    marginBottom: 20,
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  label: {
    fontFamily: fontMono,
    fontSize: 10.5,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: ({ t }) => t.textFaint,
    display: "flex",
    alignItems: "center",
    gap: 8
  },
  badge: {
    fontFamily: fontMono,
    fontSize: 11,
    fontWeight: 600,
    padding: "1px 7px",
    borderRadius: 10,
    backgroundColor: ({ t }) => t.bad,
    color: ({ t }) => t.bg
  },
  stale: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.amberInk },
  group: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint, marginTop: 4 },
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(140px, 1fr) minmax(200px, 2.4fr) minmax(110px, 0.9fr)",
    gap: 16,
    alignItems: "center",
    width: "100%",
    textAlign: "left",
    padding: "8px 12px",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textHi,
    "&:hover": { outline: ({ t }) => `1px solid ${t.skyLine}` },
    "&:disabled": { cursor: "default", opacity: 0.7 },
    "@media (max-width: 700px)": { gridTemplateColumns: "1fr" }
  },
  name: { fontFamily: fontDisplay, fontWeight: 600, fontSize: 14, overflowWrap: "anywhere" },
  nameSub: { display: "block", fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint, fontWeight: 400 },
  what: { fontSize: 12.5, color: ({ t }) => t.textLo, minWidth: 0 },
  whatMain: { display: "block", color: ({ t }) => t.textHi, fontWeight: 500 },
  when: { fontFamily: fontMono, fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" },
  whenSub: { display: "block", fontSize: 10, letterSpacing: "0.08em", color: ({ t }) => t.textFaint },
  overdue: { color: ({ t }) => t.bad, fontWeight: 700 }
}));
const shortUser = (ref) => ref.replace(/^user:[^/]+\//, "");
function remaining(expiresAt, now) {
  const s = Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1e3));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function options(r) {
  return `${r.mode}${r.processAccess ? " + process access" : ""}${r.volumeAccess ? " + volume access" : ""}`;
}
function BreakglassQueueStrip({ onOpen }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const queue = useBreakglassQueue();
  const [now, setNow] = useState(Date.now());
  const size = queueSize(queue.data);
  useEffect(() => {
    if (size === 0) return void 0;
    const timer = setInterval(() => setNow(Date.now()), 1e3);
    return () => clearInterval(timer);
  }, [size]);
  if (!queue.data || size === 0) return null;
  const stale = isStale(queue, now);
  const row = (r, what, when) => {
    const link = queueRowLink(r);
    return /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        className: classes.row,
        disabled: !link,
        title: link ? `Open in Tower: ${r.app} ${r.env}` : "The catalog no longer knows this app",
        onClick: () => link && onOpen(r, link),
        "data-testid": `breakglass-queue-${r.id}`,
        children: [
          /* @__PURE__ */ jsxs("span", { className: classes.name, children: [
            r.app,
            /* @__PURE__ */ jsxs("span", { className: classes.nameSub, children: [
              r.env,
              " \xB7 ",
              r.pod
            ] })
          ] }),
          /* @__PURE__ */ jsxs("span", { className: classes.what, children: [
            /* @__PURE__ */ jsx("span", { className: classes.whatMain, children: what }),
            /* @__PURE__ */ jsxs("span", { title: r.reason, children: [
              "\u201C",
              r.reason.length > 90 ? `${r.reason.slice(0, 90)}\u2026` : r.reason,
              "\u201D"
            ] })
          ] }),
          /* @__PURE__ */ jsx("span", { className: classes.when, children: when })
        ]
      },
      r.id
    );
  };
  const { toApprove, toStart, toReview } = queue.data;
  return /* @__PURE__ */ jsxs("div", { className: classes.strip, "data-testid": "breakglass-queue", children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsxs("span", { className: classes.label, children: [
        "Break-glass",
        /* @__PURE__ */ jsx("span", { className: classes.badge, children: size }),
        stale && /* @__PURE__ */ jsxs("span", { className: classes.stale, title: queue.error, children: [
          "stale: last read ",
          queue.updatedAt ? relativeTime(new Date(queue.updatedAt).toISOString()) : "never"
        ] })
      ] }),
      /* @__PURE__ */ jsx("span", { className: classes.group, children: "what needs you, across every app" })
    ] }),
    toApprove.length > 0 && /* @__PURE__ */ jsx("span", { className: classes.group, children: "To approve or deny" }),
    toApprove.map(
      (r) => row(
        r,
        `${shortUser(r.requester)} asks for a ${options(r)} session`,
        /* @__PURE__ */ jsxs(Fragment, { children: [
          remaining(r.expiresAt, now),
          /* @__PURE__ */ jsx("span", { className: classes.whenSub, children: "until it expires" })
        ] })
      )
    ),
    toStart.length > 0 && /* @__PURE__ */ jsx("span", { className: classes.group, children: "Approved, waiting for you to start" }),
    toStart.map(
      (r) => row(
        r,
        `approved by ${shortUser(r.approver ?? "")}: your ${options(r)} session`,
        /* @__PURE__ */ jsxs(Fragment, { children: [
          remaining(r.expiresAt, now),
          /* @__PURE__ */ jsx("span", { className: classes.whenSub, children: "to press Start" })
        ] })
      )
    ),
    toReview.length > 0 && /* @__PURE__ */ jsx("span", { className: classes.group, children: "Reviews due" }),
    toReview.map(
      (r) => row(
        r,
        `${shortUser(r.requester)} broke the glass: ${options(r)} session`,
        /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("span", { className: r.overdue ? classes.overdue : void 0, title: r.endedAt ? `Ended ${formatDateTime(r.endedAt)}` : void 0, children: [
            r.overdue ? "overdue" : "ended",
            " ",
            r.endedAt ? relativeTime(r.endedAt) : ""
          ] }),
          /* @__PURE__ */ jsx("span", { className: classes.whenSub, children: r.overdue ? "more than 72 h ago" : "review due" })
        ] })
      )
    )
  ] });
}

export { BreakglassQueueStrip };
//# sourceMappingURL=BreakglassQueueStrip.esm.js.map
