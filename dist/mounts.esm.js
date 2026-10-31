import { jsx } from 'react/jsx-runtime';
import { createContext, useState, useEffect, useContext } from 'react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { createExtensionDataRef } from '@backstage/frontend-plugin-api';

const TOWER_TAB_MOUNT_ID = "tower.tab-mount";
const towerTabMountDataRef = createExtensionDataRef().with({ id: TOWER_TAB_MOUNT_ID });
const TOWER_MOUNT_INPUTS = { agent: "agentTab", clearance: "clearanceTab" };
const MountsContext = createContext({});
function TowerMountsProvider({ mounts, children }) {
  return /* @__PURE__ */ jsx(MountsContext.Provider, { value: mounts, children });
}
function useTowerMounts() {
  return useContext(MountsContext);
}
function immediateVisibility(mounts) {
  const visible = {};
  for (const [name, mount] of Object.entries(mounts)) {
    if (mount) visible[name] = !mount.relevant;
  }
  return visible;
}
async function resolveMountVisibility(mounts, ctx) {
  const entries = Object.entries(mounts);
  const answers = await Promise.all(
    entries.map(async ([name, mount]) => {
      if (!mount) return [name, false];
      if (!mount.relevant) return [name, true];
      const yes = await mount.relevant(ctx).catch(() => false);
      return [name, yes];
    })
  );
  return Object.fromEntries(answers);
}
function useVisibleMounts(entity) {
  const mounts = useTowerMounts();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const ref = stringifyEntityRef(entity);
  const [answer, setAnswer] = useState();
  useEffect(() => {
    let cancelled = false;
    resolveMountVisibility(mounts, { entity, discoveryApi, fetchApi }).then((visible) => {
      if (!cancelled) setAnswer({ ref, visible });
    });
    return () => {
      cancelled = true;
    };
  }, [ref, entity, mounts, discoveryApi, fetchApi]);
  return answer?.ref === ref ? answer.visible : immediateVisibility(mounts);
}

export { TOWER_MOUNT_INPUTS, TOWER_TAB_MOUNT_ID, TowerMountsProvider, immediateVisibility, resolveMountVisibility, towerTabMountDataRef, useTowerMounts, useVisibleMounts };
//# sourceMappingURL=mounts.esm.js.map
