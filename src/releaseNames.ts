// Release nicknames: a tree name per Flight release, handed out in order per app the way
// hurricanes are named - ASPEN, BIRCH, CEDAR... - so the first letter shows where a
// release falls in the app's history. A different word family from image slugs
// (lowercase adjective-animal pairs, tekton/chainSlug.ts), which never use a tree name, so
// "CEDAR, shipped as amber-finch" can't be misread. U, V and X have no common tree and are
// skipped, as hurricane lists skip letters. After the last cycle the list starts again
// with a numeral: ASPEN II.
//
// The order is the mapping (a release's name is its position in the app's release
// history), so names are only ever appended at the end - see releaseNames.test.ts.
const CYCLES: readonly (readonly string[])[] = [
  [
    'Aspen', 'Birch', 'Cedar', 'Dogwood', 'Elm', 'Fir', 'Ginkgo', 'Hazel', 'Ironwood', 'Juniper', 'Kapok', 'Larch',
    'Maple', 'Nutmeg', 'Oak', 'Pine', 'Quince', 'Redwood', 'Spruce', 'Teak', 'Willow', 'Yew', 'Zelkova',
  ],
  [
    'Alder', 'Beech', 'Cypress', 'Deodar', 'Ebony', 'Fig', 'Guava', 'Holly', 'Iroko', 'Jacaranda', 'Katsura', 'Linden',
    'Magnolia', 'Neem', 'Olive', 'Poplar', 'Quandong', 'Rowan', 'Sequoia', 'Tamarack', 'Walnut', 'Yellowwood',
  ],
  [
    'Acacia', 'Baobab', 'Chestnut', 'Damson', 'Elder', 'Filbert', 'Gum', 'Hickory', 'Ilex', 'Jujube', 'Koa', 'Laurel',
    'Mahogany', 'Nikau', 'Osage', 'Pecan', 'Quebracho', 'Rimu', 'Sycamore', 'Tupelo', 'Wattle', 'Yate',
  ],
];

export const RELEASE_NAMES: readonly string[] = CYCLES.flat();

const NUMERALS = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** The name of an app's release by its 0-based position in that app's release history. */
export function releaseNameFor(ordinal: number): string {
  const n = Math.max(0, Math.floor(ordinal));
  const base = RELEASE_NAMES[n % RELEASE_NAMES.length].toUpperCase();
  const round = Math.floor(n / RELEASE_NAMES.length);
  if (round === 0) return base;
  return `${base} ${NUMERALS[round] ?? String(round + 1)}`;
}

/** One release in an app's history, for naming: when it happened and how to tell it apart. */
export interface NamedReleaseInput {
  imageTag: string;
  /** When the release first reached a Flight environment (or the record was generated). */
  at: string;
}

/**
 * Names every release in an app's history: oldest first, ASPEN onward. Ties on time
 * (records the poller wrote in the same tick) fall back to the image tag so the order,
 * and so the names, never depend on how the list arrived. Duplicate tags are counted once.
 */
export function assignReleaseNames(releases: NamedReleaseInput[]): Map<string, string> {
  const earliest = new Map<string, number>();
  releases.forEach(r => {
    const t = new Date(r.at).getTime();
    const ms = Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
    const prev = earliest.get(r.imageTag);
    if (prev === undefined || ms < prev) earliest.set(r.imageTag, ms);
  });
  const ordered = [...earliest.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  return new Map(ordered.map(([tag], i) => [tag, releaseNameFor(i)]));
}
