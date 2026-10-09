import { jsx, Fragment } from 'react/jsx-runtime';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { useTowerEnvironmentsLive } from './useTowerEnvironments.esm.js';
import { useArgoStatusMap } from './useReleaseData.esm.js';
import { envStageRank } from './types.esm.js';

function FleetAppProbe({
  entity,
  onData
}) {
  return /* @__PURE__ */ jsx(EntityProvider, { entity, children: /* @__PURE__ */ jsx(FleetAppProbeInner, { entity, onData }) });
}
function FleetAppProbeInner({
  entity,
  onData
}) {
  const entityRef = stringifyEntityRef(entity);
  const appName = entity.metadata.annotations?.["github.com/project-slug"]?.split("/")[1] ?? entity.metadata.name;
  const owner = entity.spec?.owner;
  const { environments: rawEnvironments, loading } = useTowerEnvironmentsLive();
  const argoStatusRaw = useArgoStatusMap(
    rawEnvironments.map((e) => e.argoAppName).filter((n) => Boolean(n))
  );
  const environments = useMemo(
    () => rawEnvironments.map((e) => ({
      ...e,
      argoHealthStatus: e.argoAppName ? argoStatusRaw[e.argoAppName]?.healthStatus : void 0,
      argoSyncStatus: e.argoAppName ? argoStatusRaw[e.argoAppName]?.syncStatus : void 0
    })),
    [rawEnvironments, argoStatusRaw]
  );
  useEffect(() => {
    onData({ entityRef, appName, owner, environments, loading });
  }, [entityRef, appName, owner, loading, environments]);
  return null;
}
function useFleetEnvironments(roster) {
  const [byRef, setByRef] = useState({});
  const handleData = useCallback((app) => {
    setByRef((prev) => ({ ...prev, [app.entityRef]: app }));
  }, []);
  const probes = /* @__PURE__ */ jsx(Fragment, { children: roster.map((entity) => /* @__PURE__ */ jsx(FleetAppProbe, { entity, onData: handleData }, stringifyEntityRef(entity))) });
  const apps = useMemo(
    () => roster.map((e) => byRef[stringifyEntityRef(e)]).filter((a) => Boolean(a)),
    [roster, byRef]
  );
  const loading = apps.length < roster.length;
  return { apps, loading, probes };
}
function fleetEnvColumns(apps) {
  const names = /* @__PURE__ */ new Set();
  apps.forEach((app) => app.environments.forEach((e) => names.add(e.env)));
  return [...names].sort((a, b) => envStageRank(a) - envStageRank(b) || a.localeCompare(b));
}

export { fleetEnvColumns, useFleetEnvironments };
//# sourceMappingURL=useFleetEnvironments.esm.js.map
