import { notStartedFor } from './StageDetail';
import type { CdDelivery } from '../../useCdDelivery';

const delivery = (statuses: Record<string, 'good' | 'current' | 'bad' | 'pending'>): CdDelivery =>
  ({
    steps: [
      { key: 'created', label: 'PR created' },
      { key: 'guardrails', label: 'Guardrails' },
      { key: 'merged', label: 'PR merged' },
      { key: 'synced', label: 'Application sync' },
      { key: 'progressing', label: 'Rollout starts' },
      { key: 'healthy', label: 'Rollout completes' },
    ].map(s => ({ ...s, status: statuses[s.key] ?? 'pending' })),
  }) as unknown as CdDelivery;

describe('notStartedFor (a new release has not reached the Rollout yet)', () => {
  it('names the step the release waits on, before its merge', () => {
    const d = delivery({ created: 'good', guardrails: 'good', merged: 'current' });
    expect(notStartedFor(d, 'progressing', '1.0.6', '1.0.5')).toEqual({ waitingFor: 'PR merged' });
    expect(notStartedFor(d, 'healthy', '1.0.6', '1.0.5')).toEqual({ waitingFor: 'PR merged' });
  });

  it('waits on the sync once merged', () => {
    const d = delivery({ created: 'good', guardrails: 'good', merged: 'good', synced: 'current' });
    expect(notStartedFor(d, 'progressing', '1.0.6', '1.0.5')).toEqual({ waitingFor: 'Application sync' });
  });

  it('shows the live Rollout as-is once the stage is reached', () => {
    const d = delivery({ created: 'good', guardrails: 'good', merged: 'good', synced: 'good', progressing: 'current' });
    expect(notStartedFor(d, 'progressing', '1.0.6', '1.0.5')).toBeUndefined();
  });

  it('shows it as-is when what runs is already this release', () => {
    const d = delivery({ created: 'good' });
    expect(notStartedFor(d, 'progressing', '1.0.6', '1.0.6')).toBeUndefined();
    expect(notStartedFor(d, 'progressing', undefined, '1.0.5')).toBeUndefined();
  });
});
