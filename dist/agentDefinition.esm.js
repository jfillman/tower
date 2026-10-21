import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { EmptyNote, FactGrid, Fact, TextLink, Hint, Chip, Section, Panel } from './ui/index.esm.js';

const AGENT_DEFINITION_ANNOTATION = "hangar.io/agent-definition";
function agentDefinitionRef(entity) {
  const [owner, repo] = entity?.metadata.annotations?.["github.com/project-slug"]?.split("/") ?? [];
  if (!owner || !repo) return void 0;
  return { owner, repo, path: entity?.metadata.annotations?.[AGENT_DEFINITION_ANNOTATION]?.trim() || "agent.yaml" };
}
const SHAPE_LABEL = {
  task: "Task: one run per request",
  session: "Session: a person chats with it",
  service: "Service: long-running",
  scheduled: "Scheduled",
  event: "Event: runs when an event arrives",
  team: "Team: plans and delegates to child runs"
};
function triggerLabel(t) {
  const type = String(t.type ?? "unknown");
  if (type === "interval" && t.every) return `every ${String(t.every)}`;
  if (type === "cron" && t.schedule) return `cron ${String(t.schedule)}`;
  const rest = Object.entries(t).filter(([k]) => k !== "type").map(([k, v]) => `${k} ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  return rest.length ? `${type} (${rest.join(", ")})` : type;
}
const LIMIT_LABEL = {
  ttlMinutes: "Run time (min)",
  toolCalls: "Tool calls",
  githubCalls: "GitHub calls",
  openPrs: "Open PRs",
  modelTokens: "Model tokens",
  children: "Child runs"
};
function useAgentDefinition(ref) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: Boolean(ref)
  });
  const key = ref ? `${ref.owner}/${ref.repo}/${ref.path}` : "";
  useEffect(() => {
    if (!ref) {
      setState({ loading: false });
      return void 0;
    }
    let cancelled = false;
    (async () => {
      try {
        const base = await discoveryApi.getBaseUrl("glidepath");
        const res = await fetchApi.fetch(`${base}/agent-definition?${new URLSearchParams(ref)}`);
        const body = await res.json().catch(() => void 0);
        if (cancelled) return;
        if (res.status === 404) setState({ loading: false, missing: true });
        else if (!res.ok) setState({ loading: false, error: body?.error ?? `${res.status} ${res.statusText}` });
        else setState({ loading: false, data: body });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, discoveryApi, fetchApi]);
  return state;
}
function AgentDefinitionPanel({ entity }) {
  const ref = agentDefinitionRef(entity);
  const { loading, data, error, missing } = useAgentDefinition(ref);
  let body;
  if (!ref) body = /* @__PURE__ */ jsx(EmptyNote, { children: "This agent's catalog entry names no GitHub repo, so Tower cannot find its definition." });
  else if (loading) body = /* @__PURE__ */ jsxs(EmptyNote, { children: [
    "Reading ",
    ref.path,
    "\u2026"
  ] });
  else if (missing)
    body = /* @__PURE__ */ jsxs(EmptyNote, { children: [
      "No ",
      ref.path,
      " in ",
      ref.owner,
      "/",
      ref.repo,
      ". Point the ",
      AGENT_DEFINITION_ANNOTATION,
      " annotation at the agent's file (agent.yaml or agents/<name>.yaml)."
    ] });
  else if (error || !data) body = /* @__PURE__ */ jsxs(EmptyNote, { children: [
    "Could not read ",
    ref.path,
    ": ",
    error
  ] });
  else
    body = /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs(FactGrid, { children: [
        /* @__PURE__ */ jsx(Fact, { label: "Shape", children: SHAPE_LABEL[data.shape] }),
        /* @__PURE__ */ jsxs(Fact, { label: "Identity", children: [
          data.identity?.type ?? "\u2014",
          data.identity?.serviceAccount ? ` \xB7 ${data.identity.serviceAccount}` : ""
        ] }),
        /* @__PURE__ */ jsx(Fact, { label: "Tier ceiling", children: data.tierCeiling ?? "\u2014" }),
        /* @__PURE__ */ jsx(Fact, { label: "Models", children: data.models.join(", ") || "\u2014" }),
        /* @__PURE__ */ jsx(Fact, { label: "Network", children: data.network ?? "\u2014" }),
        /* @__PURE__ */ jsx(Fact, { label: "Compute", children: data.compute ?? "\u2014" }),
        /* @__PURE__ */ jsx(Fact, { label: "Framework", children: [data.framework, data.sandbox && `${data.sandbox} sandbox`].filter(Boolean).join(" \xB7 ") || "\u2014" }),
        /* @__PURE__ */ jsx(Fact, { label: "Triggers", children: data.triggers.map(triggerLabel).join(", ") || "\u2014" }),
        /* @__PURE__ */ jsx(Fact, { label: "Definition", children: /* @__PURE__ */ jsxs(TextLink, { href: data.url, children: [
          data.path,
          " \u2197"
        ] }) })
      ] }),
      /* @__PURE__ */ jsx(Hint, { children: "Tools it may call, through Clearance" }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 }, children: data.tools.length ? data.tools.map((tool) => /* @__PURE__ */ jsx(Chip, { children: tool }, tool)) : /* @__PURE__ */ jsx(EmptyNote, { children: "None" }) }),
      data.apis.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Hint, { children: "Service APIs it may reach" }),
        /* @__PURE__ */ jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 }, children: data.apis.map((api) => /* @__PURE__ */ jsx(Chip, { tone: "sky", children: api }, api)) })
      ] }),
      Object.keys(data.limits).length > 0 && /* @__PURE__ */ jsx(FactGrid, { children: Object.entries(data.limits).map(([k, v]) => /* @__PURE__ */ jsx(Fact, { label: LIMIT_LABEL[k] ?? k, children: v.toLocaleString() }, k)) })
    ] });
  return /* @__PURE__ */ jsx(Section, { title: "Agent", children: /* @__PURE__ */ jsx(Panel, { children: body }) });
}

export { AGENT_DEFINITION_ANNOTATION, AgentDefinitionPanel, agentDefinitionRef, triggerLabel, useAgentDefinition };
//# sourceMappingURL=agentDefinition.esm.js.map
