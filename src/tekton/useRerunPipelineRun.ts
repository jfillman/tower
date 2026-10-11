import { useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { pipelineRunAction } from './pipelineRunAction';
import type { PipelineRunSummary } from './types';

// Tower's Tekton "Re-run" action: a new PipelineRun with the original's spec, built and created by the backend
// (pipelineRunAction.ts) after it checks that this user owns the app.

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
      await pipelineRunAction(discoveryApi, fetchApi, 'rerun', run);
      onDone?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(undefined);
    }
  };

  return { rerun, pending, error };
}
