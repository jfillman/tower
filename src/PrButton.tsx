import type { PullRequestSummary } from './pullRequests/usePullRequests';
import { parseGitopsPrTitle } from './useReleaseContext';
import { PrRef, prFromSummary } from './ui/PrRef';

// A known PR (from usePullRequests) as a PrRef card. Kept as its own name because seven views place it; the look is
// PrRef's (src/ui/PrRef.tsx). `merged` overrides pr.state; `showTarget` adds the release PR's target env to the title.
export function PrButton({
  pr,
  merged = pr.state === 'merged',
  showTarget = false,
  className,
}: {
  pr: PullRequestSummary;
  merged?: boolean;
  showTarget?: boolean;
  className?: string;
}) {
  const target = showTarget && pr.repo === 'gitops' ? parseGitopsPrTitle(pr.title)?.targetEnv : undefined;
  const base = prFromSummary(pr);
  return (
    <PrRef
      pr={{ ...base, state: merged ? 'merged' : base.state, title: target ? `${pr.title} → ${target}` : pr.title }}
      size="card"
      className={className}
    />
  );
}
