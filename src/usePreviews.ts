import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';

// The app's preview environments, one per PR labelled `preview`, from glidepath-api (GET /v1/apps/{app}/previews,
// API 0.10.0) through the backend's /previews route. Read only: a preview starts and ends with its PR's label.

export interface Preview {
  pr: number;
  prUrl?: string;
  application: string;
  namespace: string;
  image?: string;
  headSha?: string;
  /** Argo CD's sync (Synced, OutOfSync, Unknown) and health (Healthy, Progressing, Degraded, Missing, ...). */
  sync: string;
  health: string;
  healthSince?: string;
  createdAt: string;
  service?: string;
  port?: number;
  portForward?: string;
}

export interface PreviewsState {
  loading: boolean;
  error?: string;
  previews: Preview[];
}

export function usePreviews(appName: string | undefined, refreshNonce = 0): PreviewsState {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<PreviewsState>({ loading: Boolean(appName), previews: [] });

  useEffect(() => {
    if (!appName) {
      setState({ loading: false, previews: [] });
      return undefined;
    }
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: undefined }));
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('glidepath');
        const res = await fetchApi.fetch(`${baseUrl}/previews?app=${encodeURIComponent(appName)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => undefined);
          throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
        }
        const body = (await res.json()) as { previews?: Preview[] };
        if (!cancelled) setState({ loading: false, previews: body.previews ?? [] });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e instanceof Error ? e.message : String(e), previews: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appName, refreshNonce, discoveryApi, fetchApi]);

  return state;
}
