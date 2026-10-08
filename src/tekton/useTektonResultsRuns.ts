import { useArchivedRuns, type UseArchivedRunsResult } from './pipelineHistoryApi';

// Archived runs (Tekton Results) for the views that merge them with live ones: the Release Record's "What was built",
// cloud deployments and flow-slug borrowing. Tekton deletes a finished run from the cluster about an hour after it
// completes, so a release older than that only has its build data here.
//
// 2026-10-08: this used to page every PipelineRun and TaskRun record of the app's namespace through the Kubernetes
// proxy in the browser (~1,300 records, 32 MB for boarding-api), which delayed "What was built" by 10+ seconds. It
// now asks the Backstage backend, which trims and caches each run (see pipelineHistoryApi.ts).

export type UseTektonResultsRunsResult = UseArchivedRunsResult;

/** Results keeps 30 days (glidepath docs/admin/tekton-results.md). */
export const RESULTS_RETENTION_HOURS = 720;
const DEFAULT_LIMIT = 500;

export function useTektonResultsRuns(
  appName: string | undefined,
  refreshNonce = 0,
  sinceHours = RESULTS_RETENTION_HOURS,
  limit = DEFAULT_LIMIT,
): UseTektonResultsRunsResult {
  return useArchivedRuns(appName, sinceHours, limit, refreshNonce);
}
