import { useCallback } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { notificationsApiRef } from '@backstage/plugin-notifications';
import { usePolled } from '../fleet/usePolled.esm.js';

const POLL_MS = 3e4;
const LIMIT = 100;
const isPersonal = (n) => n.user !== null && n.user !== void 0;
const isRead = (n) => Boolean(n.read);
function usePersonalNotifications() {
  const notificationsApi = useApi(notificationsApiRef);
  const fetcher = useCallback(async () => {
    const { notifications } = await notificationsApi.getNotifications({ limit: LIMIT, sort: "created", sortOrder: "desc" });
    return notifications.filter(isPersonal);
  }, [notificationsApi]);
  const polled = usePolled("personal-notifications", fetcher, POLL_MS);
  const markRead = useCallback(
    async (ids) => {
      if (ids.length > 0) await notificationsApi.updateNotifications({ ids, read: true });
    },
    [notificationsApi]
  );
  return { ...polled, markRead };
}

export { POLL_MS, isPersonal, isRead, usePersonalNotifications };
//# sourceMappingURL=usePersonalNotifications.esm.js.map
