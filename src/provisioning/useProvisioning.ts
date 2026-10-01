import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy';
import { TEKTON_CLUSTER } from '../tekton/useTektonPipelineRuns';
import {
  deriveProvisioning,
  type BuildSnapshot,
  type ProvisioningInputs,
  type RolloutSnapshot,
  type XrCondition,
} from './deriveProvisioning';

// Airframe application XRs live on the dev cluster, the same one that runs
// Tekton (see TEKTON_CLUSTER). The four app-tier kinds are the ones a user
// can request from the scaffolder.
const XR_CLUSTER = TEKTON_CLUSTER;
const XR_PLURALS = ['nodejsapplications', 'springbootapplications', 'pythonapplications', 'goapplications'];
const POLL_MS = 6000;
// A service that was created long ago and never finished is a stuck or
// abandoned XR, not something being provisioned right now.
const MAX_AGE_MS = 24 * 3600 * 1000;
// How long a finished provision stays in the strip so the user sees it land.
const KEEP_DONE_MS = 15 * 60 * 1000;

interface ListResponse<T> {
  items?: T[];
}
interface RawXr {
  kind?: string;
  metadata: { name: string; namespace: string; creationTimestamp: string };
  status?: { conditions?: XrCondition[] };
}
interface RawPipelineRun {
  metadata: { name: string; creationTimestamp: string };
  status?: {
    conditions?: { type: string; status: string; reason?: string }[];
    startTime?: string;
    completionTime?: string;
    pipelineSpec?: { tasks?: unknown[] };
    childReferences?: unknown[];
  };
}
interface RawRollout {
  metadata: { creationTimestamp: string };
  spec?: { replicas?: number };
  status?: { phase?: string; availableReplicas?: number };
}

const epoch = (iso?: string) => (iso ? Date.parse(iso) : undefined);

export function toBuild(run: RawPipelineRun): BuildSnapshot {
  const succeeded = run.status?.conditions?.find(c => c.type === 'Succeeded');
  let phase: BuildSnapshot['phase'] = 'pending';
  if (succeeded?.status === 'True') phase = 'succeeded';
  else if (succeeded?.status === 'False') phase = 'failed';
  else if (run.status?.startTime) phase = 'running';
  const total = run.status?.pipelineSpec?.tasks?.length ?? 0;
  // childReferences lists every TaskRun created so far, including the one
  // running now, so a running pipeline has finished one fewer than it lists.
  const created = run.status?.childReferences?.length ?? 0;
  const done = phase === 'succeeded' ? total : Math.max(0, created - (phase === 'running' ? 1 : 0));
  return {
    name: run.metadata.name,
    phase,
    startedAt: epoch(run.status?.startTime),
    completedAt: epoch(run.status?.completionTime),
    tasksDone: done,
    tasksTotal: total,
  };
}

export function toRollout(r: RawRollout): RolloutSnapshot {
  return {
    phase: r.status?.phase,
    desired: r.spec?.replicas ?? 1,
    available: r.status?.availableReplicas ?? 0,
    createdAt: epoch(r.metadata.creationTimestamp),
  };
}

export interface UseProvisioningResult {
  items: ProvisioningInputs[];
  loading: boolean;
  /** Set when the XR list could not be read at all, so an empty list is not mistaken for "nothing in flight". */
  error?: string;
}

export function useProvisioning(): UseProvisioningResult {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<UseProvisioningResult>({
    items: [],
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    const optional = async <T>(path: string): Promise<T | undefined> => {
      try {
        return await k8sProxyGet<T>(discoveryApi, fetchApi, XR_CLUSTER, path);
      } catch {
        // Missing namespace or no read grant: the step just stays pending.
        return undefined;
      }
    };

    const load = async () => {
      const lists = await Promise.allSettled(
        XR_PLURALS.map(p =>
          k8sProxyGet<ListResponse<RawXr>>(discoveryApi, fetchApi, XR_CLUSTER, `/apis/catalog.hangar.io/v1alpha1/${p}`),
        ),
      );
      if (cancelled) return;
      if (lists.every(l => l.status === 'rejected')) {
        const reason = (lists[0] as PromiseRejectedResult).reason;
        setState({
          items: [],
          loading: false,
          error: String(reason?.message ?? reason),
        });
        return;
      }
      const now = Date.now();
      const xrs = lists
        .flatMap((l, i) =>
          l.status === 'fulfilled'
            ? (l.value.items ?? []).map(x => ({
                ...x,
                kind: x.kind ?? XR_PLURALS[i],
              }))
            : [],
        )
        .filter(x => now - Date.parse(x.metadata.creationTimestamp) < MAX_AGE_MS);

      const items = await Promise.all(
        xrs.map(async (x): Promise<ProvisioningInputs> => {
          const name = x.metadata.name;
          const [runs, rollouts] = await Promise.all([
            optional<ListResponse<RawPipelineRun>>(`/apis/tekton.dev/v1/namespaces/app-${name}-cicd/pipelineruns`),
            optional<ListResponse<RawRollout>>(`/apis/argoproj.io/v1alpha1/namespaces/app-${name}-dev/rollouts`),
          ]);
          const first = [...(runs?.items ?? [])].sort((a, b) =>
            a.metadata.creationTimestamp.localeCompare(b.metadata.creationTimestamp),
          )[0];
          return {
            xr: {
              kind: x.kind ?? '',
              name,
              namespace: x.metadata.namespace,
              cluster: XR_CLUSTER,
              createdAt: Date.parse(x.metadata.creationTimestamp),
              conditions: x.status?.conditions ?? [],
            },
            build: first ? toBuild(first) : undefined,
            rollout: rollouts?.items?.[0] ? toRollout(rollouts.items[0]) : undefined,
          };
        }),
      );
      if (cancelled) return;
      const kept = items.filter(i => {
        const p = deriveProvisioning(i, now);
        return !p.complete || (p.completedAt !== undefined && now - p.completedAt < KEEP_DONE_MS);
      });
      kept.sort((a, b) => b.xr.createdAt - a.xr.createdAt);
      setState({ items: kept, loading: false });
    };

    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [discoveryApi, fetchApi]);

  return state;
}
