import { FleetGridDashboard } from './FleetGridDashboard';
import { OpsWallDashboard } from './OpsWallDashboard';

// The extensible fleet-dashboard registry - the same array-of-{id,label,
// Component} shape TowerPage.tsx's own TABS already uses for its per-app tab
// bar. Adding a future layout (Environment Lanes, Release Radar, Minimal
// Status Strip - the other 3 directions from the "Tower Dashboard Mockups"
// artifact) is one entry here plus one new component file - no other
// wiring changes.
export const DASHBOARDS = [
  { id: 'fleet-grid', label: 'Fleet Grid', Component: FleetGridDashboard },
  { id: 'ops-wall', label: 'Ops Wall', Component: OpsWallDashboard },
] as const;

export type DashboardId = (typeof DASHBOARDS)[number]['id'];

export const DEFAULT_DASHBOARD: DashboardId = 'fleet-grid';

export function isDashboardId(value: string | null): value is DashboardId {
  return DASHBOARDS.some(d => d.id === value);
}
