import { useState } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { k8sProxyPatch } from '../k8sProxy.esm.js';

const TEKTON_CLUSTER = "kind-dev";
const CANCEL_STATUS = "CancelledRunFinally";
function useCancelPipelineRun(onDone) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [pending, setPending] = useState(void 0);
  const [error, setError] = useState(void 0);
  const cancel = async (run) => {
    setPending(run.name);
    setError(void 0);
    try {
      await k8sProxyPatch(
        discoveryApi,
        fetchApi,
        TEKTON_CLUSTER,
        `/apis/tekton.dev/v1/namespaces/${run.namespace}/pipelineruns/${run.name}`,
        { spec: { status: CANCEL_STATUS } }
      );
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
