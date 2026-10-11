import { useCallback } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { usePolled, type Polled } from '../fleet/usePolled';

// The break-glass queue (gap G2): what the signed-in person can act on across every app, from
// GET /breakglass/queue. Notifications are fire-and-forget (a dismissed one is gone); this is the durable view
// of the same facts, polled every 30 s while the page is visible.

export interface BreakglassQueueRow {
  id: string;
  app: string;
  env: string;
  /** The app's catalog entity for the deep link; absent when the catalog no longer knows the app. */
  entityRef?: string;
  pod: string;
  mode: 'copy' | 'live';
  processAccess: boolean;
  volumeAccess: boolean;
  glassBroken: boolean;
  requester: string;
  approver?: string;
  reason: string;
  createdAt: string;
  expiresAt: string;
  endedAt?: string;
  /** A review due for more than 72 hours. */
  overdue: boolean;
}

export interface BreakglassQueue {
  toApprove: BreakglassQueueRow[];
  toStart: BreakglassQueueRow[];
  toReview: BreakglassQueueRow[];
}

export const QUEUE_POLL_MS = 30_000;

export const queueSize = (q: BreakglassQueue | undefined) => (q ? q.toApprove.length + q.toStart.length + q.toReview.length : 0);

/** Tower's deep link to one queue row's session, or undefined when the app has no catalog entity to link through. */
export function queueRowLink(row: BreakglassQueueRow): string | undefined {
  if (!row.entityRef) return undefined;
  return `?${new URLSearchParams({ entity: row.entityRef, tab: 'topology', env: row.env, breakglass: row.id })}`;
}

export function useBreakglassQueue(): Polled<BreakglassQueue> {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const fetcher = useCallback(async () => {
    const base = await discoveryApi.getBaseUrl('glidepath');
    const res = await fetchApi.fetch(`${base}/breakglass/queue`);
    const body = await res.json().catch(() => undefined);
    if (!res.ok) throw new Error(body?.error ?? `queue failed with ${res.status}`);
    return body as BreakglassQueue;
  }, [discoveryApi, fetchApi]);
  return usePolled('breakglass-queue', fetcher, QUEUE_POLL_MS);
}
