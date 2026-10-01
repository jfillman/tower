import type { Entity } from '@backstage/catalog-model';

// Tower's home groups services by what kind of workload they are, because
// the two kinds are managed by different plugins: container apps by Tower
// itself, AI workloads (agents) by the Autopilot plugin.
//
// Nothing in the catalog marks an entity as an AI workload yet, so this is
// the contract Airframe's agent workload XRD has to emit on the Component it
// produces: either annotation `hangar.io/workload-type: ai`, or a
// `spec.type` of `ai-agent`. Anything else is a container app, which keeps
// every service that exists today exactly where it is.
export type WorkloadType = 'container' | 'ai';

export const WORKLOAD_TYPE_ANNOTATION = 'hangar.io/workload-type';

export const WORKLOAD_LABELS: Record<WorkloadType, string> = {
  container: 'Container apps',
  ai: 'AI workloads',
};

export const WORKLOAD_LABEL_SINGULAR: Record<WorkloadType, string> = {
  container: 'Container app',
  ai: 'AI workload',
};

export function workloadTypeOf(entity: Entity): WorkloadType {
  if (entity.metadata.annotations?.[WORKLOAD_TYPE_ANNOTATION] === 'ai') return 'ai';
  if (entity.spec?.type === 'ai-agent') return 'ai';
  return 'container';
}

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

// What Tower's Services list shows: an allow-list, so a new XRD added to
// Airframe stays out of Tower until someone decides it belongs there. Anything
// registered by hand in the catalog is out too; Tower manages Airframe services.
//
// InfraService is in alongside the application XRDs (Skyport's broker and auth
// server are InfraServices). It is kept out of APP_TIER_KIND_TAGS on purpose:
// the fleet dashboard shares that set and is about applications.
const TOWER_EXTRA_KIND_TAGS = new Set(['kind:infraservice']);

export function isTowerService(entity: Entity): boolean {
  const tags = entity.metadata.tags ?? [];
  return isAppTierEntity(entity) || tags.some(t => TOWER_EXTRA_KIND_TAGS.has(t)) || workloadTypeOf(entity) === 'ai';
}
