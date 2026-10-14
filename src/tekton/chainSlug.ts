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
// in the same order (index = position). 256 words each since 2026-10-13
// (65,536 slugs, no duplicates - the first lists repeated heron and egret and
// gave about 1,500 slugs). chainSlug.test.ts pins the same chain-id -> slug
// vectors as glidepath's hack/ci/chain_slug_test.sh. Chains started before the
// toolbox image carrying the new lists keep their old slug in their own run
// results; only this fallback would name them differently now.
export const ADJECTIVES = [
  'able', 'agile', 'airy', 'alert', 'alive', 'amber', 'ample', 'apt', 'ardent', 'arid', 'astral', 'avid',
  'azure', 'balmy', 'beige', 'bold', 'brave', 'breezy', 'bright', 'brisk', 'bronze', 'bubbly', 'busy', 'calm',
  'candid', 'canny', 'cheery', 'chief', 'chilly', 'chirpy', 'civil', 'clean', 'clear', 'clever', 'cloudy',
  'cobalt', 'comfy', 'cool', 'copper', 'cosmic', 'cozy', 'crisp', 'curly', 'cushy', 'cyan', 'dainty',
  'dapper', 'daring', 'dawn', 'deep', 'deft', 'dewy', 'direct', 'divine', 'dreamy', 'dusky', 'dusty', 'early',
  'eager', 'easy', 'elated', 'elfin', 'epic', 'equal', 'even', 'exact', 'fair', 'famed', 'fancy', 'fast',
  'fiery', 'fine', 'firm', 'first', 'fleet', 'fluent', 'fond', 'frank', 'free', 'fresh', 'frisky', 'frosty',
  'gentle', 'giant', 'gifted', 'glad', 'glossy', 'golden', 'good', 'grand', 'great', 'green', 'handy',
  'happy', 'hardy', 'hazy', 'hearty', 'hefty', 'heroic', 'honest', 'humble', 'icy', 'ideal', 'indigo', 'inky',
  'ivory', 'jade', 'jaunty', 'jazzy', 'jolly', 'jovial', 'joyful', 'jumbo', 'just', 'keen', 'kind', 'kingly',
  'lavish', 'leafy', 'level', 'light', 'lilac', 'limber', 'lithe', 'lively', 'loyal', 'lucid', 'lucky',
  'lunar', 'lush', 'magic', 'modern', 'mellow', 'merry', 'mighty', 'mild', 'minty', 'misty', 'modest', 'mossy',
  'neat', 'nimble', 'noble', 'nifty', 'oaken', 'ochre', 'olden', 'open', 'ornate', 'pastel', 'peppy', 'perky',
  'placid', 'plain', 'plucky', 'plush', 'polar', 'polite', 'prime', 'proud', 'pure', 'quaint', 'quick',
  'quiet', 'rapid', 'rare', 'ready', 'regal', 'rosy', 'royal', 'ruddy', 'rugged', 'russet', 'rustic', 'salty',
  'sandy', 'savvy', 'scenic', 'serene', 'sharp', 'shiny', 'silky', 'silver', 'simple', 'sleek', 'smart',
  'smooth', 'snappy', 'snowy', 'snug', 'solar', 'solid', 'sonic', 'spry', 'steady', 'steely', 'still',
  'stoic', 'stout', 'sturdy', 'suave', 'subtle', 'sunny', 'super', 'supple', 'sure', 'tawny', 'tender',
  'tidy', 'tiny', 'tough', 'true', 'trusty', 'umber', 'upbeat', 'urban', 'vast', 'velvet', 'vernal', 'vital',
  'vivid', 'warm', 'wavy', 'wild', 'windy', 'winged', 'wise', 'witty', 'woody', 'young', 'zany', 'zesty',
  'zippy', 'agate', 'aglow', 'alpine', 'arctic', 'auburn', 'blithe', 'bonny', 'bouncy', 'brainy', 'choice',
  'coral', 'crafty', 'dandy', 'dulcet', 'fabled', 'feisty', 'lofty', 'gusty', 'sunlit', 'starry', 'astute',
  'hushed', 'cheeky',
];
export const NOUNS = [
  'heron', 'finch', 'robin', 'swan', 'crane', 'stork', 'ibis', 'egret', 'quail', 'grebe', 'plover', 'osprey',
  'falcon', 'kite', 'jay', 'hawk', 'crow', 'raven', 'eagle', 'owl', 'wren', 'lark', 'dove', 'tern', 'gull',
  'petrel', 'puffin', 'auk', 'loon', 'rail', 'coot', 'snipe', 'curlew', 'dunlin', 'knot', 'sora', 'vireo',
  'oriole', 'thrush', 'magpie', 'rook', 'pipit', 'linnet', 'siskin', 'towhee', 'junco', 'martin', 'merlin',
  'condor', 'parrot', 'macaw', 'kea', 'toucan', 'myna', 'bulbul', 'shrike', 'avocet', 'godwit', 'gannet',
  'skua', 'fulmar', 'teal', 'wigeon', 'eider', 'scoter', 'goose', 'brant', 'rhea', 'emu', 'kiwi', 'trogon',
  'motmot', 'jacana', 'hoopoe', 'drongo', 'weaver', 'canary', 'serin', 'grouse', 'chukar', 'otter', 'fox',
  'wolf', 'lynx', 'bear', 'seal', 'moose', 'bison', 'puma', 'civet', 'mole', 'vole', 'whale', 'badger',
  'beaver', 'marten', 'ferret', 'stoat', 'weasel', 'mink', 'ermine', 'hare', 'rabbit', 'pika', 'marmot',
  'gopher', 'lemur', 'loris', 'gibbon', 'baboon', 'okapi', 'zebra', 'camel', 'llama', 'alpaca', 'vicuna',
  'tapir', 'rhino', 'hippo', 'eland', 'kudu', 'impala', 'ibex', 'oryx', 'gnu', 'yak', 'dingo', 'coyote',
  'jackal', 'hyena', 'dhole', 'fennec', 'serval', 'ocelot', 'margay', 'jaguar', 'cougar', 'panda', 'koala',
  'wombat', 'numbat', 'quokka', 'possum', 'dugong', 'walrus', 'orca', 'beluga', 'sloth', 'genet', 'coati',
  'skunk', 'deer', 'elk', 'bongo', 'nyala', 'gaur', 'zebu', 'takin', 'saiga', 'goral', 'tahr', 'bobcat',
  'tiger', 'lion', 'salmon', 'trout', 'perch', 'pike', 'carp', 'tuna', 'marlin', 'bass', 'cod', 'hake',
  'sole', 'skate', 'ray', 'eel', 'shark', 'manta', 'squid', 'krill', 'crab', 'prawn', 'shrimp', 'oyster',
  'clam', 'mussel', 'urchin', 'wrasse', 'tetra', 'guppy', 'minnow', 'tarpon', 'mako', 'wahoo', 'snook',
  'bream', 'barbel', 'loach', 'newt', 'toad', 'gecko', 'viper', 'cobra', 'python', 'mamba', 'adder', 'skink',
  'iguana', 'anole', 'turtle', 'caiman', 'gavial', 'frog', 'beetle', 'moth', 'bee', 'wasp', 'hornet',
  'cicada', 'mantis', 'mayfly', 'locust', 'scarab', 'pony', 'foal', 'colt', 'lamb', 'stag', 'doe', 'boar',
  'ram', 'ox', 'bat', 'dipper', 'dodo', 'ouzel', 'chough', 'crake', 'ruff', 'smew', 'agouti', 'paca', 'mara',
  'degu', 'jerboa', 'gerbil', 'shrew', 'sable', 'duiker', 'dikdik', 'mullet', 'goby', 'blenny', 'smelt',
];

export function chainIdToSlug(chainId: string): string | undefined {
  if (!/^[0-9a-f]{4}/i.test(chainId)) return undefined;
  const adj = ADJECTIVES[parseInt(chainId.slice(0, 2), 16) % ADJECTIVES.length];
  const noun = NOUNS[parseInt(chainId.slice(2, 4), 16) % NOUNS.length];
  return `${adj}-${noun}`;
}
