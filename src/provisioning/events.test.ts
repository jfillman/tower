import { buildEvents } from './events';
import type { ProvisioningStep } from './deriveProvisioning';

const step = (over: Partial<ProvisioningStep> & { id: string }): ProvisioningStep => ({
  title: over.id,
  desc: '',
  state: 'done',
  typicalSec: 10,
  fraction: 1,
  ...over,
});

describe('buildEvents', () => {
  it('lists starts and finishes in time order, however the steps are ordered', () => {
    const e = buildEvents(
      [
        step({ id: 'b', title: 'Build', startedAt: 200, endedAt: 500 }),
        step({ id: 'a', title: 'Cluster', startedAt: 100, endedAt: 150 }),
      ],
      1000,
    );
    expect(e.map(x => `${x.at} ${x.kind} ${x.text}`)).toEqual([
      '100 start Cluster started',
      '150 done Cluster done',
      '200 start Build started',
      '500 done Build done',
    ]);
  });
  it('leaves out what has no known time rather than inventing one', () => {
    const e = buildEvents([step({ id: 'catalog', title: 'Catalog', startedAt: undefined, endedAt: undefined })], 1000);
    expect(e).toEqual([]);
  });
  it('shows a running step as started only, and never lists a waiting one', () => {
    const e = buildEvents(
      [
        step({ id: 'a', title: 'Repos', state: 'run', startedAt: 100 }),
        step({ id: 'b', title: 'Build', state: 'pend', startedAt: 300 }),
      ],
      1000,
    );
    expect(e.map(x => x.text)).toEqual(['Repos started']);
  });
  it('stamps a failure with now and carries the reason', () => {
    const e = buildEvents([step({ id: 'a', title: 'Build', state: 'fail', startedAt: 100, detail: 'b1 failed' })], 900);
    expect(e[e.length - 1]).toMatchObject({ at: 900, kind: 'fail', text: 'Build failed: b1 failed' });
  });
  it('keeps same-instant events in step order', () => {
    const e = buildEvents(
      [step({ id: 'a', title: 'A', endedAt: 100 }), step({ id: 'b', title: 'B', endedAt: 100 })],
      1000,
    );
    expect(e.map(x => x.stepId)).toEqual(['a', 'b']);
  });
});
