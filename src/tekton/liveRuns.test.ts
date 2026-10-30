import { fetchFleetHistory, fetchFleetLiveTaskRuns, fetchLiveLog, fetchLiveRuns, LiveReadError } from './liveRuns';
import { toFleetHistoryRun } from '../fleet/useFleetPipelineHistory';

const apis = (answer: (url: string) => Response) => {
  const fetch = jest.fn(async (url: string) => answer(url));
  return { fetch, apis: { discoveryApi: { getBaseUrl: async () => 'http://backend/api/glidepath' }, fetchApi: { fetch: fetch as any } } };
};

describe('liveRuns', () => {
  it('reads an app\'s live runs and a step\'s log through the backend', async () => {
    const { fetch, apis: a } = apis(url =>
      url.includes('/live-log') ? new Response('2026-10-30T01:00:00Z hi\n') : new Response(JSON.stringify({ pipelineRuns: [], taskRuns: [] })),
    );
    expect(await fetchLiveRuns(a, 'bags')).toEqual({ pipelineRuns: [], taskRuns: [] });
    expect(await fetchLiveLog(a, 'bags', 'p-build', 'step-build')).toBe('2026-10-30T01:00:00Z hi\n');
    expect(fetch.mock.calls.map(c => c[0])).toEqual([
      'http://backend/api/glidepath/live-runs?app=bags',
      'http://backend/api/glidepath/live-log?app=bags&taskRun=p-build&container=step-build',
    ]);
  });

  it('asks for no TaskRuns when no run needs them', async () => {
    const { fetch, apis: a } = apis(() => new Response('{}'));
    expect(await fetchFleetLiveTaskRuns(a, [])).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('says "not found" for a 404, which the log console reads as the pod being gone', async () => {
    const { apis: a } = apis(() => new Response(JSON.stringify({ error: 'GP-LOG-404: pod p-build-pod is gone' }), { status: 404 }));
    const err = await fetchLiveLog(a, 'bags', 'p-build', 'step-build').catch(e => e);
    expect(err).toBeInstanceOf(LiveReadError);
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/not found/i);
  });

  it('maps the fleet history, leaving out a run with no outcome yet', async () => {
    const rows = [
      { result: 'r1', name: 'ci-0-build-a', namespace: 'app-bags-cicd', app: 'bags', status: 'failed' as const, startTime: '2026-10-30T01:00:00Z', endTime: '2026-10-30T01:02:30Z' },
      { result: 'r2', name: 'promote-x', namespace: 'platform-catalog', status: 'succeeded' as const },
      { result: 'r3', name: 'ci-0-build-b', namespace: 'app-bags-cicd', status: 'unknown' as const },
    ];
    const { fetch, apis: a } = apis(() => new Response(JSON.stringify({ runs: rows })));
    expect(await fetchFleetHistory(a, 168, 1000)).toEqual(rows);
    expect(fetch.mock.calls[0][0]).toBe('http://backend/api/glidepath/fleet/history?sinceHours=168&limit=1000');
    expect(toFleetHistoryRun(rows[0])).toMatchObject({ key: 'app-bags-cicd/ci-0-build-a', app: 'bags', status: 'failed', durationSec: 150 });
    expect(toFleetHistoryRun(rows[1])).toMatchObject({ key: 'platform-catalog/promote-x', app: 'platform-catalog' });
    expect(toFleetHistoryRun(rows[2])).toBeUndefined();
  });
});
