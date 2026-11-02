import { jsxs, jsx } from 'react/jsx-runtime';
import { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, useHangarTokens } from '../brand/tokens.esm.js';
import { relativeTime, formatDateTime } from '../shared/format.esm.js';
import { isRecentNotification } from '../useAppNotifications.esm.js';
import { TextLink, PageHeader, Callout, Card, EmptyNote, FilterBar, FilterChips, Tile, StatusChip } from '../ui/index.esm.js';
import { useAgentRequests, shortRef } from '../agentRequests/useAgentRequests.esm.js';
import { requestIdOf, useAgentRequestStatuses } from '../agentRequests/useAgentRequestStatuses.esm.js';
import { usePersonalNotifications, isRead } from './usePersonalNotifications.esm.js';

const SEVERITY = {
  critical: { tone: "bad", label: "critical" },
  high: { tone: "warn", label: "high" },
  normal: { tone: "info", label: "normal" },
  low: { tone: "neutral", label: "low" }
};
const REQUEST_MAX_AGE_MS = 24 * 36e5;
function resolutionOf(n, pending, statuses, now) {
  if (n.payload.topic !== "agent-requests") return void 0;
  const id = requestIdOf(n);
  if (!id) {
    return now - new Date(n.created).getTime() > REQUEST_MAX_AGE_MS ? { label: "no longer open" } : void 0;
  }
  const s = statuses?.[id];
  if (s?.status === "answered") {
    const by = s.answered_by ? ` by ${shortRef(s.answered_by)}` : "";
    const at = s.answered_at ? ` \xB7 ${relativeTime(s.answered_at)}` : "";
    return { label: `answered${by}${at}`, title: s.answered_at ? formatDateTime(s.answered_at) : void 0 };
  }
  if (s?.status === "expired") return { label: "expired", title: formatDateTime(s.expires_at) };
  if (s?.status === "pending") return void 0;
  if (pending && !pending.some((r) => r.id === id)) return { label: "no longer open" };
  return void 0;
}
const useStyles = makeStyles(() => ({
  root: { padding: "20px 24px 40px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 1040 },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  layout: { display: "grid", gridTemplateColumns: "84px minmax(0, 1fr) auto", gap: 12, alignItems: "baseline" },
  read: { opacity: 0.6 },
  desc: { margin: "2px 0 0", fontSize: 12, color: ({ t }) => t.textFaint },
  meta: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "baseline" },
  fresh: { color: ({ t }) => t.amberInk, fontWeight: 600 },
  resolved: { color: ({ t }) => t.textLo }
}));
function Row({ n, read, resolution, onRead }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const navigate = useNavigate();
  const sev = SEVERITY[n.payload.severity ?? "normal"] ?? SEVERITY.normal;
  const link = resolution ? void 0 : n.payload.link;
  const internal = !!link && link.startsWith("/");
  const open = () => {
    if (!read) onRead();
    if (link) navigate(link);
  };
  return /* @__PURE__ */ jsxs(Tile, { className: read ? `${c.layout} ${c.read}` : c.layout, "aria-label": `${read ? "Read" : "Unread"}: ${n.payload.title}`, children: [
    /* @__PURE__ */ jsx(StatusChip, { tone: sev.tone, children: sev.label }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("strong", { children: n.payload.title }),
      n.payload.description && /* @__PURE__ */ jsx("p", { className: c.desc, children: n.payload.description })
    ] }),
    /* @__PURE__ */ jsxs("span", { className: c.meta, children: [
      !read && isRecentNotification(n) && /* @__PURE__ */ jsx("span", { className: c.fresh, children: "new" }),
      n.payload.topic && /* @__PURE__ */ jsx("span", { children: n.payload.topic }),
      /* @__PURE__ */ jsx("span", { title: formatDateTime(String(n.created)), children: relativeTime(n.created) }),
      resolution && /* @__PURE__ */ jsx("span", { className: c.resolved, title: resolution.title, children: resolution.label }),
      !read && !resolution && /* @__PURE__ */ jsx(TextLink, { onClick: onRead, children: "Mark read" }),
      link && (internal ? /* @__PURE__ */ jsx(TextLink, { onClick: open, children: "Open \u2192" }) : /* @__PURE__ */ jsx("span", { onClickCapture: () => {
        if (!read) onRead();
      }, children: /* @__PURE__ */ jsx(TextLink, { href: link, children: "Open \u2197" }) }))
    ] })
  ] });
}
function ForYouPage({ onBack, onOpenAgentRequests }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const personal = usePersonalNotifications();
  const requests = useAgentRequests();
  const waiting = requests.data?.length ?? 0;
  const items = useMemo(() => personal.data ?? [], [personal.data]);
  const ids = useMemo(() => items.map(requestIdOf).filter((x) => !!x), [items]);
  const statuses = useAgentRequestStatuses(ids);
  const [show, setShow] = useState("unread");
  const [readHere, setReadHere] = useState(() => /* @__PURE__ */ new Set());
  const [markError, setMarkError] = useState();
  const asked = useRef(/* @__PURE__ */ new Set());
  const now = personal.updatedAt ?? Date.now();
  const rows = useMemo(() => {
    const out = items.map((n) => {
      const resolution = resolutionOf(n, requests.data, statuses.data, now);
      return { n, resolution, read: isRead(n) || readHere.has(n.id) || Boolean(resolution) };
    });
    return [...out.filter((r) => !r.read), ...out.filter((r) => r.read)];
  }, [items, requests.data, statuses.data, now, readHere]);
  const markRead = (toMark) => {
    const fresh = toMark.filter((id) => !asked.current.has(id));
    if (fresh.length === 0) return;
    fresh.forEach((id) => asked.current.add(id));
    setReadHere((prev) => /* @__PURE__ */ new Set([...prev, ...fresh]));
    personal.markRead(fresh).catch((e) => {
      fresh.forEach((id) => asked.current.delete(id));
      setMarkError(e instanceof Error ? e.message : String(e));
    });
  };
  const resolvedUnread = rows.filter((r) => r.resolution && !isRead(r.n)).map((r) => r.n.id).join(",");
  useEffect(() => {
    if (resolvedUnread) markRead(resolvedUnread.split(","));
  }, [resolvedUnread]);
  const unread = rows.filter((r) => !r.read).length;
  const shown = show === "unread" ? rows.filter((r) => !r.read) : rows;
  return /* @__PURE__ */ jsxs("div", { className: c.root, children: [
    /* @__PURE__ */ jsx(TextLink, { onClick: onBack, children: "\u2190 All services" }),
    /* @__PURE__ */ jsx(PageHeader, { title: "For you", subtitle: "What was sent to you personally, across every app. Pipeline results for everyone stay on each app's Notifications tab." }),
    waiting > 0 && /* @__PURE__ */ jsx(
      Callout,
      {
        tone: "warn",
        title: `${waiting} agent ${waiting === 1 ? "question is" : "questions are"} waiting on you`,
        actions: /* @__PURE__ */ jsx(TextLink, { onClick: onOpenAgentRequests, children: "Agent requests \u2192" })
      }
    ),
    personal.error && !personal.data && /* @__PURE__ */ jsx(Callout, { tone: "bad", title: "Your notifications could not be loaded", children: personal.error }),
    markError && /* @__PURE__ */ jsx(Callout, { tone: "bad", title: "Could not mark read", children: markError }),
    /* @__PURE__ */ jsxs(Card, { title: "Sent to you", children: [
      personal.loading && !personal.data && /* @__PURE__ */ jsx(EmptyNote, { children: "Loading\u2026" }),
      personal.data && items.length === 0 && /* @__PURE__ */ jsx(EmptyNote, { children: "Nothing has been sent to you personally yet." }),
      personal.data && items.length > 0 && /* @__PURE__ */ jsx(FilterBar, { children: /* @__PURE__ */ jsx(
        FilterChips,
        {
          label: "Show",
          hideLabel: true,
          value: show,
          onChange: setShow,
          options: [{ id: "unread", label: "Unread", count: unread }, { id: "all", label: "All", count: rows.length }]
        }
      ) }),
      personal.data && items.length > 0 && shown.length === 0 && /* @__PURE__ */ jsxs(EmptyNote, { children: [
        "Nothing unread. ",
        /* @__PURE__ */ jsx(TextLink, { onClick: () => setShow("all"), children: "Show all" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: c.list, children: shown.map((r) => /* @__PURE__ */ jsx(Row, { n: r.n, read: r.read, resolution: r.resolution, onRead: () => markRead([r.n.id]) }, r.n.id)) })
    ] })
  ] });
}

export { ForYouPage, REQUEST_MAX_AGE_MS, resolutionOf };
//# sourceMappingURL=ForYouPage.esm.js.map
