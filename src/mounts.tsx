import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Entity } from '@backstage/catalog-model';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { discoveryApiRef, fetchApiRef, useApi, type DiscoveryApi, type FetchApi } from '@backstage/core-plugin-api';
import { createExtensionDataRef } from '@backstage/frontend-plugin-api';
import { usePolled, type Polled } from './fleet/usePolled';

// Tabs another plugin mounts into a service's Tower page (Autopilot and Clearance in Backstage: UI design,
// 2026-10-30): the Agent tab comes from the Autopilot plugin and the Clearance tab from the Clearance plugin. Each
// plugin owns its data and draws the tab's body; Tower only decides which service gets the tab (a capability,
// serviceClass.ts) and asks the mount whether it has anything to say about this service. Without the plugin
// installed the tab does not exist. See docs/mounted-tabs.md.
//
// The contract is the extension data ref below, by id: a plugin attaches an extension to `page:tower`, input
// `agentTab` or `clearanceTab`, whose output is one `TowerTabMount`. The Clearance plugin may not import Tower
// (standalone-ready), so it declares the same ref by the same id instead of importing this one.
//
// 2026-10-31: a mount may also answer two fleet-wide questions Tower draws elsewhere, without Tower reading the
// plugin's data itself: `fleet` (every agent's state, for the Services list) and `receipts` (the PRs agents opened
// on a repo, for the marks in Pull requests, Pipelines and Releases).

export interface TowerTabMount {
  /** The tab's body. Rendered inside Tower's EntityProvider, so `useEntity()` gives it the service. */
  element: JSX.Element;
  /**
   * Whether the tab has anything to say about this service; absent means always. Tower asks once per service and
   * hides the tab until the answer is yes, so most services do not get an empty tab. A failure counts as no.
   */
  relevant?: (ctx: TowerMountContext) => Promise<boolean>;
  /**
   * Every agent's state for the Services list (design board T0: live, frozen, a request waiting, what it acts on),
   * polled every 30 s while the list is open. The Autopilot mount provides it.
   */
  fleet?: (apis: TowerMountApis) => Promise<TowerFleetSummary>;
  /**
   * The PRs agents opened on a repo (`owner/name`) through Clearance, for the marks in Pull requests, Pipelines and
   * Releases (board T1). The Clearance mount provides it; Tower asks per repo it shows, every 60 s.
   */
  receipts?: (apis: TowerMountApis, repo: string) => Promise<TowerPrMark[]>;
}

export interface TowerMountApis {
  discoveryApi: DiscoveryApi;
  fetchApi: FetchApi;
}

export interface TowerMountContext extends TowerMountApis {
  entity: Entity;
}

/** One agent, as the Services list shows it. `name` is the definition's name (the Component's, or its annotation). */
export interface TowerAgentState {
  name: string;
  /** task | session | service | scheduled | event | team */
  kind: string;
  /** The apps its definition's scope names (Glidepath apps, repo names without a gitops- prefix): "acts on", and search. */
  actsOn: string[];
  /** The triggers in words: "every 24h", "pipeline finished", "manual". */
  triggers: string[];
  live: number;
  tripped: number;
  /** Questions it asked that wait on a person. */
  waiting: number;
  lastRun?: { at: string; state: 'live' | 'closed' | 'expired'; tripped: boolean };
}

export interface TowerFleetSummary {
  agents: TowerAgentState[];
  /** Where a person starts a new agent profile (board A3), when the plugin offers it; an in-app path. */
  newAgentHref?: string;
}

/** A PR an agent opened through Clearance: the receipt Clearance recorded. */
export interface TowerPrMark {
  /** `owner/name`, lower case. */
  repo: string;
  pr: number;
  agent: string;
  branch?: string;
  at: string;
  /** Clearance verified the receipt against the PR (authorized-and-verified coverage), or only recorded the claim. */
  verified: boolean;
}

const EMPTY_FLEET: TowerFleetSummary = { agents: [] };
const NO_MARKS: TowerPrMark[] = [];

/** The fleet summary, polled from whichever mount provides one (the Autopilot plugin's); empty without one. */
export function useFleetSummary(): Polled<TowerFleetSummary> {
  const mounts = useTowerMounts();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const fleet = mounts.agent?.fleet ?? mounts.clearance?.fleet;
  const fetcher = useCallback(() => (fleet ? fleet({ discoveryApi, fetchApi }) : Promise.resolve(EMPTY_FLEET)), [fleet, discoveryApi, fetchApi]);
  return usePolled('tower-fleet', fetcher, 30_000);
}

/** The agents' PRs on these repos (`owner/name`), from the mount that reads receipts (the Clearance plugin's); none without one. */
export function useRepoMarks(repos: Array<string | undefined>): TowerPrMark[] {
  const mounts = useTowerMounts();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const receipts = mounts.clearance?.receipts ?? mounts.agent?.receipts;
  const key = [...new Set(repos.filter((r): r is string => Boolean(r)).map(r => r.toLowerCase()))].sort().join(',');
  const fetcher = useCallback(async () => {
    if (!receipts || !key) return NO_MARKS;
    const lists = await Promise.all(key.split(',').map(repo => receipts({ discoveryApi, fetchApi }, repo).catch(() => NO_MARKS)));
    return lists.flat();
  }, [receipts, key, discoveryApi, fetchApi]);
  return usePolled(`tower-marks-${key}`, fetcher, 60_000).data ?? NO_MARKS;
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
