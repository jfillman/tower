const DORA_WINDOWS = [7, 30, 90];
const DEFAULT_DORA_WINDOW = 30;
function isDoraWindow(n) {
  return DORA_WINDOWS.includes(n);
}
const DAY = 86400;
const WEEK = 7 * DAY;
function deployFrequencyBand(perDay) {
  if (perDay === void 0) return "neutral";
  if (perDay >= 7) return "good";
  return perDay >= 1 ? "fair" : "poor";
}
function leadTimeBand(seconds) {
  if (seconds === void 0) return "neutral";
  if (seconds < DAY) return "good";
  return seconds < WEEK ? "fair" : "poor";
}
function changeFailureBand(rate) {
  if (rate === void 0) return "neutral";
  if (rate < 0.15) return "good";
  return rate < 0.3 ? "fair" : "poor";
}
const restoreBand = (_seconds) => "neutral";
function appSelector(apps) {
  if (!apps) return "";
  if (apps.length === 0) return '{app="__none__"}';
  const escaped = [...new Set(apps)].sort().map((a) => a.replace(/[\\.*+?^${}()|[\]]/g, "\\$&"));
  return `{app=~"${escaped.join("|")}"}`;
}
function withMatcher(sel, matcher) {
  return sel ? `${sel.slice(0, -1)},${matcher}}` : `{${matcher}}`;
}
function doraQueries(windowDays, apps) {
  const w = `${windowDays}d`;
  const sel = appSelector(apps);
  const failedSel = withMatcher(sel, 'outcome="failed"');
  return {
    deploys: `sum(increase(dora_deployments_total${sel}[${w}]))`,
    deploysPrevious: `sum(increase(dora_deployments_total${sel}[${w}] offset ${w}))`,
    failures: `sum(increase(dora_releases_total${failedSel}[${w}]))`,
    releases: `sum(increase(dora_releases_total${sel}[${w}]))`,
    failuresPrevious: `sum(increase(dora_releases_total${failedSel}[${w}] offset ${w}))`,
    releasesPrevious: `sum(increase(dora_releases_total${sel}[${w}] offset ${w}))`,
    leadTimeP50: `histogram_quantile(0.5, sum(rate(dora_lead_time_seconds_bucket${sel}[${w}])) by (le))`,
    restoreP50: `histogram_quantile(0.5, sum(rate(dora_time_to_restore_seconds_experimental_bucket${sel}[${w}])) by (le))`,
    deploysByApp: `sum by (app) (increase(dora_deployments_total${sel}[${w}]))`,
    releasesByAppOutcome: `sum by (app, outcome) (increase(dora_releases_total${sel}[${w}]))`,
    leadTimeP50ByApp: `histogram_quantile(0.5, sum(rate(dora_lead_time_seconds_bucket${sel}[${w}])) by (app, le))`,
    restoreP50ByApp: `histogram_quantile(0.5, sum(rate(dora_time_to_restore_seconds_experimental_bucket${sel}[${w}])) by (app, le))`,
    deploysDaily: `sum(increase(dora_deployments_total${sel}[1d]))`,
    failuresDaily: `sum(increase(dora_releases_total${failedSel}[1d]))`
  };
}
function finite(v) {
  return v !== void 0 && Number.isFinite(v) ? v : void 0;
}
function ratio(num, den) {
  if (num === void 0 || den === void 0 || den <= 0) return void 0;
  return num / den;
}
function buildDoraSnapshot(windowDays, raw) {
  const s = raw.scalar;
  const deploys = finite(s.deploys);
  const deploysPrevious = finite(s.deploysPrevious);
  const rows = /* @__PURE__ */ new Map();
  const row = (app) => {
    let r = rows.get(app);
    if (!r) {
      r = { app, deploys: 0, failures: 0, releases: 0 };
      rows.set(app, r);
    }
    return r;
  };
  raw.deploysByApp.forEach(({ app, value }) => {
    row(app).deploys = Math.round(finite(value) ?? 0);
  });
  raw.releasesByAppOutcome.forEach(({ app, outcome, value }) => {
    const n = Math.round(finite(value) ?? 0);
    const r = row(app);
    r.releases += n;
    if (outcome === "failed") r.failures += n;
  });
  raw.leadTimeP50ByApp.forEach(({ app, value }) => {
    row(app).leadTimeP50Sec = finite(value);
  });
  raw.restoreP50ByApp.forEach(({ app, value }) => {
    row(app).restoreP50Sec = finite(value);
  });
  rows.forEach((r) => {
    r.changeFailureRate = ratio(r.failures, r.releases);
  });
  return {
    windowDays,
    deploys: deploys === void 0 ? void 0 : Math.round(deploys),
    deploysPerDay: ratio(deploys, windowDays),
    deploysPerDayPrevious: ratio(deploysPrevious, windowDays),
    releases: finite(s.releases),
    failures: finite(s.failures),
    changeFailureRate: ratio(finite(s.failures), finite(s.releases)),
    changeFailureRatePrevious: ratio(finite(s.failuresPrevious), finite(s.releasesPrevious)),
    leadTimeP50Sec: finite(s.leadTimeP50),
    restoreP50Sec: finite(s.restoreP50),
    apps: [...rows.values()].filter((r) => r.deploys > 0 || r.releases > 0).sort((a, b) => b.deploys - a.deploys || a.app.localeCompare(b.app)),
    deploysDaily: raw.deploysDaily,
    failuresDaily: raw.failuresDaily
  };
}

export { DEFAULT_DORA_WINDOW, DORA_WINDOWS, appSelector, buildDoraSnapshot, changeFailureBand, deployFrequencyBand, doraQueries, finite, isDoraWindow, leadTimeBand, ratio, restoreBand };
//# sourceMappingURL=dora.esm.js.map
