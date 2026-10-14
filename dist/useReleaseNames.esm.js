import { useState, useEffect, useMemo } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { assignReleaseNames, releaseNameFor } from './releaseNames.esm.js';

function useReleaseNames(target, records) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [index, setIndex] = useState(void 0);
  const key = target ? `${target.owner}/${target.appName}` : "";
  useEffect(() => {
    setIndex(void 0);
    if (!target) return void 0;
    let cancelled = false;
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl("glidepath");
        const params = new URLSearchParams(target);
        const res = await fetchApi.fetch(`${baseUrl}/release-records?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setIndex(data);
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, discoveryApi, fetchApi]);
  return useMemo(() => index ? namesFromHistory(index, records) : void 0, [index, records]);
}
function namesFromHistory(index, records) {
  const committed = new Set(index.map((e) => e.imageTag));
  const createdAtOf = new Map(records.map((r) => [r.imageTag, new Date(r.createdAt).getTime()]));
  const newestCommitted = Math.max(
    Number.NEGATIVE_INFINITY,
    ...index.map((e) => createdAtOf.get(e.imageTag) ?? new Date(e.generatedAt).getTime())
  );
  const pending = records.filter((r) => !committed.has(r.imageTag) && new Date(r.createdAt).getTime() > newestCommitted);
  const byTag = assignReleaseNames([
    ...index.map((e) => ({ imageTag: e.imageTag, at: e.generatedAt })),
    ...pending.map((r) => ({ imageTag: r.imageTag, at: r.createdAt }))
  ]);
  return { byTag, next: releaseNameFor(byTag.size), index };
}

export { namesFromHistory, useReleaseNames };
//# sourceMappingURL=useReleaseNames.esm.js.map
