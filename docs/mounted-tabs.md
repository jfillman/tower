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
  // Every agent's state for the Services list (board T0), polled every 30 s while the list is open.
  // The Autopilot mount provides it.
  fleet?: (apis: { discoveryApi; fetchApi }) => Promise<TowerFleetSummary>;
  // The PRs agents opened on a repo (owner/name) through Clearance, for the marks in Pull requests,
  // Pipelines and Releases (board T1). The Clearance mount provides it; asked per repo shown, every 60 s.
  receipts?: (apis: { discoveryApi; fetchApi }, repo: string) => Promise<TowerPrMark[]>;
}

interface TowerFleetSummary {
  agents: Array<{
    name: string; kind: string;
    actsOn: string[];          // the apps its scope names (Glidepath apps, repo names without gitops-)
    triggers: string[];        // in words: "every 24h", "pipeline finished", "manual"
    live: number; tripped: number; waiting: number;   // waiting = questions on a person
    lastRun?: { at: string; state: 'live' | 'closed' | 'expired'; tripped: boolean };
  }>;
  newAgentHref?: string;       // the New agent profile page (board A3), an in-app path
}

interface TowerPrMark { repo: string; pr: number; agent: string; branch?: string; at: string; verified: boolean }
```

What Tower draws from them (`src/fleetMarks.ts`, `src/AgentMark.tsx`):

- **Services list** (board T0): an AI workload's card shows its shape or trigger, its live state (running, frozen
  with the breaker tripped, last run), the questions waiting on a person and the apps it acts on, in place of
  environment health; an app's card says how many agents can act on it; search matches the apps an agent may act
  on; the header links to New agent profile when the mount names it. The agent behind a Component is its name, or
  `autopilot.hangar.io/agent` when they differ (the Autopilot plugin reads the same annotation).
- **Marks**: a Pull requests row whose PR has a receipt carries the Clearance glyph and the agent's name (hover:
  verified or only recorded, when); a Releases card whose PRs include one says so; a Pipelines row building the
  branch of such a PR says whose PR it builds.

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

- A live-activity dot on the Agent tab (a run in progress), like the Pipelines and Deployments dots. The fleet
  summary could feed it; not wired.
- A Pipelines row saying "<agent> investigating" on the failed run that started an event agent (board T1): Clearance
  records the trigger as `trigger:glidepath:<event id>`, not the PipelineRun the event named, so nothing links the
  two yet. The mark on a PR's own build is there (by branch).
- The deployment-gate marks ("tier 2 · holding", "clearance attestation") arrive with the gate.
- A scheduled agent's "next run at" chip: the fleet summary carries the trigger in words, not the next time.
