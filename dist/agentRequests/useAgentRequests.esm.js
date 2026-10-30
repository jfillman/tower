import { useCallback } from 'react';
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
function useAgentRequests() {
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
const shortRef = (ref) => ref ? ref.replace(/^(user|group):([^/]+\/)?/, "") : "";

export { AnswerError, POLL_MS, shortRef, useAgentRequests };
//# sourceMappingURL=useAgentRequests.esm.js.map
