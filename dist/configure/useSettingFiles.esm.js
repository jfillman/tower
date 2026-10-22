import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { readEnvironments } from '../environments/stagedChanges.esm.js';
import { useTowerEnvironments } from '../useTowerEnvironments.esm.js';

function useSettingFiles(enabled) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const { entity } = useEntity();
  const { environments } = useTowerEnvironments();
  const slug = entity.metadata.annotations?.["github.com/project-slug"];
  const [owner, appName] = slug ? slug.split("/") : [void 0, void 0];
  const [state, setState] = useState({
    loading: false,
    files: [],
    failed: 0,
    started: false
  });
  useEffect(() => {
    if (!enabled || state.started || !owner || !appName) return void 0;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, started: true }));
    (async () => {
      const baseUrl = await discoveryApi.getBaseUrl("glidepath");
      let failed = 0;
      const get = async (path, params) => {
        try {
          const res = await fetchApi.fetch(`${baseUrl}${path}?${new URLSearchParams({ owner, appName, ...params })}`);
          if (res.status === 404) return void 0;
          if (!res.ok) throw new Error(String(res.status));
          return await res.json();
        } catch {
          failed++;
          return void 0;
        }
      };
      const files = [];
      const add = (subtab, label, data, env) => {
        if (data?.values) files.push({ subtab, label, env, path: data.path ?? "", values: data.values });
      };
      const [cicd, base, prEnv, groundEnvs] = await Promise.all([
        get("/config/cicd", {}),
        get("/config/platform-env", { file: "base" }),
        get("/config/platform-env", {}),
        get("/config/platform-envs", {})
      ]);
      add("glidepath", "cicd.yaml", cicd);
      add("config", "Ground shared values", base);
      add("config", "Preview shared values", prEnv);
      const ground = (groundEnvs?.envs ?? []).slice(0, 12);
      const flight = readEnvironments(cicd?.values?.deploy).envs.filter((e) => e.tier === "flight").map((e) => ({ name: e.name, cluster: e.cluster ?? environments.find((x) => x.env === e.name)?.cluster })).filter((e) => Boolean(e.cluster)).slice(0, 8);
      const clusters = [...new Set(flight.map((e) => e.cluster))];
      const [groundFiles, flightFiles, flightBases] = await Promise.all([
        Promise.all(ground.map((env) => get("/config/platform-env", { env }))),
        Promise.all(flight.map((e) => get("/config", { cluster: e.cluster, env: e.name }))),
        Promise.all(clusters.map((cluster) => get("/config/flight-base", { cluster })))
      ]);
      ground.forEach((env, i) => add("environments", `${env} values`, groundFiles[i], env));
      flight.forEach((e, i) => add("environments", `${e.name} values`, flightFiles[i], e.name));
      clusters.forEach(
        (cluster, i) => add("config", clusters.length > 1 ? `Flight shared values (${cluster})` : "Flight shared values", flightBases[i])
      );
      if (!cancelled) setState((s) => ({ ...s, loading: false, files, failed }));
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, owner, appName]);
  return { ...state, available: Boolean(owner && appName) };
}

export { useSettingFiles };
//# sourceMappingURL=useSettingFiles.esm.js.map
