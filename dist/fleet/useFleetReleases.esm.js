import { useCallback } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { usePlatformConfig, NO_CONTROL_PLANE } from '../platformConfig.esm.js';
import { toReleaseRecord, RELEASE_EVENT_REASONS } from './releaseRecords.esm.js';
import { usePolled } from './usePolled.esm.js';

const RECORDS_POLL_MS = 15e3;
const EVENTS_POLL_MS = 6e4;
async function getJson({ discoveryApi, fetchApi }, path) {
  const base = await discoveryApi.getBaseUrl("glidepath");
  const res = await fetchApi.fetch(`${base}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => void 0);
    throw new Error(body?.error ?? `request failed with ${res.status}`);
  }
  return res.json();
}
function fromApiRecord(r) {
  return toReleaseRecord({ metadata: { name: r.name, namespace: r.namespace, labels: r.labels }, data: r.data });
}
function fromApiEvent(e) {
  if (!RELEASE_EVENT_REASONS.includes(e.reason ?? "")) return void 0;
  return { reason: e.reason, namespace: e.namespace ?? "", recordName: e.recordName ?? "", message: e.message, at: e.at };
}
function useFleetReleaseRecords() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const cluster = usePlatformConfig().controlPlaneCluster;
  const fetcher = useCallback(async () => {
    if (!cluster) throw new Error(NO_CONTROL_PLANE);
    const body = await getJson({ discoveryApi, fetchApi }, "/fleet/releases");
    return body.releases.map(fromApiRecord);
  }, [discoveryApi, fetchApi, cluster]);
  return usePolled(`fleet-release-records:${cluster ?? ""}`, fetcher, RECORDS_POLL_MS);
}
function useFleetReleaseEvents() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const cluster = usePlatformConfig().controlPlaneCluster;
  const fetcher = useCallback(async () => {
    if (!cluster) throw new Error(NO_CONTROL_PLANE);
    const body = await getJson({ discoveryApi, fetchApi }, "/fleet/release-events");
    return body.events.map(fromApiEvent).filter((e) => e !== void 0);
  }, [discoveryApi, fetchApi, cluster]);
  return usePolled(`fleet-release-events:${cluster ?? ""}`, fetcher, EVENTS_POLL_MS);
}

export { fromApiEvent, fromApiRecord, useFleetReleaseEvents, useFleetReleaseRecords };
//# sourceMappingURL=useFleetReleases.esm.js.map
