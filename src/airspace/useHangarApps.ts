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

/** Tower's services, as the fleet views need them: name, GitHub owner, catalog ref. */
export function useHangarApps(): { loading: boolean; error?: string; apps: HangarApp[] } {
  const catalogApi = useApi(catalogApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; apps: HangarApp[] }>({ loading: true, apps: [] });
  useEffect(() => {
    let cancelled = false;
    catalogApi
      .getEntities({ filter: { kind: 'Component' } })
      .then(res => {
        if (!cancelled) setState({ loading: false, apps: res.items.filter(isTowerService).map(hangarAppOf) });
      })
      .catch(e => {
        if (!cancelled) setState({ loading: false, error: String(e), apps: [] });
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
