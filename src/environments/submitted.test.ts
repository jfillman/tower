import { loadSubmitted, pendingFrom, saveSubmitted, SUBMITTED_MAX_AGE_MS, type SubmittedChange } from './submitted';

const rec = (over: Partial<SubmittedChange> = {}): SubmittedChange => ({
  id: 'a',
  at: Date.now(),
  prUrl: 'https://github.com/o/app/pull/1',
  requests: {},
  added: [],
  removed: [],
  summary: [],
  ...over,
});
const ground = (name: string) => ({ name, tier: 'ground' as const });

describe('pendingFrom', () => {
  it('keeps an added environment pending until cicd.yaml declares it', () => {
    const r = rec({ added: [ground('qa')] });
    expect(pendingFrom([r], [ground('dev')]).adds.map(a => a.env.name)).toEqual(['qa']);
    const merged = pendingFrom([r], [ground('dev'), ground('qa')]);
    expect(merged.adds).toEqual([]);
    expect(merged.records).toEqual([]); // finished: dropped
  });

  it('keeps a removal pending until the environment is gone', () => {
    const r = rec({ removed: ['test'] });
    expect(pendingFrom([r], [ground('dev'), ground('test')]).removals).toEqual(['test']);
    expect(pendingFrom([r], [ground('dev')]).records).toEqual([]);
  });

  it('drops a record with nothing to wait for (a reorder or an edit)', () => {
    expect(pendingFrom([rec({ summary: ['Change the promotion order'] })], [ground('dev')]).records).toEqual([]);
  });

  it('does not list the same environment twice across records', () => {
    const out = pendingFrom([rec({ id: '1', added: [ground('qa')] }), rec({ id: '2', added: [ground('qa')] })], []);
    expect(out.adds).toHaveLength(1);
    expect(out.records).toHaveLength(2);
  });
});

describe('storage', () => {
  beforeEach(() => window.localStorage.clear());

  it('round-trips records per service', () => {
    const r = rec({ added: [ground('qa')] });
    saveSubmitted('o', 'app', [r]);
    expect(loadSubmitted('o', 'app')).toEqual([r]);
    expect(loadSubmitted('o', 'other')).toEqual([]);
  });

  it('forgets records past the age limit', () => {
    saveSubmitted('o', 'app', [rec({ at: Date.now() - SUBMITTED_MAX_AGE_MS - 1000 }), rec({ id: 'fresh' })]);
    expect(loadSubmitted('o', 'app').map(r => r.id)).toEqual(['fresh']);
  });

  it('saving an empty list clears the key, and bad data reads as empty', () => {
    saveSubmitted('o', 'app', [rec()]);
    saveSubmitted('o', 'app', []);
    expect(window.localStorage.length).toBe(0);
    window.localStorage.setItem('tower:environments:submitted:o/app', '{not json');
    expect(loadSubmitted('o', 'app')).toEqual([]);
  });

  it('works when storage throws', () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadSubmitted('o', 'app')).toEqual([]);
    spy.mockRestore();
  });
});
