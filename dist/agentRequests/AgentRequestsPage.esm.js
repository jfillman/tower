import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useRef, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, useHangarTokens } from '../brand/tokens.esm.js';
import { relativeTime, formatDateTime } from '../shared/format.esm.js';
import { TextLink, PageHeader, Callout, EmptyNote, Card, Button } from '../ui/index.esm.js';
import { useAgentRequests, shortRef } from './useAgentRequests.esm.js';
import { useAgentRequestStatuses } from './useAgentRequestStatuses.esm.js';

const useStyles = makeStyles(() => ({
  root: { padding: "20px 24px 40px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 960 },
  body: { display: "flex", flexDirection: "column", gap: 10 },
  meta: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, display: "flex", gap: 14, flexWrap: "wrap" },
  question: { margin: 0, fontSize: 15, lineHeight: 1.45, color: ({ t }) => t.textHi, whiteSpace: "pre-wrap" },
  actions: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" },
  text: {
    flex: "1 1 320px",
    minHeight: 64,
    fontFamily: "inherit",
    fontSize: 13,
    padding: 8,
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.bg,
    color: ({ t }) => t.textHi
  },
  done: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.good },
  linked: { outline: ({ t }) => `2px solid ${t.amber}`, outlineOffset: 2 }
}));
function RequestCard({ r, linked, onAnswer }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const ref = useRef(null);
  useEffect(() => {
    if (linked) ref.current?.scrollIntoView?.({ block: "center" });
  }, [linked]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState();
  const send = async (answer) => {
    setBusy(true);
    try {
      const done = await onAnswer(r.id, answer);
      setOutcome({ ok: true, answer: done.answer ?? answer });
    } catch (e) {
      const err = e;
      setOutcome({ ok: false, message: err.message, hint: err.hint });
    } finally {
      setBusy(false);
    }
  };
  const from = r.group ? `${shortRef(r.owner)} \xB7 team ${shortRef(r.group)}` : shortRef(r.owner);
  return /* @__PURE__ */ jsx(
    Card,
    {
      ref,
      className: linked ? c.linked : void 0,
      title: r.agent,
      "aria-label": `Question from ${r.agent}`,
      "aria-current": linked ? "true" : void 0,
      meta: /* @__PURE__ */ jsxs("span", { className: c.meta, children: [
        /* @__PURE__ */ jsx("span", { title: r.owner, children: from }),
        /* @__PURE__ */ jsxs("span", { title: formatDateTime(r.created_at), children: [
          "asked ",
          relativeTime(r.created_at)
        ] }),
        /* @__PURE__ */ jsxs("span", { title: formatDateTime(r.expires_at), children: [
          "expires ",
          relativeTime(r.expires_at)
        ] }),
        /* @__PURE__ */ jsx("span", { title: `session ${r.session}`, children: r.task_id })
      ] }),
      children: /* @__PURE__ */ jsxs("div", { className: c.body, children: [
        /* @__PURE__ */ jsx("p", { className: c.question, children: r.question }),
        outcome?.ok ? /* @__PURE__ */ jsxs("span", { className: c.done, children: [
          "Answered: ",
          outcome.answer
        ] }) : /* @__PURE__ */ jsx("div", { className: c.actions, children: r.options.length > 0 ? r.options.map((o) => /* @__PURE__ */ jsx(Button, { small: true, disabled: busy, onClick: () => send(o), children: o }, o)) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(
            "textarea",
            {
              className: c.text,
              "aria-label": "Your answer",
              value: text,
              maxLength: 4e3,
              onChange: (e) => setText(e.target.value)
            }
          ),
          /* @__PURE__ */ jsx(Button, { small: true, disabled: busy || !text.trim(), onClick: () => send(text.trim()), children: "Send answer" })
        ] }) }),
        outcome && !outcome.ok && /* @__PURE__ */ jsxs(Callout, { tone: "bad", title: "Not answered", children: [
          outcome.message,
          outcome.hint ? ` ${outcome.hint}` : ""
        ] })
      ] })
    }
  );
}
function AgentRequestsPage({ onBack }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const requests = useAgentRequests();
  const items = requests.data ?? [];
  const [searchParams] = useSearchParams();
  const linkedId = searchParams.get("id") ?? void 0;
  const gone = !!linkedId && !!requests.data && !items.some((r) => r.id === linkedId);
  const status = useAgentRequestStatuses(gone && linkedId ? [linkedId] : []).data?.[linkedId ?? ""];
  let goneTitle = "That question is no longer open";
  if (status?.status === "answered") {
    goneTitle = `That question was answered${status.answered_by ? ` by ${shortRef(status.answered_by)}` : ""}${status.answered_at ? ` ${relativeTime(status.answered_at)}` : ""}`;
  } else if (status?.status === "expired") {
    goneTitle = `That question expired ${relativeTime(status.expires_at)}`;
  }
  return /* @__PURE__ */ jsxs("div", { className: c.root, children: [
    /* @__PURE__ */ jsx(TextLink, { onClick: onBack, children: "\u2190 All services" }),
    /* @__PURE__ */ jsx(
      PageHeader,
      {
        title: "Agent requests",
        subtitle: "Questions Hangar agents asked that you may answer: from your own sessions, or for one of your teams. Agents don't wait for you; each reads your answer when it's ready."
      }
    ),
    requests.error && !requests.data && /* @__PURE__ */ jsx(Callout, { tone: requests.error.includes("not configured") ? "warn" : "bad", title: "Agent requests are unavailable", children: requests.error }),
    requests.loading && !requests.data && !requests.error && /* @__PURE__ */ jsx(EmptyNote, { children: "Loading\u2026" }),
    gone && /* @__PURE__ */ jsx(Callout, { tone: "neutral", title: goneTitle, children: "The agent has moved on; nothing is waiting on an answer to it." }),
    requests.data && items.length === 0 && /* @__PURE__ */ jsx(EmptyNote, { children: "No agent is waiting on you." }),
    items.map((r) => /* @__PURE__ */ jsx(RequestCard, { r, linked: r.id === linkedId, onAnswer: requests.answer }, r.id))
  ] });
}

export { AgentRequestsPage };
//# sourceMappingURL=AgentRequestsPage.esm.js.map
