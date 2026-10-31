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
function sseParser(emit) {
  let buf = "";
  return (chunk) => {
    buf += chunk.replace(/\r\n/g, "\n");
    let end = buf.indexOf("\n\n");
    while (end >= 0) {
      const block = buf.slice(0, end);
      buf = buf.slice(end + 2);
      let event = "message";
      const data = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (data.length > 0) emit(event, data.join("\n"));
      end = buf.indexOf("\n\n");
    }
  };
}
async function streamLiveRuns(apis, app, handlers, signal) {
  const base = await apis.discoveryApi.getBaseUrl("glidepath");
  const res = await apis.fetchApi.fetch(`${base}/live-stream?app=${encodeURIComponent(app)}`, {
    headers: { Accept: "text/event-stream" },
    signal
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => void 0);
    throw new LiveReadError(body?.error ?? `live stream failed with ${res.status}`, res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const feed = sseParser((event, data) => {
    try {
      if (event === "snapshot") handlers.onSnapshot(JSON.parse(data));
      else if (event === "change") handlers.onChange(JSON.parse(data));
    } catch {
    }
  });
  for (; ; ) {
    const { value, done } = await reader.read();
    if (done) return;
    feed(decoder.decode(value, { stream: true }));
  }
}

export { LiveReadError, fetchFleetHistory, fetchFleetLiveRuns, fetchFleetLiveTaskRuns, fetchLiveLog, fetchLiveRuns, sseParser, streamLiveRuns };
//# sourceMappingURL=liveRuns.esm.js.map
