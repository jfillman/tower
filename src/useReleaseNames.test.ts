import { namesFromHistory, type ReleaseRecordIndexEntry } from './useReleaseNames';
import type { ReleaseRecord } from './useReleaseRecords';

const entry = (imageTag: string, generatedAt: string): ReleaseRecordIndexEntry => ({
  imageTag,
  env: 'staging',
  generatedAt,
  store: 'gitops',
});
const record = (imageTag: string, createdAt: string) => ({ imageTag, createdAt }) as ReleaseRecord;

describe('namesFromHistory', () => {
  const index = [
    entry('1.1.0-aaaaaaa', '2026-10-05T01:00:00Z'),
    entry('1.1.2-ccccccc', '2026-10-05T03:00:00Z'),
    entry('1.1.4-eeeeeee', '2026-10-05T05:00:00Z'),
  ];

  it('names the committed history in order and the draft after it', () => {
    const names = namesFromHistory(index, []);
    expect([...names.byTag.values()]).toEqual(['ASPEN', 'BIRCH', 'CEDAR']);
    expect(names.next).toBe('DOGWOOD');
  });

  it('counts a release whose record PR is still open', () => {
    const names = namesFromHistory(index, [record('1.1.4-eeeeeee', '2026-10-05T04:58:00Z'), record('1.1.5-fffffff', '2026-10-06T00:00:00Z')]);
    expect(names.byTag.get('1.1.5-fffffff')).toBe('DOGWOOD');
    expect(names.next).toBe('ELM');
  });

  // gate-api 1.1.3 reached Flight but has no committed record. Naming it while it is on
  // screen would rename 1.1.4 onward once it leaves Tower's window.
  it('does not name an older release that never got a record', () => {
    const onScreen = namesFromHistory(index, [
      record('1.1.3-ddddddd', '2026-10-05T03:30:00Z'),
      record('1.1.4-eeeeeee', '2026-10-05T04:58:00Z'),
    ]);
    const offScreen = namesFromHistory(index, [record('1.1.4-eeeeeee', '2026-10-05T04:58:00Z')]);
    expect(onScreen.byTag.has('1.1.3-ddddddd')).toBe(false);
    expect([...onScreen.byTag.entries()]).toEqual([...offScreen.byTag.entries()]);
    expect(onScreen.next).toBe(offScreen.next);
  });
});
