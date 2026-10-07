import { useState, useEffect, useCallback } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';

function rollbackCandidate(state) {
  const current = state?.current;
  if (!current) return void 0;
  return state.history.slice(1).find((h) => h.pin && (h.pin.digest !== current.digest || h.pin.tag !== current.tag));
}
function promoteCandidates(deploys, fromEnv) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const d of deploys) {
    if (!d.imageRef || !d.imageTag || seen.has(d.imageRef)) continue;
    seen.add(d.imageRef);
    const ok = d.phase === "succeeded";
    const fromPrev = Boolean(fromEnv && d.env === fromEnv);
    const where = d.env ? `${d.env}, ${ok ? "deployed" : `deploy ${d.phase}`}` : ok ? "deployed" : `deploy ${d.phase}`;
    out.push({
      image: d.imageRef,
      tag: d.imageTag,
      label: `${d.imageTag} (${where})`,
      rank: fromPrev && ok ? 0 : ok ? 1 : 2,
      at: Date.parse(d.completionTime ?? d.startTime ?? "") || 0
    });
  }
  return out.sort((a, b) => a.rank - b.rank || b.at - a.at).map(({ image, tag, label }) => ({ image, tag, label }));
}
function usePinState(target, nonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({ loading: Boolean(target) });
  const key = target ? `${target.owner}/${target.appName}/${target.env}` : "";
  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return void 0;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      try {
        const base = await discoveryApi.getBaseUrl("glidepath");
        const res = await fetchApi.fetch(`${base}/pin?${new URLSearchParams(target).toString()}`);
        const body = await res.json().catch(() => void 0);
        if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
        if (!cancelled) setState({ loading: false, data: body });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, nonce, discoveryApi, fetchApi]);
  return state;
}
function useSubmitPin() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({ loading: false });
  const submit = useCallback(
    async (body) => {
      setState({ loading: true });
      try {
        const base = await discoveryApi.getBaseUrl("glidepath");
        const res = await fetchApi.fetch(`${base}/pin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const json = await res.json().catch(() => void 0);
        if (!res.ok) throw new Error(json?.error ?? `request failed with ${res.status}`);
        setState({ loading: false, result: json });
        return json;
      } catch (e) {
        setState({ loading: false, error: String(e) });
        return void 0;
      }
    },
    [discoveryApi, fetchApi]
  );
  const reset = useCallback(() => setState({ loading: false }), []);
  return { ...state, submit, reset };
}

export { promoteCandidates, rollbackCandidate, usePinState, useSubmitPin };
//# sourceMappingURL=releasePins.esm.js.map
