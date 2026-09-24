import { useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { k8sProxyPatch } from '../k8sProxy';
import type { PipelineRunSummary } from './types';

// Tower's Tekton "Cancel" action (HANDOFF-tower-write-actions.md Tier 1,
// 2026-09-15) - backed by the `patch` verb added to the same
// `backstage-tekton-rerun` ClusterRole "Re-run" already uses (see
// useRerunPipelineRun.ts and gitops-cluster-dev's backstage-ingestor-rbac/
// rbac.yaml for the RBAC/credential reasoning).
const TEKTON_CLUSTER = 'kind-dev';

// CancelledRunFinally, not the bare "Cancelled" Tekton also accepts:
// Cancelled skips the pipeline's `finally` block entirely, which on this
// platform's own pipelines is where notify-backstage.yaml/notify-slack.yaml
// live - a cancel that skipped finally would cancel silently, with no
// notification at all telling anyone it happened. CancelledRunFinally still
// tears down running TaskRuns/Pods immediately (no retries executed), it
// just lets `finally` run afterward, same as a real failure would.
const CANCEL_STATUS = 'CancelledRunFinally';

export interface UseCancelPipelineRunResult {
  cancel: (run: PipelineRunSummary) => Promise<void>;
  pending: string | undefined;
  error: string | undefined;
}

// `pending` names the run currently being cancelled, same per-row-not-
// whole-list convention as useRerunPipelineRun's own `pending`.
export function useCancelPipelineRun(onDone?: () => void): UseCancelPipelineRunResult {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [pending, setPending] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const cancel = async (run: PipelineRunSummary) => {
    setPending(run.name);
    setError(undefined);
    try {
      await k8sProxyPatch(
        discoveryApi,
        fetchApi,
        TEKTON_CLUSTER,
        `/apis/tekton.dev/v1/namespaces/${run.namespace}/pipelineruns/${run.name}`,
        { spec: { status: CANCEL_STATUS } },
      );
      onDone?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(undefined);
    }
  };

  return { cancel, pending, error };
}
