import { useArchivedRuns } from './pipelineHistoryApi.esm.js';

const RESULTS_RETENTION_HOURS = 720;
const DEFAULT_LIMIT = 500;
function useTektonResultsRuns(appName, refreshNonce = 0, sinceHours = RESULTS_RETENTION_HOURS, limit = DEFAULT_LIMIT) {
  return useArchivedRuns(appName, sinceHours, limit, refreshNonce);
}

export { RESULTS_RETENTION_HOURS, useTektonResultsRuns };
//# sourceMappingURL=useTektonResultsRuns.esm.js.map
