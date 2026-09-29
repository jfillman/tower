// A release's nickname (nicknameForImageTag in useReleaseContext.ts) is only
// ever resolvable while its build's PipelineRun still exists in the
// cluster - real retention is time-bounded, not count-bounded (confirmed
// live: a cluster-wide hourly pipelinerun-pruner CronJob drops anything past
// a 24h window - see PipelineRunList.tsx's own header comment). Once that
// run is pruned there's no way to re-derive "lively finch" from anything -
// the adjective/noun wordlist that produced it lives only inside the
// toolbox image's cdevents.sh (see useTektonPipelineRuns.ts's own comment on
// why Tower doesn't try to duplicate it), so a chip that's aged out of the
// live cluster can never be recomputed, only remembered.
//
// This is a real, opportunistic cache, not true durability: it only ever
// has an answer for a release someone's browser already saw resolved while
// its PipelineRun was still alive. A release whose run was pruned before
// anyone ever opened Tower for it stays unresolved forever - no purely
// client-side fix can recover a fact the cluster itself no longer has.
// Genuine durability (works for every release, on a fresh browser) would
// mean writing the nickname somewhere the backend controls and never prunes
// (e.g. alongside deploy-history's own git-tracked record) - real backend
// work, not in scope here.

const KEY_PREFIX = 'hangar-tower:nickname:';

function storageKey(shortSha: string): string {
  return `${KEY_PREFIX}${shortSha.toLowerCase()}`;
}

export function recallNickname(shortSha: string): string | undefined {
  try {
    return localStorage.getItem(storageKey(shortSha)) ?? undefined;
  } catch {
    // Private browsing / storage disabled / quota exceeded - a cache miss
    // is always a safe fallback, never worth surfacing as an error.
    return undefined;
  }
}

export function rememberNickname(shortSha: string, nickname: string): void {
  try {
    localStorage.setItem(storageKey(shortSha), nickname);
  } catch {
    // Best-effort, same as above - losing the cache write just means this
    // one release won't survive its PipelineRun being pruned.
  }
}
