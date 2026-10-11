import { useState } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { pipelineRunAction } from './pipelineRunAction.esm.js';

function useCancelPipelineRun(onDone) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [pending, setPending] = useState(void 0);
  const [error, setError] = useState(void 0);
  const cancel = async (run) => {
    setPending(run.name);
    setError(void 0);
    try {
      await pipelineRunAction(discoveryApi, fetchApi, "cancel", run);
      onDone?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(void 0);
    }
  };
  return { cancel, pending, error };
}

export { useCancelPipelineRun };
//# sourceMappingURL=useCancelPipelineRun.esm.js.map
