import { jsxs, jsx } from 'react/jsx-runtime';
import { useNavigate } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, useHangarTokens } from '../brand/tokens.esm.js';
import { relativeTime, formatDateTime } from '../shared/format.esm.js';
import { isRecentNotification } from '../useAppNotifications.esm.js';
import { TextLink, PageHeader, Callout, Card, EmptyNote, Tile, StatusChip } from '../ui/index.esm.js';
import { useAgentRequests } from '../agentRequests/useAgentRequests.esm.js';
import { usePersonalNotifications } from './usePersonalNotifications.esm.js';

const SEVERITY = {
  critical: { tone: "bad", label: "critical" },
  high: { tone: "warn", label: "high" },
  normal: { tone: "info", label: "normal" },
  low: { tone: "neutral", label: "low" }
};
const useStyles = makeStyles(() => ({
  root: { padding: "20px 24px 40px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 1040 },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  layout: { display: "grid", gridTemplateColumns: "84px minmax(0, 1fr) auto", gap: 12, alignItems: "baseline" },
  desc: { margin: "2px 0 0", fontSize: 12, color: ({ t }) => t.textFaint },
  meta: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "baseline" },
  fresh: { color: ({ t }) => t.amberInk, fontWeight: 600 }
}));
function Row({ n }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const navigate = useNavigate();
  const sev = SEVERITY[n.payload.severity ?? "normal"] ?? SEVERITY.normal;
  const link = n.payload.link;
  const internal = !!link && link.startsWith("/");
  return /* @__PURE__ */ jsxs(Tile, { className: c.layout, children: [
    /* @__PURE__ */ jsx(StatusChip, { tone: sev.tone, children: sev.label }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("strong", { children: n.payload.title }),
      n.payload.description && /* @__PURE__ */ jsx("p", { className: c.desc, children: n.payload.description })
    ] }),
    /* @__PURE__ */ jsxs("span", { className: c.meta, children: [
      isRecentNotification(n) && /* @__PURE__ */ jsx("span", { className: c.fresh, children: "new" }),
      n.payload.topic && /* @__PURE__ */ jsx("span", { children: n.payload.topic }),
      /* @__PURE__ */ jsx("span", { title: formatDateTime(String(n.created)), children: relativeTime(n.created) }),
      link && (internal ? /* @__PURE__ */ jsx(TextLink, { onClick: () => navigate(link), children: "Open \u2192" }) : /* @__PURE__ */ jsx(TextLink, { href: link, children: "Open \u2197" }))
    ] })
  ] });
}
function ForYouPage({ onBack, onOpenAgentRequests }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const personal = usePersonalNotifications();
  const waiting = useAgentRequests().data?.length ?? 0;
  const items = personal.data ?? [];
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
    /* @__PURE__ */ jsxs(Card, { title: "Sent to you", children: [
      personal.loading && !personal.data && /* @__PURE__ */ jsx(EmptyNote, { children: "Loading\u2026" }),
      personal.data && items.length === 0 && /* @__PURE__ */ jsx(EmptyNote, { children: "Nothing has been sent to you personally yet." }),
      /* @__PURE__ */ jsx("div", { className: c.list, children: items.map((n) => /* @__PURE__ */ jsx(Row, { n }, n.id)) })
    ] })
  ] });
}

export { ForYouPage };
//# sourceMappingURL=ForYouPage.esm.js.map
