// Why a deployment is not coming up, read from what Kubernetes itself says about it: each pod's state (image pull errors, crash
// loops and their last exit reason, "unschedulable" with the scheduler's own message, a missing ConfigMap or Secret) and the
// namespace's Warning events. A canary stuck on Pending pods is an ordinary "Progressing" Rollout, so the Rollout and ArgoCD
// signals the Troubleshoot banner reasons from say nothing about it (2026-10-05: "the canary just sits there showing pods in a
// pending stage"). Pure, tested against shapes the API returns.

export interface PodIssue {
  /** Same cause across pods collapses into one issue. */
  key: string;
  title: string;
  /** What Kubernetes said, as it said it. */
  detail: string;
  /** What to do about it, in plain words. */
  hint: string;
  pods: string[];
}

export interface RawPod {
  metadata?: { name?: string; creationTimestamp?: string };
  status?: {
    phase?: string;
    reason?: string;
    message?: string;
    conditions?: Array<{ type?: string; status?: string; reason?: string; message?: string }>;
    containerStatuses?: RawContainerStatus[];
    initContainerStatuses?: RawContainerStatus[];
  };
}

interface RawContainerStatus {
  name?: string;
  restartCount?: number;
  state?: { waiting?: { reason?: string; message?: string }; terminated?: { reason?: string; exitCode?: number; message?: string } };
  lastState?: { terminated?: { reason?: string; exitCode?: number; message?: string } };
}

export interface RawEvent {
  type?: string;
  reason?: string;
  message?: string;
  count?: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  eventTime?: string;
  involvedObject?: { kind?: string; name?: string };
  metadata?: { creationTimestamp?: string };
}

/** What each Kubernetes reason means for a person, and what to try first. */
export const HINTS: Record<string, string> = {
  ImagePullBackOff:
    'The cluster cannot pull the image. Check that the tag exists in the registry and that the registry credentials (the registry-credentials Secret) are valid in this namespace. A first release that has not set release.image yet looks like this too.',
  ErrImagePull: 'The cluster cannot pull the image. Check that the tag exists in the registry and that the registry credentials are valid in this namespace.',
  InvalidImageName: 'The image reference is malformed. An empty tag (an image ending in ":") usually means the first release has not set release.image yet.',
  CrashLoopBackOff: 'The container starts and then exits, over and over. Read its logs (Topology tab, the pod, Logs) and the last exit reason below.',
  OOMKilled: 'The container was killed for using more memory than its limit. Raise resources.limits.memory (Values, Workload tab) or find what is using it.',
  CreateContainerConfigError: 'A ConfigMap, a Secret or a key the container refers to does not exist in this namespace. Check the environment variables that take a value from one, and the secrets entries.',
  CreateContainerError: 'The container could not be created. The message says why: often a command that does not exist in the image, or a volume that cannot be mounted.',
  RunContainerError: 'The container could not be started. The message says why: often a command that does not exist in the image.',
  Unschedulable: 'No node can take this pod. The message says which constraint: not enough CPU or memory (resource requests above what any node offers never schedule), a taint, or an affinity rule.',
  FailedScheduling: 'No node can take this pod. The message says which constraint: not enough CPU or memory, a taint, or an affinity rule.',
  FailedMount: 'A volume, ConfigMap or Secret cannot be mounted into the pod, so it stays in ContainerCreating. Check that the object exists and the claim is bound.',
  FailedCreate: 'The ReplicaSet could not create its pods: usually a quota, a missing ServiceAccount, or an admission policy denying the pod. The message says which.',
  Unhealthy: 'A liveness or readiness probe is failing. Check the probe path and port against what the container actually serves.',
  BackOff: 'Kubernetes is backing off from restarting a failing container or retrying an image pull.',
  Evicted: 'The node evicted this pod, usually for memory or disk pressure.',
  ContainerCreating: 'The container is still being created. If this lasts, look at the FailedMount and image pull events.',
};

const WAITING_PROBLEMS = new Set([
  'ImagePullBackOff',
  'ErrImagePull',
  'InvalidImageName',
  'CrashLoopBackOff',
  'CreateContainerConfigError',
  'CreateContainerError',
  'RunContainerError',
]);

/** A pod stuck in ContainerCreating longer than this is reported; a few minutes is normal for a first pull. */
export const CREATING_TOO_LONG_MS = 5 * 60 * 1000;

const first = (s?: string, n = 240) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

function lastExit(c: RawContainerStatus): string {
  const t = c.lastState?.terminated ?? c.state?.terminated;
  if (!t) return '';
  return ` Last exit: ${t.reason ?? 'Error'}${t.exitCode !== undefined ? ` (exit code ${t.exitCode})` : ''}.`;
}

/** The issues across the pods, one per distinct cause, worst first. Healthy pods contribute nothing. */
export function podIssues(pods: RawPod[], now: number): PodIssue[] {
  const byKey = new Map<string, PodIssue>();
  const add = (key: string, title: string, detail: string, hint: string, pod: string) => {
    const hit = byKey.get(key);
    if (hit) {
      if (!hit.pods.includes(pod)) hit.pods.push(pod);
    } else byKey.set(key, { key, title, detail, hint, pods: [pod] });
  };
  for (const p of pods) {
    const name = p.metadata?.name ?? 'pod';
    const st = p.status;
    if (!st) continue;
    if (st.reason === 'Evicted') add('Evicted', 'A pod was evicted', first(st.message), HINTS.Evicted, name);
    const statuses = [...(st.initContainerStatuses ?? []), ...(st.containerStatuses ?? [])];
    for (const c of statuses) {
      const w = c.state?.waiting;
      if (w?.reason && WAITING_PROBLEMS.has(w.reason)) {
        const title: Record<string, string> = {
          ImagePullBackOff: 'The image cannot be pulled',
          ErrImagePull: 'The image cannot be pulled',
          InvalidImageName: 'The image name is invalid',
          CrashLoopBackOff: 'A container keeps crashing',
          CreateContainerConfigError: 'A container is missing configuration',
          CreateContainerError: 'A container cannot be created',
          RunContainerError: 'A container cannot be started',
        };
        // Pull errors share one cause whichever of the two reasons a pod happens to show.
        const cause = w.reason === 'ErrImagePull' ? 'ImagePullBackOff' : w.reason;
        const detail =
          cause === 'CrashLoopBackOff'
            ? `${c.name ?? 'container'}: ${first(w.message, 120)}${lastExit(c)}${c.restartCount ? ` Restarted ${c.restartCount} time${c.restartCount === 1 ? '' : 's'}.` : ''}`
            : `${c.name ?? 'container'}: ${first(w.message)}`;
        add(cause, title[w.reason], detail.trim(), HINTS[w.reason], name);
        const t = c.lastState?.terminated;
        if (cause === 'CrashLoopBackOff' && t?.reason === 'OOMKilled') {
          add('OOMKilled', 'A container ran out of memory', `${c.name ?? 'container'}: killed for exceeding its memory limit (exit code ${t.exitCode ?? 137}).`, HINTS.OOMKilled, name);
        }
      } else if (w?.reason === 'ContainerCreating') {
        const created = Date.parse(p.metadata?.creationTimestamp ?? '');
        if (Number.isFinite(created) && now - created > CREATING_TOO_LONG_MS) {
          const minutes = Math.round((now - created) / 60000);
          add('ContainerCreating', 'A container is taking long to start', `${c.name ?? 'container'}: still being created after ${minutes} minutes.`, HINTS.ContainerCreating, name);
        }
      }
    }
    const scheduled = st.conditions?.find(c => c.type === 'PodScheduled');
    if (st.phase === 'Pending' && scheduled?.status === 'False') {
      add('Unschedulable', 'A pod cannot be scheduled', first(scheduled.message) || scheduled.reason || 'No node can take it.', HINTS.Unschedulable, name);
    }
  }
  // A pod crash-looping because it was killed for memory is one problem: keep the cause, drop the symptom for that pod.
  const oom = byKey.get('OOMKilled');
  const loop = byKey.get('CrashLoopBackOff');
  if (oom && loop) {
    loop.pods = loop.pods.filter(p => !oom.pods.includes(p));
    if (loop.pods.length === 0) byKey.delete('CrashLoopBackOff');
  }
  const rank = (k: string) => (['OOMKilled', 'CrashLoopBackOff', 'ImagePullBackOff', 'InvalidImageName', 'CreateContainerConfigError', 'CreateContainerError', 'RunContainerError', 'Unschedulable', 'Evicted'].indexOf(k) + 100) % 100;
  return [...byKey.values()].sort((a, b) => rank(a.key) - rank(b.key));
}

export interface WarningGroup {
  reason: string;
  message: string;
  /** "Pod/boarding-api-6b8f-x2k" of the most recent event in the group. */
  object: string;
  count: number;
  lastSeen: number;
  hint?: string;
}

const eventTime = (e: RawEvent) =>
  Date.parse(e.lastTimestamp ?? e.eventTime ?? e.firstTimestamp ?? e.metadata?.creationTimestamp ?? '') || 0;

/**
 * Warning events from the last `windowMs`, the same reason and message grouped (a crash-looping pod emits hundreds), most recent
 * first. Normal events never appear: they are not what someone looking for the problem needs.
 */
export function warningGroups(events: RawEvent[], now: number, windowMs = 30 * 60 * 1000): WarningGroup[] {
  const groups = new Map<string, WarningGroup>();
  for (const e of events) {
    if (e.type !== 'Warning') continue;
    const at = eventTime(e);
    if (!at || now - at > windowMs) continue;
    const reason = e.reason ?? 'Warning';
    const message = first(e.message, 300);
    // Pod names differ per replica set revision; reason + message with the pod hash removed is the cause.
    const key = `${reason}|${message.replace(/[a-z0-9]{5,10}-[a-z0-9]{5}\b/g, '*')}`;
    const object = `${e.involvedObject?.kind ?? 'Object'}/${e.involvedObject?.name ?? '?'}`;
    const g = groups.get(key);
    if (g) {
      g.count += e.count ?? 1;
      if (at > g.lastSeen) {
        g.lastSeen = at;
        g.object = object;
      }
    } else groups.set(key, { reason, message, object, count: e.count ?? 1, lastSeen: at, hint: HINTS[reason] });
  }
  return [...groups.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}
