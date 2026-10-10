import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';

// An environment's workload model (2026-10-10, airframe rollout.enabled). Two facts that used to share `rollout: null`:
//   shape   - does this environment run a service at all? rollout.enabled in the human values (default: yes).
//   release - has an image been released here? The release file (Glidepath writes it).
// The Deployment switch edits the shape; WorkloadStatus shows the release next to what is actually running.

export type WorkloadShape = 'service' | 'none';

/** The backend's view (backstage glidepathWorkload.ts): the layered shape and the image the release file asks for. */
export interface WorkloadView {
  shape: WorkloadShape;
  shapeFrom: 'env' | 'shared' | 'default';
  inherited: WorkloadShape;
  legacyNull: boolean;
  release: { repository: string; tag: string } | null;
}

/**
 * Whether one values file turns the workload on. `rollout: null` (older files) and `rollout.enabled: false` are off;
 * an explicit `enabled: true` is on; a file that says nothing gets what it inherits (the shared values, else the
 * chart default, a service).
 */
export function workloadOn(rollout: unknown, inherited: WorkloadShape = 'service'): boolean {
  if (rollout === null) return false;
  if (rollout && typeof rollout === 'object' && typeof (rollout as Record<string, unknown>).enabled === 'boolean') {
    return (rollout as Record<string, unknown>).enabled as boolean;
  }
  return inherited === 'service';
}

export function useWorkloadView(target: { owner: string; appName: string; env: string; tier: 'ground' | 'flight'; cluster?: string } | undefined, refreshKey?: unknown) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ data?: WorkloadView; error?: string }>({});
  const key = target ? `${target.owner}/${target.appName}/${target.env}/${target.tier}/${target.cluster ?? ''}` : '';
  useEffect(() => {
    if (!target) return undefined;
    let live = true;
    (async () => {
      try {
        const base = await discoveryApi.getBaseUrl('glidepath');
        const q = new URLSearchParams({ owner: target.owner, appName: target.appName, env: target.env, tier: target.tier, ...(target.cluster ? { cluster: target.cluster } : {}) });
        const res = await fetchApi.fetch(`${base}/environment/workload?${q}`);
        const body = await res.json().catch(() => undefined);
        if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
        if (live) setState({ data: body as WorkloadView });
      } catch (e) {
        if (live) setState({ error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoveryApi, fetchApi, key, refreshKey]);
  return state;
}

export interface LiveWorkload {
  deployed: boolean;
  image?: string;
  health?: string;
}

export type WorkloadStatusKind = 'not-deployed' | 'deployed' | 'no-workload' | 'misconfigured';

/** The status Tower shows beside the Deployment switch. Pure, so the four cases are testable. */
export function workloadStatus(view: WorkloadView): { kind: WorkloadStatusKind; text: string } {
  const tag = view.release?.tag;
  const where = view.shapeFrom === 'shared' ? ' in the shared values' : '';
  const setting = view.legacyNull ? 'rollout: null' : 'rollout.enabled: false';
  if (view.shape === 'none' && tag) {
    return { kind: 'misconfigured', text: `Misconfigured: the release file asks for ${tag}, but ${setting}${where} says this environment runs no workload. Turn Deployment on, or remove the release.` };
  }
  if (view.shape === 'none') return { kind: 'no-workload', text: `No workload: Jobs, CronJobs and components only (${setting}${where}). Releases to it are refused.` };
  if (!tag) return { kind: 'not-deployed', text: 'Not deployed yet: no release has gone to this environment. A Rollout appears with its first release.' };
  return { kind: 'deployed', text: `Released: ${tag}` };
}
