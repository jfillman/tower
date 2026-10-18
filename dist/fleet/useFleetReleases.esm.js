import { useCallback } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy.esm.js';
import { usePlatformConfig, NO_CONTROL_PLANE } from '../platformConfig.esm.js';
import { toReleaseRecord, RELEASE_EVENT_REASONS, toReleaseEvent, RELEASE_RECORD_SELECTOR } from './releaseRecords.esm.js';
import { usePolled } from './usePolled.esm.js';

const RECORDS_POLL_MS = 15e3;
const EVENTS_POLL_MS = 6e4;
function useFleetReleaseRecords() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const cluster = usePlatformConfig().controlPlaneCluster;
  const fetcher = useCallback(async () => {
    if (!cluster) throw new Error(NO_CONTROL_PLANE);
    const res = await k8sProxyGet(
      discoveryApi,
      fetchApi,
      cluster,
      `/api/v1/configmaps?labelSelector=${encodeURIComponent(RELEASE_RECORD_SELECTOR)}`
    );
    return res.items.map(toReleaseRecord);
  }, [discoveryApi, fetchApi, cluster]);
  return usePolled(`fleet-release-records:${cluster ?? ""}`, fetcher, RECORDS_POLL_MS);
}
function useFleetReleaseEvents() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const cluster = usePlatformConfig().controlPlaneCluster;
  const fetcher = useCallback(async () => {
    if (!cluster) throw new Error(NO_CONTROL_PLANE);
    const lists = await Promise.all(
      RELEASE_EVENT_REASONS.map(
        (reason) => k8sProxyGet(
          discoveryApi,
          fetchApi,
          cluster,
          `/api/v1/events?fieldSelector=${encodeURIComponent(`reason=${reason}`)}`
        )
      )
    );
    return lists.flatMap((l) => l.items.map(toReleaseEvent).filter((e) => e !== void 0));
  }, [discoveryApi, fetchApi, cluster]);
  return usePolled(`fleet-release-events:${cluster ?? ""}`, fetcher, EVENTS_POLL_MS);
}

export { useFleetReleaseEvents, useFleetReleaseRecords };
//# sourceMappingURL=useFleetReleases.esm.js.map
