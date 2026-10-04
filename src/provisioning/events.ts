import type { ProvisioningStep } from './deriveProvisioning';

export interface ProvisioningEvent {
  /** Epoch ms. */
  at: number;
  kind: 'start' | 'done' | 'fail';
  stepId: string;
  text: string;
}

/**
 * What happened, in order, built from the steps' own timestamps: a step began, a step finished,
 * a step failed. Only things with a known time are listed, so a step Tower has no timestamp for
 * simply has no line rather than a made-up one. `now` stamps a failure, which has no end time.
 */
export function buildEvents(steps: ProvisioningStep[], now: number): ProvisioningEvent[] {
  const events: ProvisioningEvent[] = [];
  for (const s of steps) {
    if (s.state !== 'pend' && s.startedAt !== undefined) {
      events.push({ at: s.startedAt, kind: 'start', stepId: s.id, text: `${s.title} started` });
    }
    if (s.state === 'done' && s.endedAt !== undefined) {
      events.push({ at: s.endedAt, kind: 'done', stepId: s.id, text: `${s.title} done` });
    }
    if (s.state === 'fail') {
      events.push({ at: now, kind: 'fail', stepId: s.id, text: `${s.title} failed${s.detail ? `: ${s.detail}` : ''}` });
    }
  }
  // Same-instant events (parallel steps ending together) keep their step order.
  return events.map((e, i) => ({ e, i })).sort((a, b) => a.e.at - b.e.at || a.i - b.i).map(x => x.e);
}
