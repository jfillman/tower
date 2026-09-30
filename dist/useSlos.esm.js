import { useMemo, useState, useEffect } from 'react';
import { useEntity } from '@backstage/plugin-catalog-react';
import { useCustomResources } from '@backstage/plugin-kubernetes-react';

const SLO_MATCHER = { group: "catalog.idp.io", apiVersion: "v1alpha1", plural: "slos" };
const SLO_MATCHER_HANGAR = { group: "catalog.hangar.io", apiVersion: "v1alpha1", plural: "slos" };
const ENV_LABEL = "hangar.io/env";
function toSloSummary(raw, cluster) {
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
    slothId: `${raw.spec.service}-${raw.metadata.name}`
  };
}
function useSlos() {
  const { entity } = useEntity();
  const { kubernetesObjects: idpObjects, loading: idpLoading, error: idpError } = useCustomResources(entity, [SLO_MATCHER]);
  const { kubernetesObjects: hangarObjects, loading: hangarLoading, error: hangarError } = useCustomResources(entity, [SLO_MATCHER_HANGAR]);
  const loading = idpLoading || hangarLoading;
  const error = idpError && hangarError ? idpError : void 0;
  const slos = useMemo(() => {
    const result = [];
    [idpObjects, hangarObjects].forEach((objects) => {
      (objects?.items ?? []).forEach((item) => {
        const raws = item.resources.find((r) => r.type === "customresources")?.resources ?? [];
        raws.forEach((raw) => result.push(toSloSummary(raw, item.cluster.name)));
      });
    });
    return result.sort(
      (a, b) => a.name.localeCompare(b.name) || (a.env ?? "").localeCompare(b.env ?? "")
    );
  }, [idpObjects, hangarObjects]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  useEffect(() => {
    if (!loading) setHasLoadedOnce(true);
  }, [loading]);
  return {
    slos,
    loading: !hasLoadedOnce && loading,
    refreshing: hasLoadedOnce && loading,
    error
  };
}

export { useSlos };
//# sourceMappingURL=useSlos.esm.js.map
