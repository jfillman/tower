import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { readEnvironments, type Deploy } from '../environments/stagedChanges';
import { useTowerEnvironments } from '../useTowerEnvironments';
import type { SettingFile } from './settingIndex';

// Reads every file "Find a setting" searches, once, the first time someone types in it (never on tab open: these
// are GitHub reads, see usePullRequests on the rate-limit incident). The same backend routes the Configure sub-tabs
// read: cicd.yaml, the Ground and preview shared values, each Ground environment's values file, and each Flight
// environment's values and its cluster's shared values. A file that fails is skipped and counted, not fatal.

type Fetch = (path: string, params: Record<string, string>) => Promise<{ values?: unknown; path?: string } | undefined>;

export function useSettingFiles(enabled: boolean) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const { entity } = useEntity();
  const { environments } = useTowerEnvironments();
  const slug = entity.metadata.annotations?.['github.com/project-slug'];
  const [owner, appName] = slug ? slug.split('/') : [undefined, undefined];
  const [state, setState] = useState<{ loading: boolean; files: SettingFile[]; failed: number; started: boolean }>({
    loading: false,
    files: [],
    failed: 0,
    started: false,
  });

  useEffect(() => {
    if (!enabled || state.started || !owner || !appName) return undefined;
    let cancelled = false;
    setState(s => ({ ...s, loading: true, started: true }));
    (async () => {
      const baseUrl = await discoveryApi.getBaseUrl('glidepath');
      let failed = 0;
      const get: Fetch = async (path, params) => {
        try {
          const res = await fetchApi.fetch(`${baseUrl}${path}?${new URLSearchParams({ owner, appName, ...params })}`);
          // A file that does not exist (no preview values, an environment with no file yet) is not a failure.
          if (res.status === 404) return undefined;
          if (!res.ok) throw new Error(String(res.status));
          return (await res.json()) as { values?: unknown; path?: string };
        } catch {
          failed++;
          return undefined;
        }
      };
      const files: SettingFile[] = [];
      const add = (subtab: SettingFile['subtab'], label: string, data: { values?: unknown; path?: string } | undefined, env?: string) => {
        if (data?.values) files.push({ subtab, label, env, path: data.path ?? '', values: data.values });
      };

      const [cicd, base, prEnv, groundEnvs] = await Promise.all([
        get('/config/cicd', {}),
        get('/config/platform-env', { file: 'base' }),
        get('/config/platform-env', {}),
        get('/config/platform-envs', {}),
      ]);
      add('glidepath', 'cicd.yaml', cicd);
      add('config', 'Ground shared values', base);
      add('config', 'Preview shared values', prEnv);

      const ground = ((groundEnvs as { envs?: string[] } | undefined)?.envs ?? []).slice(0, 12);
      const flight = readEnvironments((cicd?.values as { deploy?: Deploy } | undefined)?.deploy)
        .envs.filter(e => e.tier === 'flight')
        .map(e => ({ name: e.name, cluster: e.cluster ?? environments.find(x => x.env === e.name)?.cluster }))
        .filter((e): e is { name: string; cluster: string } => Boolean(e.cluster))
        .slice(0, 8);
      const clusters = [...new Set(flight.map(e => e.cluster))];

      const [groundFiles, flightFiles, flightBases] = await Promise.all([
        Promise.all(ground.map(env => get('/config/platform-env', { env }))),
        Promise.all(flight.map(e => get('/config', { cluster: e.cluster, env: e.name }))),
        Promise.all(clusters.map(cluster => get('/config/flight-base', { cluster }))),
      ]);
      ground.forEach((env, i) => add('environments', `${env} values`, groundFiles[i], env));
      flight.forEach((e, i) => add('environments', `${e.name} values`, flightFiles[i], e.name));
      clusters.forEach((cluster, i) =>
        add('config', clusters.length > 1 ? `Flight shared values (${cluster})` : 'Flight shared values', flightBases[i]),
      );
      if (!cancelled) setState(s => ({ ...s, loading: false, files, failed }));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, owner, appName]);

  return { ...state, available: Boolean(owner && appName) };
}
