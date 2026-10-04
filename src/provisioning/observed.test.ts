import { updateObservation } from './observed';
import type { ProvisioningStep } from './deriveProvisioning';

const step = (id: string, state: ProvisioningStep['state']): ProvisioningStep => ({
  id,
  title: id,
  desc: '',
  state,
  typicalSec: 1,
  fraction: 0,
});

describe('updateObservation', () => {
  it('records when it saw a step start running and later finish', () => {
    const a = updateObservation(undefined, [step('catalog', 'run')], 1000);
    expect(a.catalog).toEqual({ sawRunning: true, startedAt: 1000 });
    const b = updateObservation(a, [step('catalog', 'run')], 2000);
    expect(b.catalog.startedAt).toBe(1000); // not moved by a later poll
    const c = updateObservation(b, [step('catalog', 'done')], 3000);
    expect(c.catalog).toEqual({ sawRunning: true, startedAt: 1000, endedAt: 3000 });
  });
  it('ignores a step first seen already done: that says nothing about how long it took', () => {
    const o = updateObservation(undefined, [step('catalog', 'done')], 1000);
    expect(o.catalog).toBeUndefined();
  });
  it('does not keep moving the end time once recorded', () => {
    const a = updateObservation({ x: { sawRunning: true, startedAt: 1 } }, [step('x', 'done')], 5);
    const b = updateObservation(a, [step('x', 'done')], 99);
    expect(b.x.endedAt).toBe(5);
  });
  it('leaves waiting steps out', () => {
    expect(updateObservation(undefined, [step('build', 'pend')], 1)).toEqual({});
  });
});
