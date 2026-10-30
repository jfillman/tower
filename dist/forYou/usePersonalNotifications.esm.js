import { useCallback } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { notificationsApiRef } from '@backstage/plugin-notifications';
import { usePolled } from '../fleet/usePolled.esm.js';

const POLL_MS = 3e4;
const LIMIT = 100;
const isPersonal = (n) => n.user !== null && n.user !== void 0;
function usePersonalNotifications() {
  const notificationsApi = useApi(notificationsApiRef);
  const fetcher = useCallback(async () => {
    const { notifications } = await notificationsApi.getNotifications({ limit: LIMIT, sort: "created", sortOrder: "desc" });
    return notifications.filter(isPersonal);
  }, [notificationsApi]);
  return usePolled("personal-notifications", fetcher, POLL_MS);
}

export { POLL_MS, isPersonal, usePersonalNotifications };
//# sourceMappingURL=usePersonalNotifications.esm.js.map
