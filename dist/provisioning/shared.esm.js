import { useState, useEffect } from 'react';
import { deriveProvisioning } from './deriveProvisioning.esm.js';

const fmtDuration = (sec) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
function useNow(intervalMs = 1e3) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
const toItems = (inputs, now, typicalByKind) => inputs.map((i) => ({ inputs: i, derived: deriveProvisioning(i, now, typicalByKind?.(i.xr.kind)) }));
const stateLabel = {
  done: "done",
  run: "in progress",
  pend: "waiting",
  fail: "failed"
};

export { fmtDuration, stateLabel, toItems, useNow };
//# sourceMappingURL=shared.esm.js.map
