import { useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { isKubernetesAvailable } from '@backstage/plugin-kubernetes';
import type { Entity } from '@backstage/catalog-model';

// The fleet dashboards (Fleet Grid / Ops Wall) exist to show real
// application services, not the platform/infra Components kubernetes-
// ingestor also ingests from every plain Deployment/StatefulSet/etc it finds
// on a cluster (argocd-server, crossplane-rbac-manager, thanos-compactor,
// ...) - confirmed live 2026-09-13 against this sandbox's real catalog: 35
// Components, none of them an actual application.
//
// The real discriminator, read straight out of the installed
// @terasky/backstage-plugin-kubernetes-ingestor package
// (dist/providers/EntityProvider.cjs.js): every Component it generates gets
// a `kind:<lowercase source kind>` tag. For a live Crossplane XR instance
// (airframe's nodejsapplication/springbootapplication/pythonapplication/
// goapplication XRDs - see airframe/compositions/) that's the XR's own real
// kind, e.g. `kind:nodejsapplication`. For a generically-ingested plain
// Kubernetes workload it's the workload's own kind instead, e.g.
// `kind:deployment` - never one of the app-tier values below. This is the
// same tag every entity already carries in production, not something new to
// wire up.
//
// Deliberately excludes airframe's other Bootstrap-tier XRD,
// applicationenvironment - that's the per-env provisioning record, not the
// application itself (see [[idp_session_applicationenvironment_xrd]]
// memory), and the 4 auto-derived XRDs (TektonCICD/SecretStore/SLO/
// RolloutWatch) - all real Airframe plumbing, none of them "an app" either.
const APP_TIER_KIND_TAGS = new Set([
  'kind:nodejsapplication',
  'kind:springbootapplication',
  'kind:pythonapplication',
  'kind:goapplication',
]);

function isAppTierEntity(entity: Entity): boolean {
  return (entity.metadata.tags ?? []).some(t => APP_TIER_KIND_TAGS.has(t));
}

// Every app the fleet dashboard (Fleet Grid / Ops Wall) aggregates across -
// the same catalog query + isKubernetesAvailable filter AppPicker.tsx uses
// for "every app Tower can show you individually", plus the app-tier tag
// filter above (AppPicker itself deliberately keeps showing everything -
// user's explicit call, 2026-09-13 - this hook is fleet-dashboard-only).
export interface UseFleetRosterResult {
  entities: Entity[];
  loading: boolean;
  error?: string;
}

export function useFleetRoster(): UseFleetRosterResult {
  const catalogApi = useApi(catalogApiRef);
  const [entities, setEntities] = useState<Entity[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    catalogApi
      .getEntities({ filter: { kind: 'Component' } })
      .then(res => {
        if (!cancelled) setEntities(res.items.filter(isKubernetesAvailable).filter(isAppTierEntity));
      })
      .catch(e => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [catalogApi]);

  return { entities: entities ?? [], loading: entities === undefined, error };
}
