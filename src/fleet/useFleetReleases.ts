import { useCallback } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy';
import { NO_CONTROL_PLANE, usePlatformConfig } from '../platformConfig';
import {
  RELEASE_EVENT_REASONS,
  RELEASE_RECORD_SELECTOR,
  toReleaseEvent,
  toReleaseRecord,
  type RawConfigMap,
  type RawEvent,
  type ReleaseEvent,
  type ReleaseRecord,
} from './releaseRecords';
import { usePolled, type Polled } from './usePolled';

// Release records and the Events Glidepath raises on them both live on the control-plane cluster,
// the one that runs Tekton (tower.controlPlaneCluster). One cluster-wide list each (the read identity
// may list ConfigMaps and Events cluster-wide; checked 2026-10-07).

const RECORDS_POLL_MS = 15_000;
const EVENTS_POLL_MS = 60_000;

export function useFleetReleaseRecords(): Polled<ReleaseRecord[]> {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const cluster = usePlatformConfig().controlPlaneCluster;
  const fetcher = useCallback(async () => {
    if (!cluster) throw new Error(NO_CONTROL_PLANE);
    const res = await k8sProxyGet<{ items: RawConfigMap[] }>(
      discoveryApi,
      fetchApi,
      cluster,
      `/api/v1/configmaps?labelSelector=${encodeURIComponent(RELEASE_RECORD_SELECTOR)}`,
    );
    return res.items.map(toReleaseRecord);
  }, [discoveryApi, fetchApi, cluster]);
  return usePolled(`fleet-release-records:${cluster ?? ''}`, fetcher, RECORDS_POLL_MS);
}

export function useFleetReleaseEvents(): Polled<ReleaseEvent[]> {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const cluster = usePlatformConfig().controlPlaneCluster;
  const fetcher = useCallback(async () => {
    if (!cluster) throw new Error(NO_CONTROL_PLANE);
    const lists = await Promise.all(
      RELEASE_EVENT_REASONS.map(reason =>
        k8sProxyGet<{ items: RawEvent[] }>(
          discoveryApi,
          fetchApi,
          cluster,
          `/api/v1/events?fieldSelector=${encodeURIComponent(`reason=${reason}`)}`,
        ),
      ),
    );
    return lists.flatMap(l => l.items.map(toReleaseEvent).filter((e): e is ReleaseEvent => e !== undefined));
  }, [discoveryApi, fetchApi, cluster]);
  return usePolled(`fleet-release-events:${cluster ?? ''}`, fetcher, EVENTS_POLL_MS);
}
