import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { fetchReissuable, type ReissuableRelease } from './reissue';

/**
 * The app's releases whose PR was closed without merging, each with whether a reissue is accepted now, and whether this
 * person may reissue. Read once per `nonce` (the pages' own refresh). An unreadable answer is no candidates, never an error
 * banner: the action simply is not offered.
 */
export function useReissuable(appName: string | undefined, owner: string | undefined, nonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ releases: ReissuableRelease[]; allowed: boolean; error?: string }>({ releases: [], allowed: false });
  useEffect(() => {
    if (!appName) return undefined;
    let live = true;
    fetchReissuable(discoveryApi, fetchApi, appName, owner)
      .then(r => live && setState({ releases: r.releases, allowed: r.allowed }))
      .catch(e => live && setState({ releases: [], allowed: false, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
  }, [discoveryApi, fetchApi, appName, owner, nonce]);
  return state;
}
