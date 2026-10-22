import { jsx } from 'react/jsx-runtime';
import { parseGitopsPrTitle } from './useReleaseContext.esm.js';
import { prFromSummary, PrRef } from './ui/PrRef.esm.js';

function PrButton({
  pr,
  merged = pr.state === "merged",
  showTarget = false,
  className
}) {
  const target = showTarget && pr.repo === "gitops" ? parseGitopsPrTitle(pr.title)?.targetEnv : void 0;
  const base = prFromSummary(pr);
  return /* @__PURE__ */ jsx(
    PrRef,
    {
      pr: { ...base, state: merged ? "merged" : base.state, title: target ? `${pr.title} \u2192 ${target}` : pr.title },
      size: "card",
      className
    }
  );
}

export { PrButton };
//# sourceMappingURL=PrButton.esm.js.map
