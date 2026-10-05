// Which AnalysisTemplates a Rollout's canary steps and analysis refer to, and whether each one exists where Argo Rollouts will
// look for it. A reference without `clusterScope: true` is looked up as an AnalysisTemplate in the app's own namespace (so it must
// be declared under `analysisTemplates:` in the same values file); with `clusterScope: true` it is a ClusterAnalysisTemplate of the
// cluster. Getting either wrong makes Argo reject the whole Rollout (boarding-api pre-prod, 2026-10-05: "AnalysisTemplate
// 'pod-health-check' not found"), which until now only showed as a Degraded Application after the pull request merged.

export interface TemplateRef {
  name: string;
  cluster: boolean;
  /** Where it was found, for the message: "canary step 3", "canaryAnalysis", "blueGreen.prePromotionAnalysis". */
  where: string;
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function refsIn(templates: unknown, where: string): TemplateRef[] {
  if (!Array.isArray(templates)) return [];
  return templates.flatMap(t => {
    const name = rec(t).templateName;
    return typeof name === 'string' && name ? [{ name, cluster: rec(t).clusterScope === true, where }] : [];
  });
}

/** Every template reference in the steps (analysis steps), the canaryAnalysis and the blueGreen promotion analyses. */
export function templateRefs(steps: unknown, rolloutRest: Record<string, unknown>): TemplateRef[] {
  const out: TemplateRef[] = [];
  if (Array.isArray(steps)) {
    steps.forEach((s, i) => out.push(...refsIn(rec(rec(s).analysis).templates, `canary step ${i + 1}`)));
  }
  out.push(...refsIn(rec(rolloutRest.canaryAnalysis).templates, 'canaryAnalysis'));
  const bg = rec(rolloutRest.blueGreen);
  out.push(...refsIn(rec(bg.prePromotionAnalysis).templates, 'blueGreen.prePromotionAnalysis'));
  out.push(...refsIn(rec(bg.postPromotionAnalysis).templates, 'blueGreen.postPromotionAnalysis'));
  return out;
}

/**
 * Problems with the references. `clusterNames` is the cluster's ClusterAnalysisTemplates, or undefined when Tower could not read
 * them (then a cluster reference is not judged: it would be a guess).
 */
export function analysisProblems(refs: TemplateRef[], declared: string[], clusterNames: string[] | undefined, cluster?: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of refs) {
    const key = `${r.cluster}:${r.name}:${r.where}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.cluster) {
      if (clusterNames && !clusterNames.includes(r.name)) {
        const avail = clusterNames.length > 0 ? ` Available: ${clusterNames.join(', ')}.` : ' There are none on this cluster.';
        out.push(`${r.where}: "${r.name}" is not a ClusterAnalysisTemplate${cluster ? ` on ${cluster}` : ''}.${avail}`);
      }
    } else if (!declared.includes(r.name)) {
      const hint = clusterNames?.includes(r.name)
        ? ` It is a ClusterAnalysisTemplate: mark the reference as a cluster template (clusterScope: true), otherwise Argo looks for one in the app's namespace and rejects the Rollout.`
        : ` Declare it under Custom AnalysisTemplates, or use a cluster template.`;
      out.push(`${r.where}: AnalysisTemplate "${r.name}" is not declared in this file.${hint}`);
    }
  }
  return out;
}
