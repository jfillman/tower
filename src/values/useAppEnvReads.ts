import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';

/** The env var names the app's source code reads (the backend's /app/env-reads scan). */
export interface AppEnvReads {
  repo?: string;
  sha?: string;
  reads: Array<{ name: string; files: string[] }>;
  scanned: number;
  truncated: boolean;
}

/**
 * The names the app's code reads, for wiring a component's outputs under them (components.ts matchReadNames).
 * Undefined while loading, when the scan failed, or for an app with no source repo: callers then fall back to the
 * naming profile and `<COMPONENT>_<OUTPUT>`, as before the scan existed.
 */
export function useAppEnvReads(owner: string | undefined, appName: string | undefined): AppEnvReads | undefined {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<AppEnvReads | undefined>();
  useEffect(() => {
    setState(undefined);
    if (!owner || !appName) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const base = await discoveryApi.getBaseUrl('glidepath');
        const res = await fetchApi.fetch(`${base}/app/env-reads?${new URLSearchParams({ owner, appName })}`);
        if (!res.ok) return;
        const body = (await res.json()) as AppEnvReads;
        if (!cancelled && body.repo) setState(body);
      } catch {
        // The scan is a hint: without it the names fall back to the profile.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, appName, discoveryApi, fetchApi]);
  return state;
}
