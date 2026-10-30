import { useCallback } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { notificationsApiRef } from '@backstage/plugin-notifications';
import type { Notification } from '@backstage/plugin-notifications-common';
import { usePolled, type Polled } from '../fleet/usePolled';

// For you: the notifications addressed to the signed-in person (an agent's question, a break-glass request to
// decide, a review due), as opposed to broadcasts (pipeline results), which carry `user: null` and stay on each app's
// Notifications tab. The stock notifications backend already scopes the list to the caller; this keeps only the
// personal ones. Polled like every other Tower source, never the signals websocket (useAppNotifications says why).

export const POLL_MS = 30_000;
const LIMIT = 100;

/** A notification sent to this person, not a broadcast. */
export const isPersonal = (n: Notification) => n.user !== null && n.user !== undefined;

export function usePersonalNotifications(): Polled<Notification[]> {
  const notificationsApi = useApi(notificationsApiRef);
  const fetcher = useCallback(async () => {
    const { notifications } = await notificationsApi.getNotifications({ limit: LIMIT, sort: 'created', sortOrder: 'desc' });
    return notifications.filter(isPersonal);
  }, [notificationsApi]);
  return usePolled('personal-notifications', fetcher, POLL_MS);
}
