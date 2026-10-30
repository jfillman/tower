import { useCallback } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { NO_CONTROL_PLANE, usePlatformConfig } from '../platformConfig';
import { RELEASE_EVENT_REASONS, toReleaseRecord, type ReleaseEvent, type ReleaseEventReason, type ReleaseRecord } from './releaseRecords';
import { usePolled, type Polled } from './usePolled';

// Release records and the Events Glidepath raises on them both live on the control-plane cluster, the one that runs
// Tekton (tower.controlPlaneCluster). Read through the backend from glidepath-api (GET /v1/releases and
// /v1/releases/events) since 2026-10-30; Tower listed the ConfigMaps and Events itself through the Kubernetes proxy
// until then.

const RECORDS_POLL_MS = 15_000;
const EVENTS_POLL_MS = 60_000;

type Apis = { discoveryApi: { getBaseUrl(id: string): Promise<string> }; fetchApi: { fetch: typeof fetch } };

async function getJson<T>({ discoveryApi, fetchApi }: Apis, path: string): Promise<T> {
  const base = await discoveryApi.getBaseUrl('glidepath');
  const res = await fetchApi.fetch(`${base}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw new Error(body?.error ?? `request failed with ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** A record as glidepath-api lists it: the ConfigMap's name, namespace, labels and data. */
export interface ApiReleaseRecord {
  name: string;
  namespace: string;
  labels?: Record<string, string>;
  data?: Record<string, string>;
}

export function fromApiRecord(r: ApiReleaseRecord): ReleaseRecord {
  return toReleaseRecord({ metadata: { name: r.name, namespace: r.namespace, labels: r.labels }, data: r.data });
}

/** An Event as glidepath-api lists it; anything but the two release reasons is dropped. */
export function fromApiEvent(e: { reason?: string; namespace?: string; recordName?: string; message?: string; at?: string }): ReleaseEvent | undefined {
  if (!(RELEASE_EVENT_REASONS as string[]).includes(e.reason ?? '')) return undefined;
  return { reason: e.reason as ReleaseEventReason, namespace: e.namespace ?? '', recordName: e.recordName ?? '', message: e.message, at: e.at };
}

export function useFleetReleaseRecords(): Polled<ReleaseRecord[]> {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const cluster = usePlatformConfig().controlPlaneCluster;
  const fetcher = useCallback(async () => {
    if (!cluster) throw new Error(NO_CONTROL_PLANE);
    const body = await getJson<{ releases: ApiReleaseRecord[] }>({ discoveryApi, fetchApi }, '/fleet/releases');
    return body.releases.map(fromApiRecord);
  }, [discoveryApi, fetchApi, cluster]);
  return usePolled(`fleet-release-records:${cluster ?? ''}`, fetcher, RECORDS_POLL_MS);
}

export function useFleetReleaseEvents(): Polled<ReleaseEvent[]> {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const cluster = usePlatformConfig().controlPlaneCluster;
  const fetcher = useCallback(async () => {
    if (!cluster) throw new Error(NO_CONTROL_PLANE);
    const body = await getJson<{ events: Parameters<typeof fromApiEvent>[0][] }>({ discoveryApi, fetchApi }, '/fleet/release-events');
    return body.events.map(fromApiEvent).filter((e): e is ReleaseEvent => e !== undefined);
  }, [discoveryApi, fetchApi, cluster]);
  return usePolled(`fleet-release-events:${cluster ?? ''}`, fetcher, EVENTS_POLL_MS);
}
