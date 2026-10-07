import { FleetGridDashboard } from './FleetGridDashboard.esm.js';
import { OpsWallDashboard } from './OpsWallDashboard.esm.js';

const DASHBOARDS = [
  { id: "ops-wall", label: "Ops Wall", Component: OpsWallDashboard },
  { id: "fleet-grid", label: "Fleet Grid", Component: FleetGridDashboard }
];
const DEFAULT_DASHBOARD = "ops-wall";
function isDashboardId(value) {
  return DASHBOARDS.some((d) => d.id === value);
}

export { DASHBOARDS, DEFAULT_DASHBOARD, isDashboardId };
//# sourceMappingURL=dashboards.esm.js.map
