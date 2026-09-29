import { useEffect, useMemo, useState } from 'react';
import { useEntity } from '@backstage/plugin-catalog-react';
import { useCustomResources } from '@backstage/plugin-kubernetes-react';
import type { SloIndicator, SloSummary } from './types';

// SLOs (catalog.idp.io/v1alpha1) are chart-templated with the same
// airframe-application.labels helper every other Attached-tier resource
// gets (see airframe/charts/airframe-application/templates/attached/
// slos.yaml) - so, unlike AnalysisRun/PipelineRun (controller-generated
// children with no hangar.io/app label, see useAnalysisRuns.ts's own
// comment), useCustomResources(entity, [...])'s label-selector match works
// here directly, same as ROLLOUT_MATCHER in useTowerEnvironments.ts.
const SLO_MATCHER = { group: 'catalog.idp.io', apiVersion: 'v1alpha1', plural: 'slos' };

interface RawSlo {
  metadata: { name: string; namespace: string; labels?: Record<string, string> };
  spec: {
    environmentRef?: { name?: string };
    service: string;
    objective: number;
    indicator: SloIndicator;
  };
}

// The same hangar.io/env label envLabelOf reads off a Rollout/Deployment
// (useTowerEnvironments.ts:462-464) - the SLO object carries it too, stamped
// by the same airframe-application.labels chart helper every Attached-tier
// resource gets (see this file's own top comment). 2026-09-15: the real
// fix for "two SLOs with the same name/service in different environments
// look identical" - environmentRefName carries the full
// ApplicationEnvironment XR name (e.g. "checkout-api-kind-prod-proofing"),
// not the bare env a user actually thinks in terms of.
const ENV_LABEL = 'hangar.io/env';

function toSloSummary(raw: RawSlo, cluster: string): SloSummary {
  return {
    name: raw.metadata.name,
    cluster,
    namespace: raw.metadata.namespace,
    environmentRefName: raw.spec.environmentRef?.name,
    env: raw.metadata.labels?.[ENV_LABEL],
    service: raw.spec.service,
    objective: raw.spec.objective,
    indicator: raw.spec.indicator,
    // Matches Sloth's own sloth_id label exactly - see the Composition
    // template (airframe/compositions/slo/templates/prometheusservicelevel.yaml):
    // one SLO per PrometheusServiceLevel, named `<service>-<name>` by Sloth's
    // controller (confirmed live: sloth_id="checkout-api-checkout-api-liveness-latency"
    // for service=checkout-api, name=checkout-api-liveness-latency). No
    // longer unique on its own once the same name/service is promoted to
    // more than one environment - SlosTab.tsx's selectorFor also matches on
    // `namespace` now, see that file's own comment.
    slothId: `${raw.spec.service}-${raw.metadata.name}`,
  };
}

export interface UseSlosResult {
  loading: boolean;
  refreshing: boolean;
  error?: string;
  slos: SloSummary[];
}

export function useSlos(): UseSlosResult {
  const { entity } = useEntity();
  const { kubernetesObjects, loading, error } = useCustomResources(entity, [SLO_MATCHER]);

  const slos = useMemo(() => {
    const result: SloSummary[] = [];
    (kubernetesObjects?.items ?? []).forEach(item => {
      const raws = (item.resources.find(r => r.type === 'customresources')?.resources ??
        []) as RawSlo[];
      raws.forEach(raw => result.push(toSloSummary(raw, item.cluster.name)));
    });
    // Secondary sort by env (2026-09-15) - name alone now commonly ties
    // (the same SLO promoted to more than one environment), so without this
    // two same-named cards would land in whatever order the API happened to
    // return them, instead of predictably next to each other.
    return result.sort(
      (a, b) => a.name.localeCompare(b.name) || (a.env ?? '').localeCompare(b.env ?? ''),
    );
  }, [kubernetesObjects]);

  // Same "only the first load blocks" fix as useTowerEnvironments.ts -
  // useCustomResources flips loading back to true on every background poll
  // tick, not just the first. Without this, SlosTab's own `if (loading)
  // return <Progress />` was unmounting and remounting every SloCard on
  // each background poll, silently resetting each card's own showDetails
  // state - the real cause of a live-reported bug ("show indicator
  // definition... a refresh closes the window", 2026-09-14): it wasn't the
  // explicit Refresh button, it was this hook's own background polling.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  useEffect(() => {
    if (!loading) setHasLoadedOnce(true);
  }, [loading]);

  return {
    slos,
    loading: !hasLoadedOnce && loading,
    refreshing: hasLoadedOnce && loading,
    error,
  };
}
