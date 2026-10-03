import type { Entity } from '@backstage/catalog-model';

// Which services the Fleet Dashboard counts. The Services list and tab selection live in
// serviceClass.ts; this file is only the dashboard's "is this an application" test.

// The four Airframe application XRDs: the services Tower's tabs (releases, pull
// requests, images, SLOs) actually apply to. Every Component the ingestor makes
// from an XR carries `kind:<xr kind>`. Deliberately excludes
// applicationenvironment (the per-environment record of an app, with no source
// repo of its own) and the auto-derived plumbing XRs (TektonCICD, SecretStore,
// SLO, RolloutWatch).
const APP_TIER_KIND_TAGS = new Set([
  'kind:nodejsapplication',
  'kind:springbootapplication',
  'kind:pythonapplication',
  'kind:goapplication',
]);

export function isAppTierEntity(entity: Entity): boolean {
  return (entity.metadata.tags ?? []).some(t => APP_TIER_KIND_TAGS.has(t));
}
