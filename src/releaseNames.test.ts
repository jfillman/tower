import { assignReleaseNames, RELEASE_NAMES, releaseNameFor } from './releaseNames';
import { ADJECTIVES, NOUNS } from './tekton/chainSlug';

describe('release names', () => {
  it('starts every app at ASPEN, BIRCH, CEDAR', () => {
    expect([0, 1, 2].map(releaseNameFor)).toEqual(['ASPEN', 'BIRCH', 'CEDAR']);
  });

  it('runs alphabetically within each cycle', () => {
    let previous = '';
    let cycles = 0;
    RELEASE_NAMES.forEach(name => {
      if (name[0] < previous[0]) cycles += 1;
      else expect(name[0] > previous[0] || previous === '').toBe(true);
      previous = name;
    });
    expect(cycles).toBe(2);
  });

  it('has no duplicate names', () => {
    const lower = RELEASE_NAMES.map(n => n.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });

  // Release names and image slugs are separate word families on purpose.
  it('never uses a word an image slug can contain', () => {
    const slugWords = new Set([...ADJECTIVES, ...NOUNS]);
    expect(RELEASE_NAMES.filter(n => slugWords.has(n.toLowerCase()))).toEqual([]);
  });

  // Names are positions in the list: changing an existing entry renames every later release.
  it('keeps the first names stable', () => {
    expect(RELEASE_NAMES.slice(0, 5)).toEqual(['Aspen', 'Birch', 'Cedar', 'Dogwood', 'Elm']);
    expect(RELEASE_NAMES.length).toBe(67);
  });

  it('starts over with a numeral after the last name', () => {
    expect(releaseNameFor(RELEASE_NAMES.length)).toBe('ASPEN II');
    expect(releaseNameFor(RELEASE_NAMES.length * 2 + 1)).toBe('BIRCH III');
  });

  it('names releases oldest first, counting a repeated tag once', () => {
    const names = assignReleaseNames([
      { imageTag: '1.1.0-bbbbbbb', at: '2026-10-02T00:00:00Z' },
      { imageTag: '1.0.0-aaaaaaa', at: '2026-10-01T00:00:00Z' },
      { imageTag: '1.1.0-bbbbbbb', at: '2026-10-05T00:00:00Z' },
      { imageTag: '1.2.0-ccccccc', at: '2026-10-03T00:00:00Z' },
    ]);
    expect([...names.entries()]).toEqual([
      ['1.0.0-aaaaaaa', 'ASPEN'],
      ['1.1.0-bbbbbbb', 'BIRCH'],
      ['1.2.0-ccccccc', 'CEDAR'],
    ]);
  });

  it('breaks a tie on time by image tag, whatever order the list came in', () => {
    const at = '2026-10-01T00:00:00Z';
    const a = assignReleaseNames([{ imageTag: 'b-1111111', at }, { imageTag: 'a-2222222', at }]);
    const b = assignReleaseNames([{ imageTag: 'a-2222222', at }, { imageTag: 'b-1111111', at }]);
    expect([...a.entries()]).toEqual([...b.entries()]);
    expect(a.get('a-2222222')).toBe('ASPEN');
  });
});
