import { relativeTime } from '../shared/format.esm.js';
import { useState, useEffect, useCallback } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';

function rollbackCandidate(state) {
  const current = state?.current;
  if (!current) return void 0;
  return state.history.slice(1).find((h) => h.pin && (h.pin.digest !== current.digest || h.pin.tag !== current.tag));
}
function promoteCandidates(deploys, fromEnv, registry) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const d of deploys) {
    if (!d.imageRef || !d.imageTag || seen.has(d.imageRef)) continue;
    seen.add(d.imageRef);
    const ok = d.phase === "succeeded";
    const fromPrev = Boolean(fromEnv && d.env === fromEnv);
    const status = ok ? "deployed" : `deploy ${d.phase}`;
    const where = d.env ? `${d.env}, ${status}` : status;
    let rank = 2;
    if (ok) rank = fromPrev ? 0 : 1;
    out.push({
      image: d.imageRef,
      tag: d.imageTag,
      label: `${d.imageTag} (${where})`,
      rank,
      at: Date.parse(d.completionTime ?? d.startTime ?? "") || 0
    });
  }
  for (const v of registry?.versions ?? []) {
    const tag = releaseTagOf(v.tags);
    if (!tag) continue;
    const image = `${registry.repository}:${tag}`;
    if (seen.has(image)) continue;
    seen.add(image);
    const at = Date.parse(v.createdAt ?? "") || 0;
    out.push({ image, tag, label: `${tag} (built${v.createdAt ? ` ${relativeTime(new Date(v.createdAt))}` : ""})`, rank: 3, at });
  }
  return out.sort((a, b) => a.rank - b.rank || b.at - a.at).map(({ image, tag, label }) => ({ image, tag, label }));
}
function releaseTagOf(tags) {
  return tags.find((t) => !t.startsWith("sha256-") && !/-(amd64|arm64)$/.test(t) && t !== "latest");
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
function usePinnedTags(owner, appName, envs, nonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [pins, setPins] = useState({});
  const key = owner && appName ? `${owner}/${appName}/${envs.join(",")}` : "";
  useEffect(() => {
    if (!owner || !appName || envs.length === 0) {
      setPins({});
      return void 0;
    }
    let cancelled = false;
    (async () => {
      const base = await discoveryApi.getBaseUrl("glidepath");
      const entries = await Promise.all(
        envs.map(async (env) => {
          try {
            const res = await fetchApi.fetch(`${base}/pin?${new URLSearchParams({ owner, appName, env }).toString()}`);
            if (!res.ok) return [env, void 0];
            return [env, (await res.json()).current?.tag];
          } catch {
            return [env, void 0];
          }
        })
      );
      if (!cancelled) setPins(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [key, nonce, discoveryApi, fetchApi]);
  return pins;
}

export { promoteCandidates, releaseTagOf, rollbackCandidate, usePinState, usePinnedTags, useSubmitPin };
//# sourceMappingURL=releasePins.esm.js.map
