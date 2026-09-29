import { useState, useEffect } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { isKubernetesAvailable } from '@backstage/plugin-kubernetes';

const APP_TIER_KIND_TAGS = /* @__PURE__ */ new Set([
  "kind:nodejsapplication",
  "kind:springbootapplication",
  "kind:pythonapplication",
  "kind:goapplication"
]);
function isAppTierEntity(entity) {
  return (entity.metadata.tags ?? []).some((t) => APP_TIER_KIND_TAGS.has(t));
}
function useFleetRoster() {
  const catalogApi = useApi(catalogApiRef);
  const [entities, setEntities] = useState(void 0);
  const [error, setError] = useState(void 0);
  useEffect(() => {
    let cancelled = false;
    catalogApi.getEntities({ filter: { kind: "Component" } }).then((res) => {
      if (!cancelled) setEntities(res.items.filter(isKubernetesAvailable).filter(isAppTierEntity));
    }).catch((e) => {
      if (!cancelled) setError(String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [catalogApi]);
  return { entities: entities ?? [], loading: entities === void 0, error };
}

export { useFleetRoster };
//# sourceMappingURL=useFleetRoster.esm.js.map
