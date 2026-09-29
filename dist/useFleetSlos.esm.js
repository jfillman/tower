import { jsx, Fragment } from 'react/jsx-runtime';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { usePrometheusInstantQuery } from './usePrometheusQuery.esm.js';

const FLEET_SLO_QUERY = '{__name__=~"slo:(period_burn_rate|period_error_budget_remaining):.+"}';
function ClusterSloProbe({
  cluster,
  onData
}) {
  const { samples } = usePrometheusInstantQuery(cluster, FLEET_SLO_QUERY);
  useEffect(() => {
    onData(cluster, samples);
  }, [cluster, samples]);
  return null;
}
function meetsObjective(row) {
  return row.periodBurnRate === void 0 ? void 0 : row.periodBurnRate <= 1;
}
function useFleetSlos(clusters) {
  const [byCluster, setByCluster] = useState({});
  const handleData = useCallback((cluster, samples) => {
    setByCluster((prev) => ({ ...prev, [cluster]: samples }));
  }, []);
  const probes = /* @__PURE__ */ jsx(Fragment, { children: clusters.map((cluster) => /* @__PURE__ */ jsx(ClusterSloProbe, { cluster, onData: handleData }, cluster)) });
  const summary = useMemo(() => {
    const bySlo = /* @__PURE__ */ new Map();
    Object.values(byCluster).flat().forEach((sample) => {
      const service = sample.metric.sloth_service;
      const slo = sample.metric.sloth_slo;
      const name = sample.metric.__name__;
      if (!service || !slo || !name) return;
      const key = `${service}/${slo}`;
      const row = bySlo.get(key) ?? {};
      if (name === "slo:period_burn_rate:ratio") row.periodBurnRate = sample.value;
      if (name === "slo:period_error_budget_remaining:ratio") row.budgetRemaining = sample.value;
      bySlo.set(key, row);
    });
    const rows = [...bySlo.values()];
    const meetingObjective = rows.filter((r) => meetsObjective(r) === true).length;
    const budgets = rows.map((r) => r.budgetRemaining).filter((n) => n !== void 0);
    const errorBudgetRemainingPct = budgets.length ? budgets.reduce((a, b) => a + b, 0) / budgets.length * 100 : void 0;
    return {
      total: rows.length,
      meetingObjective,
      errorBudgetRemainingPct,
      loading: clusters.length > 0 && Object.keys(byCluster).length < clusters.length
    };
  }, [byCluster, clusters]);
  return { summary, probes };
}

export { useFleetSlos };
//# sourceMappingURL=useFleetSlos.esm.js.map
