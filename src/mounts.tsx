import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Entity } from '@backstage/catalog-model';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { discoveryApiRef, fetchApiRef, useApi, type DiscoveryApi, type FetchApi } from '@backstage/core-plugin-api';
import { createExtensionDataRef } from '@backstage/frontend-plugin-api';

// Tabs another plugin mounts into a service's Tower page (Autopilot and Clearance in Backstage: UI design,
// 2026-10-30): the Agent tab comes from the Autopilot plugin and the Clearance tab from the Clearance plugin. Each
// plugin owns its data and draws the tab's body; Tower only decides which service gets the tab (a capability,
// serviceClass.ts) and asks the mount whether it has anything to say about this service. Without the plugin
// installed the tab does not exist. See docs/mounted-tabs.md.
//
// The contract is the extension data ref below, by id: a plugin attaches an extension to `page:tower`, input
// `agentTab` or `clearanceTab`, whose output is one `TowerTabMount`. The Clearance plugin may not import Tower
// (standalone-ready), so it declares the same ref by the same id instead of importing this one.

export interface TowerTabMount {
  /** The tab's body. Rendered inside Tower's EntityProvider, so `useEntity()` gives it the service. */
  element: JSX.Element;
  /**
   * Whether the tab has anything to say about this service; absent means always. Tower asks once per service and
   * hides the tab until the answer is yes, so most services do not get an empty tab. A failure counts as no.
   */
  relevant?: (ctx: TowerMountContext) => Promise<boolean>;
}

export interface TowerMountContext {
  entity: Entity;
  discoveryApi: DiscoveryApi;
  fetchApi: FetchApi;
}

export const TOWER_TAB_MOUNT_ID = 'tower.tab-mount';
export const towerTabMountDataRef = createExtensionDataRef<TowerTabMount>().with({ id: TOWER_TAB_MOUNT_ID });

export type TowerMountName = 'agent' | 'clearance';
/** The page extension's input names, one per mounted tab: `attachTo: { id: 'page:tower', input: <this> }`. */
export const TOWER_MOUNT_INPUTS: Record<TowerMountName, string> = { agent: 'agentTab', clearance: 'clearanceTab' };

export type TowerMounts = Partial<Record<TowerMountName, TowerTabMount>>;
export type MountVisibility = Partial<Record<TowerMountName, boolean>>;

const MountsContext = createContext<TowerMounts>({});

export function TowerMountsProvider({ mounts, children }: { mounts: TowerMounts; children: ReactNode }) {
  return <MountsContext.Provider value={mounts}>{children}</MountsContext.Provider>;
}

export function useTowerMounts(): TowerMounts {
  return useContext(MountsContext);
}

/** What is visible before any mount has answered: mounts with no `relevant` are, the others wait. */
export function immediateVisibility(mounts: TowerMounts): MountVisibility {
  const visible: MountVisibility = {};
  for (const [name, mount] of Object.entries(mounts) as Array<[TowerMountName, TowerTabMount | undefined]>) {
    if (mount) visible[name] = !mount.relevant;
  }
  return visible;
}

/** Every mount's answer for this service; a mount that throws is not relevant. */
export async function resolveMountVisibility(mounts: TowerMounts, ctx: TowerMountContext): Promise<MountVisibility> {
  const entries = Object.entries(mounts) as Array<[TowerMountName, TowerTabMount | undefined]>;
  const answers = await Promise.all(
    entries.map(async ([name, mount]): Promise<[TowerMountName, boolean]> => {
      if (!mount) return [name, false];
      if (!mount.relevant) return [name, true];
      const yes = await mount.relevant(ctx).catch(() => false);
      return [name, yes];
    }),
  );
  return Object.fromEntries(answers) as MountVisibility;
}

/** Which mounted tabs this service shows, asked once per service (the answer is kept while the entity stays). */
export function useVisibleMounts(entity: Entity): MountVisibility {
  const mounts = useTowerMounts();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const ref = stringifyEntityRef(entity);
  const [answer, setAnswer] = useState<{ ref: string; visible: MountVisibility }>();
  useEffect(() => {
    let cancelled = false;
    resolveMountVisibility(mounts, { entity, discoveryApi, fetchApi }).then(visible => {
      if (!cancelled) setAnswer({ ref, visible });
    });
    return () => {
      cancelled = true;
    };
  }, [ref, entity, mounts, discoveryApi, fetchApi]);
  return answer?.ref === ref ? answer.visible : immediateVisibility(mounts);
}
