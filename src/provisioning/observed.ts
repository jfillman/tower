import type { ProvisioningStep, StepObservation } from './deriveProvisioning';

/**
 * Folds what Tower sees on this poll into what it has seen before, step by step. Used for the
 * steps the cluster keeps no timestamp for (the catalog sync, a rollout turning healthy): the
 * time Tower first saw the step finished stands in for when it finished, but only if Tower had
 * already seen it running. A step first seen done is left alone, because "done" then says
 * nothing about how long it took.
 */
export function updateObservation(
  prev: Record<string, StepObservation> | undefined,
  steps: ProvisioningStep[],
  now: number,
): Record<string, StepObservation> {
  const next: Record<string, StepObservation> = { ...prev };
  for (const s of steps) {
    const o = { ...next[s.id] };
    if (s.state === 'run') {
      o.sawRunning = true;
      o.startedAt ??= now;
    } else if (s.state === 'done' && o.sawRunning) {
      o.endedAt ??= now;
    }
    if (o.sawRunning || o.endedAt !== undefined || o.startedAt !== undefined) next[s.id] = o;
  }
  return next;
}
