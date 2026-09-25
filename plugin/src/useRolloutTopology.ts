import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { k8sProxyGet } from './k8sProxy';

// Live object graph behind the Deployment tab's "Rollout Starts" topology DAG
// (2026-09-24). Goes straight at the generic Kubernetes proxy (same reasoning
// as useAnalysisRuns.ts - ReplicaSets/AnalysisRuns/Jobs carry no
// hangar.io/app label) and polls, because the whole point of the diagram is
// watching the canary ReplicaSet appear and the old one drain away.
// Pods, ReplicaSets and the Rollout are essential; Services, AnalysisRuns and
// Jobs are best-effort (an RBAC gap on one of them shouldn't blank the graph).

const POLL_MS = 4000;

export interface K8sObj {
  apiVersion?: string;
  kind?: string;
  metadata: {
    name: string;
    namespace?: string;
    uid?: string;
    labels?: Record<string, string>;
    creationTimestamp?: string;
    deletionTimestamp?: string;
    ownerReferences?: Array<{ kind: string; name: string; uid?: string }>;
  };
  spec?: any;
  status?: any;
}

export type TopoRole = 'canary' | 'stable' | 'unknown';

export interface TopoPod {
  obj: K8sObj;
  rsName: string;
  ready: boolean;
  terminating: boolean;
  phase: string;
  containers: string[];
}
export interface TopoReplicaSet {
  obj: K8sObj;
  role: TopoRole;
  hash: string;
  replicas: number;
  ready: number;
  pods: TopoPod[];
}
export interface TopoAnalysisRun {
  obj: K8sObj;
  phase: string;
  pods: TopoPod[];
}
export interface RolloutTopology {
  rollout: K8sObj;
  service?: K8sObj;
  replicaSets: TopoReplicaSet[];
  analysisRuns: TopoAnalysisRun[];
  // 0-100. 100 stable / 0 canary whenever no canary is mid-flight.
  canaryWeight: number;
  canaryInFlight: boolean;
}

export interface UseRolloutTopologyResult {
  loading: boolean;
  error?: string;
  topology?: RolloutTopology;
}

function ownedBy(o: K8sObj, kind: string, name: string): boolean {
  return Boolean(o.metadata.ownerReferences?.some(r => r.kind === kind && r.name === name));
}

function toPod(obj: K8sObj, rsName: string): TopoPod {
  const conds: Array<{ type: string; status: string }> = obj.status?.conditions ?? [];
  return {
    obj,
    rsName,
    ready: conds.some(c => c.type === 'Ready' && c.status === 'True'),
    terminating: Boolean(obj.metadata.deletionTimestamp),
    phase: obj.status?.phase ?? 'Unknown',
    containers: (obj.spec?.containers ?? []).map((c: { name: string }) => c.name),
  };
}

export function buildTopology(
  rollout: K8sObj,
  rss: K8sObj[],
  pods: K8sObj[],
  services: K8sObj[],
  ars: K8sObj[],
  jobs: K8sObj[],
): RolloutTopology {
  const name = rollout.metadata.name;
  const currentHash: string | undefined = rollout.status?.currentPodHash;
  const stableHash: string | undefined = rollout.status?.canary?.stableRS ?? rollout.status?.stableRS;
  const inFlight = Boolean(currentHash && stableHash && currentHash !== stableHash);

  const replicaSets: TopoReplicaSet[] = rss
    .filter(rs => ownedBy(rs, 'Rollout', name))
    .map(rs => {
      const hash = rs.metadata.labels?.['rollouts-pod-template-hash'] ?? rs.metadata.labels?.['pod-template-hash'] ?? '';
      const rsPods = pods.filter(p => ownedBy(p, 'ReplicaSet', rs.metadata.name)).map(p => toPod(p, rs.metadata.name));
      let role: TopoRole = 'unknown';
      if (hash && hash === stableHash) role = 'stable';
      else if (hash && hash === currentHash) role = 'canary';
      return {
        obj: rs,
        role,
        hash,
        replicas: rs.spec?.replicas ?? 0,
        ready: rs.status?.readyReplicas ?? 0,
        pods: rsPods,
      };
    })
    // An old ReplicaSet lingers at 0 replicas after promotion - it "disappears"
    // from the diagram once it has neither desired replicas nor live pods.
    .filter(rs => rs.replicas > 0 || rs.pods.length > 0)
    .sort((a, b) => (Number(b.role === 'stable') - Number(a.role === 'stable')));

  // The Rollout only has "canary" weight while a canary is actually in flight.
  const weights = rollout.status?.canary?.weights;
  const weight = inFlight
    ? Number(weights?.canary?.weight ?? rollout.status?.canary?.currentStepWeight ?? 0)
    : 0;

  const stableSvc: string | undefined = rollout.spec?.strategy?.canary?.stableService;
  const service =
    services.find(s => s.metadata.name === stableSvc) ??
    services.find(s => s.metadata.name === name) ??
    services[0];

  const analysisRuns: TopoAnalysisRun[] = ars
    .filter(ar => ownedBy(ar, 'Rollout', name))
    .filter(ar => !currentHash || ar.metadata.labels?.['rollouts-pod-template-hash'] === currentHash)
    .map(ar => {
      const myJobs = jobs.filter(j => ownedBy(j, 'AnalysisRun', ar.metadata.name));
      const arPods = myJobs.flatMap(j => pods.filter(p => ownedBy(p, 'Job', j.metadata.name)).map(p => toPod(p, ar.metadata.name)));
      return { obj: ar, phase: ar.status?.phase ?? 'Pending', pods: arPods };
    })
    .sort((a, b) => new Date(a.obj.metadata.creationTimestamp ?? 0).getTime() - new Date(b.obj.metadata.creationTimestamp ?? 0).getTime());

  return { rollout, service, replicaSets, analysisRuns, canaryWeight: Math.max(0, Math.min(100, weight)), canaryInFlight: inFlight };
}

export function useRolloutTopology(target: { cluster: string; namespace: string; rolloutName: string } | undefined): UseRolloutTopologyResult {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<UseRolloutTopologyResult>({ loading: Boolean(target) });

  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return undefined;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { cluster, namespace, rolloutName } = target;

    async function tick() {
      const get = <T,>(path: string) => k8sProxyGet<T>(discoveryApi, fetchApi, cluster, path);
      try {
        const [rollout, rss, pods, svcs, ars, jobs] = await Promise.all([
          get<K8sObj>(`/apis/argoproj.io/v1alpha1/namespaces/${namespace}/rollouts/${rolloutName}`),
          get<{ items: K8sObj[] }>(`/apis/apps/v1/namespaces/${namespace}/replicasets`),
          get<{ items: K8sObj[] }>(`/api/v1/namespaces/${namespace}/pods`),
          get<{ items: K8sObj[] }>(`/api/v1/namespaces/${namespace}/services`).catch(() => ({ items: [] as K8sObj[] })),
          get<{ items: K8sObj[] }>(`/apis/argoproj.io/v1alpha1/namespaces/${namespace}/analysisruns`).catch(() => ({ items: [] as K8sObj[] })),
          get<{ items: K8sObj[] }>(`/apis/batch/v1/namespaces/${namespace}/jobs`).catch(() => ({ items: [] as K8sObj[] })),
        ]);
        if (cancelled) return;
        setState({ loading: false, topology: buildTopology(rollout, rss.items, pods.items, svcs.items, ars.items, jobs.items) });
      } catch (e) {
        if (!cancelled) setState(prev => ({ loading: false, topology: prev.topology, error: String(e) }));
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    }
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [target?.cluster, target?.namespace, target?.rolloutName, discoveryApi, fetchApi]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
