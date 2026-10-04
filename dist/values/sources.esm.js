import { useState } from 'react';
import { useAppConfig, useSubmitConfigChange, usePlatformFile, useSubmitPlatformFileChange } from '../useConfigData.esm.js';

function useFlightValuesSource(target) {
  const [nonce, setNonce] = useState(0);
  const cfg = useAppConfig(target, nonce);
  const sub = useSubmitConfigChange();
  return {
    loading: cfg.loading,
    error: cfg.error,
    data: cfg.data,
    refresh: () => setNonce((n) => n + 1),
    submit: (patch, summary) => sub.submit({ ...target, patch, summary }),
    submitting: sub.loading,
    result: sub.result,
    submitError: sub.error,
    resetSubmit: sub.reset
  };
}
function useGroundValuesSource(target) {
  const [nonce, setNonce] = useState(0);
  const selector = { kind: "env", env: target.env };
  const file = usePlatformFile({ owner: target.owner, appName: target.appName, selector }, nonce);
  const sub = useSubmitPlatformFileChange();
  return {
    loading: file.loading,
    error: file.error,
    data: file.data,
    refresh: () => setNonce((n) => n + 1),
    submit: (patch, summary) => sub.submit({ owner: target.owner, appName: target.appName, selector, patch, summary }),
    submitting: sub.loading,
    result: sub.result,
    submitError: sub.error,
    resetSubmit: sub.reset
  };
}

export { useFlightValuesSource, useGroundValuesSource };
//# sourceMappingURL=sources.esm.js.map
