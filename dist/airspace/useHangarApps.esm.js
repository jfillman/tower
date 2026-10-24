import { useState, useEffect } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { isTowerService } from '../serviceClass.esm.js';
import { contractOf, byKindThenTitle } from './contracts.esm.js';

function hangarAppOf(e) {
  const slug = e.metadata.annotations?.["github.com/project-slug"];
  const [owner, repo] = slug ? slug.split("/") : [];
  return { app: repo ?? e.metadata.name, owner, ref: stringifyEntityRef(e) };
}
function useHangarApps() {
  const catalogApi = useApi(catalogApiRef);
  const [state, setState] = useState({
    loading: true,
    apps: [],
    entities: []
  });
  useEffect(() => {
    let cancelled = false;
    catalogApi.getEntities({ filter: { kind: "Component" } }).then((res) => {
      const entities = res.items.filter(isTowerService);
      if (!cancelled) setState({ loading: false, apps: entities.map(hangarAppOf), entities });
    }).catch((e) => {
      if (!cancelled) setState({ loading: false, error: String(e), apps: [], entities: [] });
    });
    return () => {
      cancelled = true;
    };
  }, [catalogApi]);
  return state;
}
function useApiContracts(nonce = 0) {
  const catalogApi = useApi(catalogApiRef);
  const [state, setState] = useState({ loading: true, contracts: [] });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    catalogApi.getEntities({ filter: { kind: "API" } }).then((res) => {
      if (!cancelled) setState({ loading: false, contracts: res.items.map(contractOf).sort(byKindThenTitle) });
    }).catch((e) => {
      if (!cancelled) setState({ loading: false, error: String(e), contracts: [] });
    });
    return () => {
      cancelled = true;
    };
  }, [catalogApi, nonce]);
  return state;
}

export { hangarAppOf, useApiContracts, useHangarApps };
//# sourceMappingURL=useHangarApps.esm.js.map
