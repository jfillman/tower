import { useState } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { pipelineRunAction } from './pipelineRunAction.esm.js';

function useRerunPipelineRun(onDone) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [pending, setPending] = useState(void 0);
  const [error, setError] = useState(void 0);
  const rerun = async (run) => {
    setPending(run.name);
    setError(void 0);
    try {
      await pipelineRunAction(discoveryApi, fetchApi, "rerun", run);
      onDone?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(void 0);
    }
  };
  return { rerun, pending, error };
}

export { useRerunPipelineRun };
//# sourceMappingURL=useRerunPipelineRun.esm.js.map
