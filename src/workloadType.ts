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
