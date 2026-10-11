import { useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { pipelineRunAction } from './pipelineRunAction';
import type { PipelineRunSummary } from './types';

// Tower's Tekton "Cancel" action: the backend (pipelineRunAction.ts) checks that this user owns the app, then sets
// the run's spec.status to CancelledRunFinally - not bare Cancelled, which would skip the pipeline's `finally`
// (notify-backstage, notify-slack), so a cancel is announced like a failure.

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
      await pipelineRunAction(discoveryApi, fetchApi, 'cancel', run);
      onDone?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(undefined);
    }
  };

  return { cancel, pending, error };
}
