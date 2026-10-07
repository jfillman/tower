import { FleetGridDashboard } from './FleetGridDashboard';
import type { ComponentType } from 'react';
import { OpsWallDashboard } from './OpsWallDashboard';

/** `fit`: the page is fullscreen and the dashboard must fit the screen without scrolling. */
export interface DashboardProps {
  fit?: boolean;
}

// The extensible fleet-dashboard registry - the same array-of-{id,label,
// Component} shape TowerPage.tsx's own TABS already uses for its per-app tab
// bar. Adding a future layout (Environment Lanes, Release Radar, Minimal
// Status Strip - the other 3 directions from the "Tower Dashboard Mockups"
// artifact) is one entry here plus one new component file - no other
// wiring changes.
export const DASHBOARDS = [
  { id: 'ops-wall', label: 'Ops Wall', Component: OpsWallDashboard as ComponentType<DashboardProps> },
  { id: 'fleet-grid', label: 'Fleet Grid', Component: FleetGridDashboard as ComponentType<DashboardProps> },
] as const;

export type DashboardId = (typeof DASHBOARDS)[number]['id'];

export const DEFAULT_DASHBOARD: DashboardId = 'ops-wall';

export function isDashboardId(value: string | null): value is DashboardId {
  return DASHBOARDS.some(d => d.id === value);
}
