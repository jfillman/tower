import { useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { k8sProxyPost } from '../k8sProxy';
import type { PipelineRunSummary } from './types';

// Tower's Tekton "Re-run" action (HANDOFF-tower-write-actions.md Tier 1) -
// backed by a scoped `create`-only RBAC exception on the existing
// backstage-ingestor identity (gitops-cluster-dev's backstage-ingestor-rbac/
// rbac.yaml, `backstage-tekton-rerun` ClusterRole), same cluster this app's
// CI already only ever runs on (see useTektonPipelineRuns.ts's own
// TEKTON_CLUSTER comment).
const TEKTON_CLUSTER = 'kind-dev';

// A `RunPhase` isn't recoverable by any Tekton verb of its own - there's no
// "restart this PipelineRun" API, only "submit a new one with the same
// spec" (the same thing `tkn pipelinerun start --use-pipelinerun` and the
// Tekton Dashboard's own Rerun button both do under the hood). Cloning
// `spec` wholesale (pipelineRef, params, workspaces, taskRunTemplate,
// timeouts - whatever the original run actually carried) rather than
// reconstructing it field-by-field from PipelineRunSummary's own narrower
// shape, which only surfaces what the CI tab displays.
//
// Labels are NOT copied wholesale, deliberately: `hangar.io/app`+
// `hangar.io/flow` (or the pre-rebrand `platform.io/*` pair - see
// useTektonPipelineRuns.ts's own hangarField comment) are kept so this shows
// up in the CI list at all, but `pipelinesascode.tekton.dev/*` annotations
// and the `triggers.tekton.dev/trigger` label are dropped outright - those
// describe how the ORIGINAL run was triggered (a real GitHub webhook event,
// a specific EventListener trigger), and Pipelines-as-Code's own controller
// watches for exactly those markers to report commit status back to GitHub.
// Carrying them onto a hand-cloned run risks a fabricated status update
// against a commit this rerun didn't actually re-test from source - a
// re-run should read as its own thing, not impersonate the original
// trigger's identity.
interface RawMeta {
  name: string;
  namespace: string;
  generateName?: string;
  labels?: Record<string, string>;
}
interface ClonableRun {
  metadata: RawMeta;
  spec?: Record<string, unknown>;
}

const KEPT_LABEL_KEYS = ['hangar.io/app', 'hangar.io/flow', 'platform.io/app', 'platform.io/flow'];

function buildRerunBody(run: PipelineRunSummary): Record<string, unknown> {
  const raw = run.raw as ClonableRun;
  const labels = Object.fromEntries(
    Object.entries(raw.metadata.labels ?? {}).filter(([k]) => KEPT_LABEL_KEYS.includes(k)),
  );
  return {
    apiVersion: 'tekton.dev/v1',
    kind: 'PipelineRun',
    metadata: {
      generateName: `${raw.metadata.name}-rerun-`,
      namespace: raw.metadata.namespace,
      labels,
    },
    spec: raw.spec,
  };
}

export interface UseRerunPipelineRunResult {
  rerun: (run: PipelineRunSummary) => Promise<void>;
  pending: string | undefined;
  error: string | undefined;
}

// `pending` names the run currently being re-run (not a bare boolean) so a
// list of many rows can each independently show their own button's loading
// state without threading a second per-row prop through.
export function useRerunPipelineRun(onDone?: () => void): UseRerunPipelineRunResult {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [pending, setPending] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const rerun = async (run: PipelineRunSummary) => {
    setPending(run.name);
    setError(undefined);
    try {
      await k8sProxyPost(
        discoveryApi,
        fetchApi,
        TEKTON_CLUSTER,
        `/apis/tekton.dev/v1/namespaces/${run.namespace}/pipelineruns`,
        buildRerunBody(run),
      );
      onDone?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(undefined);
    }
  };

  return { rerun, pending, error };
}
