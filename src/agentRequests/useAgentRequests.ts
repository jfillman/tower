import { useCallback } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { usePolled, type Polled } from '../fleet/usePolled';

// Agent requests: the questions Hangar agents ask people through Clearance (human.request), the ones the signed-in
// person may answer, from the backstage backend's /api/agent-requests (agentRequests.ts there). Clearance decides who
// may answer (the agent's session owner, or a member of its definition's owner team); this view only lists and
// answers. Polled every 30 s while the page is visible; a notification arrives for each new question too.

export interface AgentRequest {
  id: string;
  task_id: string;
  session: string;
  agent: string;
  /** The session's owner, `user:<login>`. */
  owner: string;
  /** The agent definition's owner team, a group ref, if it has one. */
  group: string | null;
  question: string;
  /** When non-empty, the answer must be one of these. */
  options: string[];
  created_at: string;
  expires_at: string;
  status: 'pending' | 'answered' | 'expired';
  answer: string | null;
  answered_by: string | null;
}

export const POLL_MS = 30_000;

/** An answer Clearance refused, with its rule and hint (HR-ANSWERED, HR-EXPIRED, HR-ANSWER, ...). */
export class AnswerError extends Error {
  constructor(message: string, readonly status: number, readonly rule?: string, readonly hint?: string) {
    super(message);
  }
}

export function useAgentRequests(): Polled<AgentRequest[]> & { answer: (id: string, answer: string) => Promise<AgentRequest> } {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const fetcher = useCallback(async () => {
    const base = await discoveryApi.getBaseUrl('agent-requests');
    const res = await fetchApi.fetch(`${base}/requests`);
    const body = await res.json().catch(() => undefined);
    if (!res.ok) throw new Error(body?.error ?? `agent requests failed with ${res.status}`);
    return (body?.items ?? []) as AgentRequest[];
  }, [discoveryApi, fetchApi]);
  const polled = usePolled('agent-requests', fetcher, POLL_MS);
  const answer = useCallback(
    async (id: string, text: string) => {
      const base = await discoveryApi.getBaseUrl('agent-requests');
      const res = await fetchApi.fetch(`${base}/requests/${encodeURIComponent(id)}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: text }),
      });
      const body = await res.json().catch(() => undefined);
      if (!res.ok) throw new AnswerError(body?.error ?? `answer failed with ${res.status}`, res.status, body?.rule, body?.hint);
      return body as AgentRequest;
    },
    [discoveryApi, fetchApi],
  );
  return { ...polled, answer };
}

/** `user:jfillman` -> `jfillman`; `group:default/team-platform` -> `team-platform`. */
export const shortRef = (ref: string | null | undefined) => (ref ? ref.replace(/^(user|group):([^/]+\/)?/, '') : '');
