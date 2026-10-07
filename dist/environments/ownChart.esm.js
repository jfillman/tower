const AIRFRAME = { repoURL: "https://github.com/jfillman/airframe.git", path: "charts/airframe-application" };
function over(base, o) {
  if (!o) return base;
  if (o.repoURL) return o;
  const r = { ...base };
  if (o.path) {
    r.path = o.path;
    delete r.chart;
  }
  if (o.chart) {
    r.chart = o.chart;
    delete r.path;
  }
  if (o.targetRevision) r.targetRevision = o.targetRevision;
  return r;
}
function ownChartOf(deploy, env) {
  const d = deploy;
  if ((d?.target ?? "k8s-rollout") !== "k8s-rollout") return void 0;
  const r = over(over(AIRFRAME, d?.chart), d?.environments?.find((e) => e.name === env)?.chart);
  return r.repoURL === AIRFRAME.repoURL && !r.chart && r.path === AIRFRAME.path ? void 0 : r;
}
function describeChart(c) {
  return `${c.repoURL ?? ""} ${c.path ?? c.chart ?? ""}${c.targetRevision ? `@${c.targetRevision}` : ""}`.trim();
}

export { describeChart, ownChartOf };
//# sourceMappingURL=ownChart.esm.js.map
