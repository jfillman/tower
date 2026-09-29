import { useState } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { k8sProxyPost } from '../k8sProxy.esm.js';

const TEKTON_CLUSTER = "kind-dev";
const KEPT_LABEL_KEYS = ["hangar.io/app", "hangar.io/flow", "platform.io/app", "platform.io/flow"];
function buildRerunBody(run) {
  const raw = run.raw;
  const labels = Object.fromEntries(
    Object.entries(raw.metadata.labels ?? {}).filter(([k]) => KEPT_LABEL_KEYS.includes(k))
  );
  return {
    apiVersion: "tekton.dev/v1",
    kind: "PipelineRun",
    metadata: {
      generateName: `${raw.metadata.name}-rerun-`,
      namespace: raw.metadata.namespace,
      labels
    },
    spec: raw.spec
  };
}
function useRerunPipelineRun(onDone) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [pending, setPending] = useState(void 0);
  const [error, setError] = useState(void 0);
  const rerun = async (run) => {
    setPending(run.name);
    setError(void 0);
    try {
      await k8sProxyPost(
        discoveryApi,
        fetchApi,
        TEKTON_CLUSTER,
        `/apis/tekton.dev/v1/namespaces/${run.namespace}/pipelineruns`,
        buildRerunBody(run)
      );
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
