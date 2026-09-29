import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { usePrometheusInstantQuery } from './usePrometheusQuery';
import type { PrometheusSample } from './usePrometheusQuery';

// Fleet-wide SLO compliance for the leadership KPI strip, deliberately NOT
// built as "one query per SLO across every app" (SlosTab.tsx's own per-SLO
// selector, `{__name__=~"slo:...",sloth_service="x",sloth_slo="y"}`, repeated
// fleet-wide would be N Prometheus calls). Sloth's recording rules already
// carry sloth_service/sloth_slo as labels on every sample, so dropping the
// selector entirely and querying once PER CLUSTER returns every SLO on that
// cluster in one shot - with this platform's real 1-2 registered clusters
// (kind-dev/kind-prod), that's 1-2 total Prometheus calls for the entire
// fleet, not one per app. New query shape (broader than any existing call in
// this codebase) - live-verify against a real cluster before trusting the
// numbers it produces.
const FLEET_SLO_QUERY = '{__name__=~"slo:(period_burn_rate|period_error_budget_remaining):.+"}';

interface SloRow {
  periodBurnRate?: number;
  budgetRemaining?: number;
}

export interface FleetSloSummary {
  total: number;
  meetingObjective: number;
  // Average of Sloth's own period_error_budget_remaining:ratio across every
  // SLO seen, 0-100. Undefined until at least one sample has resolved.
  errorBudgetRemainingPct?: number;
  loading: boolean;
}

function ClusterSloProbe({
  cluster,
  onData,
}: {
  cluster: string;
  onData: (cluster: string, samples: PrometheusSample[]) => void;
}) {
  const { samples } = usePrometheusInstantQuery(cluster, FLEET_SLO_QUERY);
  useEffect(() => {
    onData(cluster, samples);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cluster, samples]);
  return null;
}

// Sloth's own definition of "within budget for the full compliance window"
// - period_burn_rate <= 1 - restated directly from SlosTab.tsx's identical
// meetingObjective derivation (see that file's comment on the math), not
// re-derived from first principles here.
function meetsObjective(row: SloRow): boolean | undefined {
  return row.periodBurnRate === undefined ? undefined : row.periodBurnRate <= 1;
}

export interface UseFleetSlosResult {
  summary: FleetSloSummary;
  probes: ReactNode;
}

export function useFleetSlos(clusters: string[]): UseFleetSlosResult {
  const [byCluster, setByCluster] = useState<Record<string, PrometheusSample[]>>({});

  const handleData = useCallback((cluster: string, samples: PrometheusSample[]) => {
    setByCluster(prev => ({ ...prev, [cluster]: samples }));
  }, []);

  const probes = (
    <>
      {clusters.map(cluster => (
        <ClusterSloProbe key={cluster} cluster={cluster} onData={handleData} />
      ))}
    </>
  );

  const summary = useMemo<FleetSloSummary>(() => {
    const bySlo = new Map<string, SloRow>();
    Object.values(byCluster)
      .flat()
      .forEach(sample => {
        const service = sample.metric.sloth_service;
        const slo = sample.metric.sloth_slo;
        const name = sample.metric.__name__;
        if (!service || !slo || !name) return;
        const key = `${service}/${slo}`;
        const row = bySlo.get(key) ?? {};
        if (name === 'slo:period_burn_rate:ratio') row.periodBurnRate = sample.value;
        if (name === 'slo:period_error_budget_remaining:ratio') row.budgetRemaining = sample.value;
        bySlo.set(key, row);
      });

    const rows = [...bySlo.values()];
    const meetingObjective = rows.filter(r => meetsObjective(r) === true).length;
    const budgets = rows.map(r => r.budgetRemaining).filter((n): n is number => n !== undefined);
    const errorBudgetRemainingPct = budgets.length
      ? (budgets.reduce((a, b) => a + b, 0) / budgets.length) * 100
      : undefined;

    return {
      total: rows.length,
      meetingObjective,
      errorBudgetRemainingPct,
      loading: clusters.length > 0 && Object.keys(byCluster).length < clusters.length,
    };
  }, [byCluster, clusters]);

  return { summary, probes };
}
