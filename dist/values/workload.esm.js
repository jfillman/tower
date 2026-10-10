import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';

function workloadOn(rollout, inherited = "service") {
  if (rollout === null) return false;
  if (rollout && typeof rollout === "object" && typeof rollout.enabled === "boolean") {
    return rollout.enabled;
  }
  return inherited === "service";
}
function useWorkloadView(target, refreshKey) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({});
  const key = target ? `${target.owner}/${target.appName}/${target.env}/${target.tier}/${target.cluster ?? ""}` : "";
  useEffect(() => {
    if (!target) return void 0;
    let live = true;
    (async () => {
      try {
        const base = await discoveryApi.getBaseUrl("glidepath");
        const q = new URLSearchParams({ owner: target.owner, appName: target.appName, env: target.env, tier: target.tier, ...target.cluster ? { cluster: target.cluster } : {} });
        const res = await fetchApi.fetch(`${base}/environment/workload?${q}`);
        const body = await res.json().catch(() => void 0);
        if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
        if (live) setState({ data: body });
      } catch (e) {
        if (live) setState({ error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      live = false;
    };
  }, [discoveryApi, fetchApi, key, refreshKey]);
  return state;
}
function workloadStatus(view) {
  const tag = view.release?.tag;
  const where = view.shapeFrom === "shared" ? " in the shared values" : "";
  const setting = view.legacyNull ? "rollout: null" : "rollout.enabled: false";
  if (view.shape === "none" && tag) {
    return { kind: "misconfigured", text: `Misconfigured: the release file asks for ${tag}, but ${setting}${where} says this environment runs no workload. Turn Deployment on, or remove the release.` };
  }
  if (view.shape === "none") return { kind: "no-workload", text: `No workload: Jobs, CronJobs and components only (${setting}${where}). Releases to it are refused.` };
  if (!tag) return { kind: "not-deployed", text: "Not deployed yet: no release has gone to this environment. A Rollout appears with its first release." };
  return { kind: "deployed", text: `Released: ${tag}` };
}

export { useWorkloadView, workloadOn, workloadStatus };
//# sourceMappingURL=workload.esm.js.map
