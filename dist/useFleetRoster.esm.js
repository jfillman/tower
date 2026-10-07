import { useState, useEffect } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { isKubernetesAvailable } from '@backstage/plugin-kubernetes';
import { isAppTierEntity } from './workloadType.esm.js';
import { isTowerService } from './serviceClass.esm.js';

function useFleetRoster(scope = "apps") {
  const catalogApi = useApi(catalogApiRef);
  const [entities, setEntities] = useState(void 0);
  const [error, setError] = useState(void 0);
  useEffect(() => {
    let cancelled = false;
    catalogApi.getEntities({ filter: { kind: "Component" } }).then((res) => {
      if (!cancelled)
        setEntities(
          scope === "apps" ? res.items.filter(isKubernetesAvailable).filter(isAppTierEntity) : res.items.filter(isTowerService)
        );
    }).catch((e) => {
      if (!cancelled) setError(String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [catalogApi, scope]);
  return { entities: entities ?? [], loading: entities === void 0, error };
}

export { useFleetRoster };
//# sourceMappingURL=useFleetRoster.esm.js.map
