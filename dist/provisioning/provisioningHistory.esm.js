import { useState, useRef, useCallback, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';

const MIN_SAMPLES = 3;
function typicalFor(typical, kind) {
  if (!typical) return void 0;
  const out = {};
  const ids = /* @__PURE__ */ new Set([...Object.keys(typical.all), ...Object.keys(typical.byKind[kind] ?? {})]);
  ids.forEach((id) => {
    const own = typical.byKind[kind]?.[id];
    const any = typical.all[id];
    if (own && own.samples >= MIN_SAMPLES) out[id] = own.median;
    else if (any && any.samples >= MIN_SAMPLES) out[id] = any.median;
  });
  return Object.keys(out).length > 0 ? out : void 0;
}
function toRunRecord(item) {
  const { derived, inputs } = item;
  if (!derived.complete || derived.completedAt === void 0) return void 0;
  const steps = derived.steps.filter((s) => s.seconds !== void 0).map((s) => ({ id: s.id, seconds: s.seconds }));
  if (steps.length < 5) return void 0;
  const starts = derived.steps.map((s) => s.startedAt).filter((t) => t !== void 0);
  const startedAt = Math.min(inputs.xr.createdAt, ...starts);
  if (derived.completedAt < startedAt) return void 0;
  return {
    service: inputs.xr.name,
    kind: inputs.xr.kind,
    startedAt,
    completedAt: derived.completedAt,
    totalSeconds: Math.round((derived.completedAt - startedAt) / 1e3),
    steps
  };
}
const HISTORY_POLL_MS = 6e4;
const RETRY_MS = 6e4;
function useProvisioningHistory() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [runs, setRuns] = useState([]);
  const [typical, setTypical] = useState(void 0);
  const recorded = useRef(/* @__PURE__ */ new Map());
  const load = useCallback(async () => {
    try {
      const base = await discoveryApi.getBaseUrl("provisioning-history");
      const [r, t] = await Promise.all([fetchApi.fetch(`${base}/runs?limit=10`), fetchApi.fetch(`${base}/typical`)]);
      if (r.ok) setRuns((await r.json()).runs ?? []);
      if (t.ok) setTypical(await t.json());
    } catch {
    }
  }, [discoveryApi, fetchApi]);
  useEffect(() => {
    load();
    const id = setInterval(load, HISTORY_POLL_MS);
    return () => clearInterval(id);
  }, [load]);
  const record = useCallback(
    async (item) => {
      const run = toRunRecord(item);
      if (!run) return;
      const key = `${run.service}:${run.startedAt}`;
      if (Date.now() < (recorded.current.get(key) ?? 0)) return;
      recorded.current.set(key, Date.now() + RETRY_MS);
      try {
        const base = await discoveryApi.getBaseUrl("provisioning-history");
        const res = await fetchApi.fetch(`${base}/runs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(run)
        });
        if (!res.ok) throw new Error(String(res.status));
        recorded.current.set(key, Infinity);
        load();
      } catch {
      }
    },
    [discoveryApi, fetchApi, load]
  );
  return { runs, typical, record };
}

export { MIN_SAMPLES, toRunRecord, typicalFor, useProvisioningHistory };
//# sourceMappingURL=provisioningHistory.esm.js.map
