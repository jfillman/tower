import { createElement, createContext, useCallback, useContext } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { usePolled } from '../fleet/usePolled.esm.js';

const POLL_MS = 3e4;
class AnswerError extends Error {
  constructor(message, status, rule, hint) {
    super(message);
    this.status = status;
    this.rule = rule;
    this.hint = hint;
  }
  status;
  rule;
  hint;
}
function usePolledAgentRequests() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const fetcher = useCallback(async () => {
    const base = await discoveryApi.getBaseUrl("agent-requests");
    const res = await fetchApi.fetch(`${base}/requests`);
    const body = await res.json().catch(() => void 0);
    if (!res.ok) throw new Error(body?.error ?? `agent requests failed with ${res.status}`);
    return body?.items ?? [];
  }, [discoveryApi, fetchApi]);
  const polled = usePolled("agent-requests", fetcher, POLL_MS);
  const answer = useCallback(
    async (id, text) => {
      const base = await discoveryApi.getBaseUrl("agent-requests");
      const res = await fetchApi.fetch(`${base}/requests/${encodeURIComponent(id)}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: text })
      });
      const body = await res.json().catch(() => void 0);
      if (!res.ok) throw new AnswerError(body?.error ?? `answer failed with ${res.status}`, res.status, body?.rule, body?.hint);
      return body;
    },
    [discoveryApi, fetchApi]
  );
  return { ...polled, answer };
}
const Ctx = createContext(void 0);
function AgentRequestsProvider({ children }) {
  return createElement(Ctx.Provider, { value: usePolledAgentRequests() }, children);
}
function useAgentRequests() {
  const shared = useContext(Ctx);
  if (!shared) throw new Error("useAgentRequests needs an AgentRequestsProvider above it");
  return shared;
}
const shortRef = (ref) => ref ? ref.replace(/^(user|group):([^/]+\/)?/, "") : "";

export { AgentRequestsProvider, AnswerError, POLL_MS, shortRef, useAgentRequests };
//# sourceMappingURL=useAgentRequests.esm.js.map
