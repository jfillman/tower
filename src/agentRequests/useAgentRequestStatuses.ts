import { useCallback } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import type { Notification } from '@backstage/plugin-notifications-common';
import { usePolled, type Polled } from '../fleet/usePolled';
import { POLL_MS } from './useAgentRequests';

// What became of the questions For you holds notifications for: the backstage backend's GET /requests/status
// (agentRequests.ts there), which tells pending, answered (and by whom, when the answer went through Tower), expired and
// never seen apart. Clearance itself lists pending questions only. A backend without the route answers 404; then
// For you falls back to the pending list alone.

export type RequestStatus =
  | { status: 'pending' }
  | { status: 'answered'; answered_by: string | null; answered_at: string | null }
  | { status: 'expired'; expires_at: string }
  | { status: 'unknown' };

const REQUEST_ID = /^h-[0-9a-f]{12}$/;
const SCOPE = /^agent-request:(h-[0-9a-f]{12})$/;

/** The question a notification is about: its scope (`agent-request:<id>`) or its link's `id`. Undefined for older ones. */
export function requestIdOf(n: Pick<Notification, 'payload'>): string | undefined {
  const fromScope = n.payload.scope?.match(SCOPE)?.[1];
  if (fromScope) return fromScope;
  const link = n.payload.link;
  if (!link) return undefined;
  try {
    const id = new URL(link, 'http://tower.local').searchParams.get('id') ?? '';
    return REQUEST_ID.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

export function useAgentRequestStatuses(ids: string[]): Polled<Record<string, RequestStatus>> {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const key = [...new Set(ids)].sort().join(',');
  const fetcher = useCallback(async () => {
    if (!key) return {};
    const base = await discoveryApi.getBaseUrl('agent-requests');
    const res = await fetchApi.fetch(`${base}/requests/status?ids=${encodeURIComponent(key)}`);
    const body = await res.json().catch(() => undefined);
    if (!res.ok) throw new Error(body?.error ?? `agent request status failed with ${res.status}`);
    return (body?.items ?? {}) as Record<string, RequestStatus>;
  }, [discoveryApi, fetchApi, key]);
  return usePolled(`agent-request-status:${key}`, fetcher, POLL_MS);
}
