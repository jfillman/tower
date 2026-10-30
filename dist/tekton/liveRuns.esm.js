class LiveReadError extends Error {
  constructor(message, status) {
    super(status === 404 && !/not found/i.test(message) ? `${message} (not found)` : message);
    this.status = status;
  }
  status;
}
async function get(apis, path, accept = "application/json") {
  const base = await apis.discoveryApi.getBaseUrl("glidepath");
  const res = await apis.fetchApi.fetch(`${base}${path}`, { headers: { Accept: accept } });
  if (!res.ok) {
    const body = await res.json().catch(() => void 0);
    throw new LiveReadError(body?.error ?? `request failed with ${res.status}`, res.status);
  }
  return res;
}
async function fetchLiveRuns(apis, app) {
  return (await get(apis, `/live-runs?app=${encodeURIComponent(app)}`)).json();
}
async function fetchLiveLog(apis, app, taskRun, container) {
  const q = new URLSearchParams({ app, taskRun, container });
  return (await get(apis, `/live-log?${q}`, "text/plain")).text();
}
async function fetchFleetLiveRuns(apis) {
  return (await (await get(apis, "/fleet/live")).json()).pipelineRuns;
}
async function fetchFleetLiveTaskRuns(apis, pipelineRuns) {
  if (pipelineRuns.length === 0) return [];
  return (await (await get(apis, `/fleet/live/taskruns?pipelineRuns=${encodeURIComponent(pipelineRuns.join(","))}`)).json()).taskRuns;
}
async function fetchFleetHistory(apis, sinceHours, limit) {
  const q = new URLSearchParams({ sinceHours: String(sinceHours), limit: String(limit) });
  return (await (await get(apis, `/fleet/history?${q}`)).json()).runs;
}

export { LiveReadError, fetchFleetHistory, fetchFleetLiveRuns, fetchFleetLiveTaskRuns, fetchLiveLog, fetchLiveRuns };
//# sourceMappingURL=liveRuns.esm.js.map
