import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { notificationsApiRef } from '@backstage/plugin-notifications';
import type { Notification } from '@backstage/plugin-notifications-common';

// Reuses the stock notifications-backend REST API (already installed/wired
// app-wide - packages/backend/src/index.ts, ../nav/Sidebar.tsx's own bell
// icon) rather than mounting that plugin's own page/table components inside
// Tower - same "reuse the backend, reimplement the UI" posture as
// pullRequests/usePullRequests.ts. Notifications carry no structured
// entity/app reference (broadcast-only, see glidepath's
// notify-backstage.yaml), so `search` against the free-text title/
// description - which the sender always embeds "App: <name> (<namespace>)"
// into - is the only real per-app filter available today. A plain polling
// refresh, not the signals websocket the stock sidebar badge uses
// internally: @backstage/plugin-signals-react isn't a declared dependency of
// this package yet, and every other Tower data hook already polls rather
// than pushes.
const POLL_INTERVAL_MS = 30_000;
const LIST_LIMIT = 50;

// 2026-09-09 feedback: drop the stock plugin's read/unread model entirely -
// "I don't think we need the user to have to manage these incoming
// notifications." A pipeline notification (build/test/deploy result) is
// informational, not a to-do item, so recency - not a persisted per-user
// read flag - is what actually matters: something that landed in the last
// hour is worth a glance, anything older is just history. One hour is long
// enough to survive a normal "check the tab a bit after the build finished"
// gap without still reading as new a day later. Purely a function of
// `created`, so every instance of this hook (tab badge, Overview card,
// NotificationsTab's own list) agrees without needing the read-state
// cross-instance sync the old model required.
export const RECENT_THRESHOLD_MS = 60 * 60 * 1000;

export function isRecentNotification(n: Notification, now = Date.now()): boolean {
  return now - new Date(n.created).getTime() < RECENT_THRESHOLD_MS;
}

export interface UseAppNotificationsResult {
  notifications: Notification[];
  recentCount: number;
  loading: boolean;
  error?: string;
  refresh: () => void;
}

export function useAppNotifications(appName?: string): UseAppNotificationsResult {
  const notificationsApi = useApi(notificationsApiRef);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(v => v + 1), []);

  useEffect(() => {
    if (!appName) {
      setNotifications([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    notificationsApi
      .getNotifications({ search: appName, limit: LIST_LIMIT, sort: 'created', sortOrder: 'desc' })
      .then(res => {
        if (!cancelled) {
          setNotifications(res.notifications);
          setLoading(false);
          setError(undefined);
        }
      })
      .catch(e => {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [appName, notificationsApi, tick]);

  // The 30s poll tick is also what "moves" a notification from new to old
  // as time passes with no new data - recency is recomputed fresh on every
  // render, and this timer is what guarantees a render keeps happening.
  useEffect(() => {
    if (!appName) return undefined;
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [appName, refresh]);

  const recentCount = notifications.filter(n => isRecentNotification(n)).length;

  return { notifications, recentCount, loading, error, refresh };
}
