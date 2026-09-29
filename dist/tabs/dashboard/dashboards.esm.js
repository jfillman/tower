import { FleetGridDashboard } from './FleetGridDashboard.esm.js';
import { OpsWallDashboard } from './OpsWallDashboard.esm.js';

const DASHBOARDS = [
  { id: "fleet-grid", label: "Fleet Grid", Component: FleetGridDashboard },
  { id: "ops-wall", label: "Ops Wall", Component: OpsWallDashboard }
];
const DEFAULT_DASHBOARD = "fleet-grid";
function isDashboardId(value) {
  return DASHBOARDS.some((d) => d.id === value);
}

export { DASHBOARDS, DEFAULT_DASHBOARD, isDashboardId };
//# sourceMappingURL=dashboards.esm.js.map
