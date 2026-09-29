import { useState, useCallback, useEffect } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { notificationsApiRef } from '@backstage/plugin-notifications';

const POLL_INTERVAL_MS = 3e4;
const LIST_LIMIT = 50;
const RECENT_THRESHOLD_MS = 60 * 60 * 1e3;
function isRecentNotification(n, now = Date.now()) {
  return now - new Date(n.created).getTime() < RECENT_THRESHOLD_MS;
}
function useAppNotifications(appName) {
  const notificationsApi = useApi(notificationsApiRef);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(void 0);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((v) => v + 1), []);
  useEffect(() => {
    if (!appName) {
      setNotifications([]);
      setLoading(false);
      return void 0;
    }
    let cancelled = false;
    notificationsApi.getNotifications({ search: appName, limit: LIST_LIMIT, sort: "created", sortOrder: "desc" }).then((res) => {
      if (!cancelled) {
        setNotifications(res.notifications);
        setLoading(false);
        setError(void 0);
      }
    }).catch((e) => {
      if (!cancelled) {
        setError(String(e));
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [appName, notificationsApi, tick]);
  useEffect(() => {
    if (!appName) return void 0;
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [appName, refresh]);
  const recentCount = notifications.filter((n) => isRecentNotification(n)).length;
  return { notifications, recentCount, loading, error, refresh };
}

export { RECENT_THRESHOLD_MS, isRecentNotification, useAppNotifications };
//# sourceMappingURL=useAppNotifications.esm.js.map
