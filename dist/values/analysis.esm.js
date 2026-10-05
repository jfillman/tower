const rec = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
function refsIn(templates, where) {
  if (!Array.isArray(templates)) return [];
  return templates.flatMap((t) => {
    const name = rec(t).templateName;
    return typeof name === "string" && name ? [{ name, cluster: rec(t).clusterScope === true, where }] : [];
  });
}
function templateRefs(steps, rolloutRest) {
  const out = [];
  if (Array.isArray(steps)) {
    steps.forEach((s, i) => out.push(...refsIn(rec(rec(s).analysis).templates, `canary step ${i + 1}`)));
  }
  out.push(...refsIn(rec(rolloutRest.canaryAnalysis).templates, "canaryAnalysis"));
  const bg = rec(rolloutRest.blueGreen);
  out.push(...refsIn(rec(bg.prePromotionAnalysis).templates, "blueGreen.prePromotionAnalysis"));
  out.push(...refsIn(rec(bg.postPromotionAnalysis).templates, "blueGreen.postPromotionAnalysis"));
  return out;
}
function analysisProblems(refs, declared, clusterNames, cluster) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const r of refs) {
    const key = `${r.cluster}:${r.name}:${r.where}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.cluster) {
      if (clusterNames && !clusterNames.includes(r.name)) {
        const avail = clusterNames.length > 0 ? ` Available: ${clusterNames.join(", ")}.` : " There are none on this cluster.";
        out.push(`${r.where}: "${r.name}" is not a ClusterAnalysisTemplate${cluster ? ` on ${cluster}` : ""}.${avail}`);
      }
    } else if (!declared.includes(r.name)) {
      const hint = clusterNames?.includes(r.name) ? ` It is a ClusterAnalysisTemplate: mark the reference as a cluster template (clusterScope: true), otherwise Argo looks for one in the app's namespace and rejects the Rollout.` : ` Declare it under Custom AnalysisTemplates, or use a cluster template.`;
      out.push(`${r.where}: AnalysisTemplate "${r.name}" is not declared in this file.${hint}`);
    }
  }
  return out;
}

export { analysisProblems, templateRefs };
//# sourceMappingURL=analysis.esm.js.map
