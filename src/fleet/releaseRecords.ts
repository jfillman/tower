// Glidepath's release records, as the Ops Wall reads them. One ConfigMap per release to an
// upper-cluster environment, `release-tracking-<chain-id>` in `app-<name>-cicd` on the dev
// cluster; the state machine and every key are documented in glidepath's
// docs/admin/release-state.md. Read-only here: Glidepath's tasks, relay and sweeper write them.

export const RELEASE_RECORD_SELECTOR = 'hangar.io/subcomponent=release-tracking';

export type ReleaseState =
  | 'proposed'
  | 'merged'
  | 'progressing'
  | 'sync-failed'
  | 'healthy'
  | 'aborted'
  | 'degraded'
  | 'superseded'
  | 'rolled-back'
  | 'closed';

/** Waiting on Argo CD or the Rollout: the release is deploying. */
export const DEPLOYING_STATES: ReadonlySet<string> = new Set(['merged', 'progressing', 'sync-failed']);
/** The release ended badly. */
export const FAILED_STATES: ReadonlySet<string> = new Set(['aborted', 'degraded']);

export interface ReleaseRecord {
  /** The ConfigMap name; Events about the record point at it. */
  name: string;
  namespace: string;
  releaseId?: string;
  kind?: string;
  appName: string;
  env: string;
  cluster: string;
  /** Unknown states pass through as-is; the relay may add new ones. */
  state: ReleaseState | string;
  stateAt?: string;
  prUrl?: string;
  prCreatedAt?: string;
  mergedAt?: string;
  flowStartTime?: string;
  gitUrl?: string;
  gitRevision?: string;
  lastFactAt?: string;
  lastFactPhase?: string;
  lastError?: string;
  drift?: string;
  supersededBy?: string;
}

export interface RawConfigMap {
  metadata: { name: string; namespace: string; labels?: Record<string, string> };
  data?: Record<string, string>;
}

const nonEmpty = (v: string | undefined) => (v ? v : undefined);

export function toReleaseRecord(cm: RawConfigMap): ReleaseRecord {
  const d = cm.data ?? {};
  const labels = cm.metadata.labels ?? {};
  return {
    name: cm.metadata.name,
    namespace: cm.metadata.namespace,
    releaseId: nonEmpty(d.releaseId),
    kind: nonEmpty(d.kind),
    appName: d.appName || labels['hangar.io/app'] || cm.metadata.namespace.replace(/^app-/, '').replace(/-cicd$/, ''),
    env: d.env || labels['hangar.io/env'] || '',
    cluster: d.cluster || labels['hangar.io/cluster'] || '',
    // A record from before the state machine has no state; it was opened, so it is proposed.
    state: d.state || 'proposed',
    stateAt: nonEmpty(d.stateAt),
    prUrl: nonEmpty(d.prUrl),
    prCreatedAt: nonEmpty(d.prCreatedAt),
    mergedAt: nonEmpty(d.mergedAt),
    flowStartTime: nonEmpty(d.flowStartTime),
    gitUrl: nonEmpty(d.gitUrl),
    gitRevision: nonEmpty(d.gitRevision),
    lastFactAt: nonEmpty(d.lastFactAt),
    lastFactPhase: nonEmpty(d.lastFactPhase),
    lastError: nonEmpty(d.lastError),
    drift: nonEmpty(d.drift),
    supersededBy: nonEmpty(d.supersededBy),
  };
}

export type ReleaseEventReason = 'ReleaseStalled' | 'ReleaseDrift';
export const RELEASE_EVENT_REASONS: ReleaseEventReason[] = ['ReleaseStalled', 'ReleaseDrift'];

export interface ReleaseEvent {
  reason: ReleaseEventReason;
  namespace: string;
  /** The record (ConfigMap) the event is about. */
  recordName: string;
  message?: string;
  at?: string;
}

export interface RawEvent {
  reason?: string;
  message?: string;
  involvedObject?: { kind?: string; name?: string; namespace?: string };
  metadata: { namespace: string; creationTimestamp?: string };
  lastTimestamp?: string;
  eventTime?: string;
  firstTimestamp?: string;
}

export function toReleaseEvent(e: RawEvent): ReleaseEvent | undefined {
  if (e.reason !== 'ReleaseStalled' && e.reason !== 'ReleaseDrift') return undefined;
  return {
    reason: e.reason,
    namespace: e.involvedObject?.namespace ?? e.metadata.namespace,
    recordName: e.involvedObject?.name ?? '',
    message: e.message,
    at: e.lastTimestamp ?? e.eventTime ?? e.firstTimestamp ?? e.metadata.creationTimestamp,
  };
}
