import { health, envStageRank } from '../../types.esm.js';

function healthColor(t, status) {
  switch (status) {
    case "healthy":
      return t.good;
    case "progressing":
      return t.sky;
    case "paused":
      return t.amber;
    case "degraded":
      return t.bad;
    case "none":
      return t.line;
    case "unknown":
    default:
      return t.textFaint;
  }
}
function healthLabel(status) {
  switch (status) {
    case "healthy":
      return "healthy";
    case "progressing":
      return "in progress";
    case "paused":
      return "paused";
    case "degraded":
      return "degraded";
    case "none":
      return "not deployed";
    case "unknown":
    default:
      return "unknown";
  }
}
const STATUS_SEVERITY = {
  none: -1,
  healthy: 0,
  unknown: 1,
  paused: 2,
  progressing: 3,
  degraded: 4
};
function worstStatus(statuses) {
  return statuses.reduce((worst, s) => STATUS_SEVERITY[s] > STATUS_SEVERITY[worst] ? s : worst, "none");
}
function tileStatus(app, envName) {
  const env = app.environments.find((e) => e.env === envName);
  return env ? health(env) : "none";
}
function latestEnv(app) {
  return [...app.environments].sort((a, b) => envStageRank(b.env) - envStageRank(a.env))[0];
}

export { healthColor, healthLabel, latestEnv, tileStatus, worstStatus };
//# sourceMappingURL=dashboardStyles.esm.js.map
