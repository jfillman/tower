# Tabs mounted by other plugins

Two of a service's tabs are not Tower's own. The **Agent** tab (AI workloads and AI services) is the Autopilot
plugin's, and the **Clearance** tab (every app Clearance governs) is the Clearance plugin's
([Autopilot and Clearance in Backstage: UI design](https://claude.ai/artifact/9f8jNFAyjcvVGcRGX5Z2oU), 2026-10-30).
Each plugin owns its data and draws the tab's body; Tower decides which service gets the tab (a capability,
[service-classes.md](service-classes.md)) and asks the plugin whether it has anything to say about this service.
Without the plugin installed, the tab does not exist.

## The contract

Tower's page extension (`page:tower`) declares two optional singleton inputs, `agentTab` and `clearanceTab`. A plugin
attaches an extension to one of them whose output is a `TowerTabMount`, under the extension data ref id
`tower.tab-mount`:

```ts
interface TowerTabMount {
  // The tab's body. Rendered inside Tower's EntityProvider: useEntity() gives it the service.
  element: JSX.Element;
  // Whether the tab has anything to say about this service; absent means always. Tower asks once per
  // service and hides the tab until the answer is yes. A failure counts as no.
  relevant?: (ctx: { entity: Entity; discoveryApi: DiscoveryApi; fetchApi: FetchApi }) => Promise<boolean>;
}
```

`@jfillman/tower` exports `towerTabMountDataRef`, `TOWER_TAB_MOUNT_ID`, `TOWER_MOUNT_INPUTS` and the types
(`src/mounts.tsx`). The Clearance plugin may not import Tower (it is standalone-ready), so it declares the same ref by
the same id:

```ts
import { createExtension, createExtensionDataRef } from '@backstage/frontend-plugin-api';

const towerTabMountDataRef = createExtensionDataRef<TowerTabMount>().with({ id: 'tower.tab-mount' });

const towerClearanceTab = createExtension({
  name: 'tower-clearance-tab',
  attachTo: { id: 'page:tower', input: 'clearanceTab' },
  output: [towerTabMountDataRef],
  factory: () => [towerTabMountDataRef({ element: <EntityClearanceContent />, relevant: isRelevant })],
});
```

## What Tower does with it

- The tab's frame (the kit's `PageHeader`) is Tower's; everything under it is the mount's element.
- `visibleTabs()` in `TowerPage.tsx` shows a mounted tab when the service has the capability the tab requires
  (`autopilot` for Agent, `clearance` for Clearance), the mount is present, and `relevant` answered yes (or is absent).
- `useVisibleMounts()` asks `relevant` once per service and keeps the answer while that service is open. Until the
  answer arrives the tab is hidden; a `?tab=` deep link to it lands on Overview and moves over when it appears.
- Tower never reads the plugin's data itself: no Clearance types, no clearance-api calls. The agent-requests chip and
  the For you page are the exception that predates this (they read the backstage backend's `/api/agent-requests`).

## Not built yet

- A live-activity dot on the Agent tab (a run in progress), like the Pipelines and Deployments dots. The mount would
  have to report it; the contract has no field for that yet.
- Tower's Services list showing an agent's live state in place of environment health, searching by the apps an agent
  may act on, and an app's card saying how many agents can act on it (design board T0).
- The small Clearance marks in Pipelines, Pull requests and Releases (design board T1).
