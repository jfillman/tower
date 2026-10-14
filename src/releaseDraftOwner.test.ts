import { draftStillBelongsTo } from './useReleaseNames';

const names = {
  byTag: new Map([
    ['1.1.4-9d3dcde', 'HAZEL'],
    ['1.1.5-c5cc781', 'IRONWOOD'],
  ]),
  next: 'JUNIPER',
  index: [{ imageTag: '1.1.4-9d3dcde', env: 'staging', generatedAt: '2026-10-14T17:14:00Z', store: 'gitops' as const }],
};

describe('which release a saved draft belongs to', () => {
  it('is the release on Flight whose record is not written yet (found live: IRONWOOD notes shown under JUNIPER)', () => {
    expect(draftStillBelongsTo(names, true, [])).toBe('IRONWOOD');
  });
  it('is the next release once the record PR is open, or when there is no draft', () => {
    expect(draftStillBelongsTo(names, true, ['Release Record: boarding-api @ 1.1.5-c5cc781'])).toBeUndefined();
    expect(draftStillBelongsTo(names, false, [])).toBeUndefined();
    expect(draftStillBelongsTo({ ...names, byTag: new Map([['1.1.4-9d3dcde', 'HAZEL']]) }, true, [])).toBeUndefined();
  });
});
