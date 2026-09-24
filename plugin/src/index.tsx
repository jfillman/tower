import { createFrontendPlugin, createRouteRef, PageBlueprint } from '@backstage/frontend-plugin-api';
import { HangarMark } from '../brand/HangarMark';

// Tower: the single top-level "release command center" console - a real
// top-level route (own sidebar entry, own app picker), not an entity-scoped
// tab like its closest prior art (../glidepath). Confirmed direction, see
// HANDOFF-tower-module.md's consultation, "Tower shape" decision
// (2026-09-07): matches the "single pane of glass for managing
// applications" framing better than a tab buried inside each catalog
// entity's page, and matches this file's own pluginId/route as originally
// specified in the handoff. noHeader:true because TowerPage.tsx renders its
// own full-bleed instrument-panel header/tab-bar chrome (per the Hangar
// Brand System mockup) rather than the stock plugin page header.
//
// routeRef is NOT optional in practice despite the type allowing it:
// AppNav.esm.js's nav-item collector (@backstage/frontend-defaults's nested
// plugin-app package) skips any route node with no routeRef entirely
// (`if (!routeRef) return [];`) before it ever looks at title/icon - a page
// with no routeRef still renders fine on direct navigation (confirmed live,
// this is exactly why /tower loaded correctly but never appeared in the
// sidebar - a real bug caught live on kiac-prod, not a caching issue as
// first suspected).
export const towerRouteRef = createRouteRef();

export const towerPlugin = createFrontendPlugin({
  pluginId: 'tower',
  extensions: [
    PageBlueprint.make({
      params: {
        path: '/tower',
        routeRef: towerRouteRef,
        title: 'Tower',
        icon: <HangarMark glyph="tower" size={24} />,
        noHeader: true,
        loader: () => import('./TowerPage').then(m => <m.TowerPage />),
      },
    }),
  ],
});
