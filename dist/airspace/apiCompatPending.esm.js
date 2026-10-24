import { useMemo, useCallback } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { usePolled } from '../fleet/usePolled.esm.js';
import { apiCompatOf } from './apiCompat.esm.js';

const POLL_MS = 5 * 6e4;
function prRefOf(url) {
  const m = url ? /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(url) : null;
  return m ? { owner: m[1], repo: m[2], number: Number(m[3]) } : void 0;
}
function waitingReleases(records) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const r of records) {
    const pr = r.state === "proposed" ? prRefOf(r.prUrl) : void 0;
    if (!pr || seen.has(r.prUrl)) continue;
    seen.add(r.prUrl);
    out.push({ ...r, pr });
  }
  return out;
}
function pendingApiCompat(waiting, prsByApp) {
  const out = [];
  for (const r of waiting) {
    const pr = prsByApp.get(r.appName)?.find((p) => p.repo === "gitops" && p.number === r.pr.number && p.state === "open");
    const state = apiCompatOf(pr?.ci?.checks);
    if (!pr || !state) continue;
    out.push({
      app: r.appName,
      env: r.env,
      cluster: r.cluster,
      prUrl: r.prUrl,
      prNumber: r.pr.number,
      conclusion: state.check.status === "completed" ? state.check.conclusion : void 0,
      report: state.report
    });
  }
  return out;
}
function useApiCompatPending(records) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const waiting = useMemo(() => waitingReleases(records ?? []), [records]);
  const key = waiting.map((w) => w.prUrl).sort().join("|");
  const fetcher = useCallback(async () => {
    if (waiting.length === 0) return [];
    const baseUrl = await discoveryApi.getBaseUrl("pull-requests");
    const apps = /* @__PURE__ */ new Map();
    for (const w of waiting) apps.set(w.appName, w.pr);
    const prsByApp = /* @__PURE__ */ new Map();
    await Promise.all(
      [...apps].map(async ([appName, pr]) => {
        const params = new URLSearchParams({ owner: pr.owner, appName });
        if (pr.repo.startsWith("gitops-infra-")) params.set("appType", "infra");
        const res = await fetchApi.fetch(`${baseUrl}/pull-requests?${params.toString()}`);
        if (res.ok) prsByApp.set(appName, await res.json());
      })
    );
    return pendingApiCompat(waiting, prsByApp);
  }, [key, discoveryApi, fetchApi]);
  return usePolled(`api-compat:${key}`, fetcher, POLL_MS);
}

export { pendingApiCompat, prRefOf, useApiCompatPending, waitingReleases };
//# sourceMappingURL=apiCompatPending.esm.js.map
