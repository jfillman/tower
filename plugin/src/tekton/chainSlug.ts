// Client-side mirror of glidepath's catalog/lib/chain-slug.sh chain_id_to_slug:
// the deterministic two-word flow slug ("brave-fox") derived from a chain-id
// UUID's first 4 hex chars. Needed because a Tower Promote to an upper env
// (glidepathPromote.ts) mints a FRESH chain-id with no Tekton build/deploy/test
// flow behind it - so the release-progress-notify/release-outcome-notify runs
// it triggers have no sibling run anywhere to borrow a slug from, and
// linkFlowSlugsByChainId's borrowing alone left them chip-less (2026-09-24 bug:
// "the release-outcome-notify and release-progress-notify pipelineruns used to
// match the flow slug. that's missing again" - confirmed live against
// app-checkout-api-cicd's live cluster AND its full Tekton Results archive:
// chain 739101d3's only runs are that notify pair).
//
// The earlier reason for NOT duplicating this (useTektonPipelineRuns.ts:
// "the wordlists live only inside the toolbox image... would silently drift")
// still holds as a maintenance cost, so this is only ever a LAST-RESORT
// fallback behind a real slug (the start-flow chain-slug result, the name-
// embedded one, or a borrowed sibling's) - and both lists MUST be kept
// identical to chain-slug.sh's `_CHAIN_SLUG_ADJECTIVES`/`_CHAIN_SLUG_NOUNS`,
// in the same order (index = position). Verified against live slugs:
// c429209a -> brave-fox, b5758b8d -> ready-falcon, 0d563bd5 -> soft-seal.
const ADJECTIVES = [
  'swift', 'brave', 'calm', 'quiet', 'bold', 'keen', 'glad', 'warm', 'cool', 'sharp', 'quick', 'deep',
  'light', 'soft', 'firm', 'wise', 'kind', 'eager', 'plain', 'still', 'vivid', 'fresh', 'gentle', 'mighty', 'nimble', 'ready',
  'steady', 'sunny', 'lucky', 'merry', 'jolly', 'spry', 'tidy', 'brisk', 'hardy', 'lively', 'dapper', 'jaunty', 'plucky',
];
const NOUNS = [
  'otter', 'fox', 'wolf', 'hawk', 'lynx', 'bear', 'seal', 'crow', 'heron', 'finch', 'robin', 'swan', 'crane',
  'moose', 'bison', 'viper', 'cobra', 'shark', 'whale', 'eagle', 'raven', 'stork', 'ibis', 'egret', 'puma', 'civet', 'mole', 'vole',
  'newt', 'toad', 'gecko', 'heron', 'egret', 'quail', 'grebe', 'plover', 'osprey', 'falcon', 'kite', 'jay',
];

export function chainIdToSlug(chainId: string): string | undefined {
  if (!/^[0-9a-f]{4}/i.test(chainId)) return undefined;
  const adj = ADJECTIVES[parseInt(chainId.slice(0, 2), 16) % ADJECTIVES.length];
  const noun = NOUNS[parseInt(chainId.slice(2, 4), 16) % NOUNS.length];
  return `${adj}-${noun}`;
}
