import { useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef, type Entity } from '@backstage/catalog-model';
import { isTowerService } from '../serviceClass';
import { byKindThenTitle, contractOf, type ApiContract } from './contracts';

export interface HangarApp {
  /** The app name: the repo of github.com/project-slug, else the entity name (as Tower's app shell names it). */
  app: string;
  owner?: string;
  ref: string;
}

export function hangarAppOf(e: Entity): HangarApp {
  const slug = e.metadata.annotations?.['github.com/project-slug'];
  const [owner, repo] = slug ? slug.split('/') : [];
  return { app: repo ?? e.metadata.name, owner, ref: stringifyEntityRef(e) };
}

/** Tower's services, as the fleet views need them: name, GitHub owner, catalog ref (and the entities themselves). */
export function useHangarApps(): { loading: boolean; error?: string; apps: HangarApp[]; entities: Entity[] } {
  const catalogApi = useApi(catalogApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; apps: HangarApp[]; entities: Entity[] }>({
    loading: true,
    apps: [],
    entities: [],
  });
  useEffect(() => {
    let cancelled = false;
    catalogApi
      .getEntities({ filter: { kind: 'Component' } })
      .then(res => {
        const entities = res.items.filter(isTowerService);
        if (!cancelled) setState({ loading: false, apps: entities.map(hangarAppOf), entities });
      })
      .catch(e => {
        if (!cancelled) setState({ loading: false, error: String(e), apps: [], entities: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [catalogApi]);
  return state;
}

/** The catalog's API entities as contracts. */
export function useApiContracts(nonce = 0): { loading: boolean; error?: string; contracts: ApiContract[] } {
  const catalogApi = useApi(catalogApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; contracts: ApiContract[] }>({ loading: true, contracts: [] });
  useEffect(() => {
    let cancelled = false;
    setState(s => ({ ...s, loading: true }));
    catalogApi
      .getEntities({ filter: { kind: 'API' } })
      .then(res => {
        if (!cancelled) setState({ loading: false, contracts: res.items.map(contractOf).sort(byKindThenTitle) });
      })
      .catch(e => {
        if (!cancelled) setState({ loading: false, error: String(e), contracts: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [catalogApi, nonce]);
  return state;
}
