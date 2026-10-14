const CYCLES = [
  [
    "Aspen",
    "Birch",
    "Cedar",
    "Dogwood",
    "Elm",
    "Fir",
    "Ginkgo",
    "Hazel",
    "Ironwood",
    "Juniper",
    "Kapok",
    "Larch",
    "Maple",
    "Nutmeg",
    "Oak",
    "Pine",
    "Quince",
    "Redwood",
    "Spruce",
    "Teak",
    "Willow",
    "Yew",
    "Zelkova"
  ],
  [
    "Alder",
    "Beech",
    "Cypress",
    "Deodar",
    "Ebony",
    "Fig",
    "Guava",
    "Holly",
    "Iroko",
    "Jacaranda",
    "Katsura",
    "Linden",
    "Magnolia",
    "Neem",
    "Olive",
    "Poplar",
    "Quandong",
    "Rowan",
    "Sequoia",
    "Tamarack",
    "Walnut",
    "Yellowwood"
  ],
  [
    "Acacia",
    "Baobab",
    "Chestnut",
    "Damson",
    "Elder",
    "Filbert",
    "Gum",
    "Hickory",
    "Ilex",
    "Jujube",
    "Koa",
    "Laurel",
    "Mahogany",
    "Nikau",
    "Osage",
    "Pecan",
    "Quebracho",
    "Rimu",
    "Sycamore",
    "Tupelo",
    "Wattle",
    "Yate"
  ]
];
const RELEASE_NAMES = CYCLES.flat();
const NUMERALS = ["", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
function releaseNameFor(ordinal) {
  const n = Math.max(0, Math.floor(ordinal));
  const base = RELEASE_NAMES[n % RELEASE_NAMES.length].toUpperCase();
  const round = Math.floor(n / RELEASE_NAMES.length);
  if (round === 0) return base;
  return `${base} ${NUMERALS[round] ?? String(round + 1)}`;
}
function assignReleaseNames(releases) {
  const earliest = /* @__PURE__ */ new Map();
  releases.forEach((r) => {
    const t = new Date(r.at).getTime();
    const ms = Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
    const prev = earliest.get(r.imageTag);
    if (prev === void 0 || ms < prev) earliest.set(r.imageTag, ms);
  });
  const ordered = [...earliest.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  return new Map(ordered.map(([tag], i) => [tag, releaseNameFor(i)]));
}

export { RELEASE_NAMES, assignReleaseNames, releaseNameFor };
//# sourceMappingURL=releaseNames.esm.js.map
