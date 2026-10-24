import { useMemo } from 'react';
import { useProvenanceMap } from '../useReleaseData.esm.js';
import { findApiSpec } from './apiSpec.esm.js';

const envOrder = (a, b) => {
  const rank = (e) => {
    if (/^(dev|test|qa|ci)/.test(e)) return 0;
    if (/^(stag|uat|pre)/.test(e)) return 1;
    return /^prod/.test(e) ? 3 : 2;
  };
  return rank(a.env) - rank(b.env) || a.env.localeCompare(b.env) || a.cluster.localeCompare(b.cluster);
};
function useDeployedSpecs(apps, nonce = 0) {
  const targets = useMemo(
    () => apps.flatMap(
      (a) => a.environments.filter((e) => e.deployed !== false).map((e) => ({ app: a.appName, env: e.env, cluster: e.cluster, image: e.image }))
    ),
    [apps]
  );
  const images = useMemo(() => [...new Set(targets.map((t) => t.image).filter((i) => Boolean(i)))].sort(), [targets]);
  const provenance = useProvenanceMap(images, nonce);
  return useMemo(() => {
    const byApp = /* @__PURE__ */ new Map();
    for (const t of targets) {
      const p = t.image ? provenance[t.image] : void 0;
      const row = {
        ...t,
        loading: Boolean(t.image) && (!p || p.loading),
        error: p?.error,
        digest: p?.data?.digest,
        spec: findApiSpec(p?.data)
      };
      byApp.set(t.app, [...byApp.get(t.app) ?? [], row].sort(envOrder));
    }
    return { byApp, loading: targets.some((t) => t.image && (!provenance[t.image] || provenance[t.image].loading)) };
  }, [targets, provenance]);
}

export { envOrder, useDeployedSpecs };
//# sourceMappingURL=useDeployedSpecs.esm.js.map
