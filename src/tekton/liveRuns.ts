import type { RawPipelineRun, RawTaskRun } from './useTektonPipelineRuns';

// Runs still going, from glidepath-api (P6b, 2026-10-30) through the backend's /live-runs, /live-log, /fleet/live and
// /fleet/history routes. Tower read these from the control-plane cluster through the Kubernetes proxy itself until
// then; glidepath-api is now the one reader of Tekton, and Tower holds no Tekton grant of its own.

type Apis = {
  discoveryApi: { getBaseUrl(id: string): Promise<string> };
  fetchApi: { fetch: typeof fetch };
};

/** An error the backend answered, with its status: a 404 says "not found", which the log console looks for. */
export class LiveReadError extends Error {
  constructor(message: string, readonly status: number) {
    super(status === 404 && !/not found/i.test(message) ? `${message} (not found)` : message);
  }
}

async function get(apis: Apis, path: string, accept = 'application/json'): Promise<Response> {
  const base = await apis.discoveryApi.getBaseUrl('glidepath');
  const res = await apis.fetchApi.fetch(`${base}${path}`, { headers: { Accept: accept } });
  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw new LiveReadError(body?.error ?? `request failed with ${res.status}`, res.status);
  }
  return res;
}

/** Every PipelineRun and TaskRun in the app's -cicd namespace now. */
export async function fetchLiveRuns(apis: Apis, app: string): Promise<{ pipelineRuns: RawPipelineRun[]; taskRuns: RawTaskRun[] }> {
  return (await get(apis, `/live-runs?app=${encodeURIComponent(app)}`)).json();
}

/** One step's log from a TaskRun's pod, with Kubernetes' timestamps (`timestamps=true`). */
export async function fetchLiveLog(apis: Apis, app: string, taskRun: string, container: string): Promise<string> {
  const q = new URLSearchParams({ app, taskRun, container });
  return (await get(apis, `/live-log?${q}`, 'text/plain')).text();
}

/** Every PipelineRun on the cluster now. */
export async function fetchFleetLiveRuns(apis: Apis): Promise<RawPipelineRun[]> {
  return (await (await get(apis, '/fleet/live')).json()).pipelineRuns;
}

/** The TaskRuns of the named PipelineRuns, cluster-wide. */
export async function fetchFleetLiveTaskRuns(apis: Apis, pipelineRuns: string[]): Promise<RawTaskRun[]> {
  if (pipelineRuns.length === 0) return [];
  return (await (await get(apis, `/fleet/live/taskruns?pipelineRuns=${encodeURIComponent(pipelineRuns.join(','))}`)).json()).taskRuns;
}

/** A finished run in the fleet history, as glidepath-api lists it. */
export interface FleetHistoryRow {
  result: string;
  name: string;
  namespace: string;
  app?: string;
  pipeline?: string;
  status: 'succeeded' | 'failed' | 'cancelled' | 'unknown';
  startTime?: string;
  endTime?: string;
  commit?: string;
  eventType?: string;
  prNumber?: string;
}

/** The fleet's finished runs in the last `sinceHours` whole hours, newest first. */
export async function fetchFleetHistory(apis: Apis, sinceHours: number, limit: number): Promise<FleetHistoryRow[]> {
  const q = new URLSearchParams({ sinceHours: String(sinceHours), limit: String(limit) });
  return (await (await get(apis, `/fleet/history?${q}`)).json()).runs;
}

/** One object that appeared or moved (upsert) or went (delete): glidepath-api's live stream `change` event. */
export interface LiveChange {
  type: 'upsert' | 'delete';
  kind: 'PipelineRun' | 'TaskRun';
  name: string;
  object?: RawPipelineRun | RawTaskRun;
}

export interface LiveStreamHandlers {
  onSnapshot(s: { pipelineRuns: RawPipelineRun[]; taskRuns: RawTaskRun[] }): void;
  onChange(c: LiveChange): void;
}

/**
 * Splits server-sent events out of text as it arrives: feed it chunks, it calls `emit(event, data)` per complete event
 * and keeps the rest. Comment lines (": ping") are dropped; an event with no `event:` line is "message".
 */
export function sseParser(emit: (event: string, data: string) => void): (chunk: string) => void {
  let buf = '';
  return chunk => {
    buf += chunk.replace(/\r\n/g, '\n');
    let end = buf.indexOf('\n\n');
    while (end >= 0) {
      const block = buf.slice(0, end);
      buf = buf.slice(end + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (data.length > 0) emit(event, data.join('\n'));
      end = buf.indexOf('\n\n');
    }
  };
}

/**
 * The app's runs pushed (2026-10-31): the backend's /live-stream, glidepath-api's GET /v1/apps/{app}/live/stream, a
 * snapshot and then each change, instead of polling /live-runs. Resolves when the stream ends (the server closed it,
 * a lagging viewer, a restart); rejects when it can't be opened, which tells the caller to poll instead. A fetch body
 * read, not EventSource: EventSource can't carry Backstage's auth header.
 */
export async function streamLiveRuns(apis: Apis, app: string, handlers: LiveStreamHandlers, signal: AbortSignal): Promise<void> {
  const base = await apis.discoveryApi.getBaseUrl('glidepath');
  const res = await apis.fetchApi.fetch(`${base}/live-stream?app=${encodeURIComponent(app)}`, {
    headers: { Accept: 'text/event-stream' },
    signal,
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => undefined);
    throw new LiveReadError(body?.error ?? `live stream failed with ${res.status}`, res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const feed = sseParser((event, data) => {
    try {
      if (event === 'snapshot') handlers.onSnapshot(JSON.parse(data));
      else if (event === 'change') handlers.onChange(JSON.parse(data));
    } catch {
      // A malformed event is skipped; the next snapshot (on reconnect) is the whole state again.
    }
  });
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    feed(decoder.decode(value, { stream: true }));
  }
}
