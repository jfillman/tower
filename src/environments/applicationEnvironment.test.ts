import {
  APPLICATION_ENVIRONMENT_TEMPLATE,
  existingPrFrom,
  failureFromEvents,
  findExistingRequest,
  reuseExisting,
  launchApplicationEnvironment,
  prUrlFromEvents,
  templateValues,
  validateLaunchInput,
  waitForTask,
  type TaskEvent,
} from './applicationEnvironment';

const discoveryApi = { getBaseUrl: async (id: string) => `http://backstage/api/${id}` };
const input = { appName: 'air-traffic-api', env: 'staging', cluster: 'example-prod' };

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const api = (impl: (url: string, init?: RequestInit) => Promise<Response>) => ({
  discoveryApi,
  fetchApi: { fetch: jest.fn(impl) as unknown as typeof fetch },
});

const completion = (body: TaskEvent['body']): TaskEvent => ({ id: 9, type: 'completion', body });
const prLinks = {
  output: {
    links: [
      { title: 'Download YAML Manifest', url: 'data:application/yaml;base64,AAAA' },
      { title: 'Open Pull Request', url: 'https://github.com/example-org/gitops-cluster-dev-tenants/pull/42' },
    ],
  },
};

describe('templateValues', () => {
  it('uses the live template\'s parameters and asks it to open the pull request', () => {
    expect(templateValues(input)).toEqual({
      appName: 'air-traffic-api',
      appType: 'app',
      cluster: 'example-prod',
      configMapGenerator: false,
      env: 'staging',
      pushToGit: true,
    });
  });
});

describe('validateLaunchInput', () => {
  it('accepts a good request', () => expect(validateLaunchInput(input)).toBeUndefined());
  it.each([
    ['a missing app', { ...input, appName: '' }],
    ['an uppercase environment name', { ...input, env: 'Staging' }],
    ['an environment name starting with a digit', { ...input, env: '1st' }],
    ['an environment name over 31 characters', { ...input, env: 'a'.repeat(32) }],
    ['no cluster', { ...input, cluster: '' }],
  ])('refuses %s', (_n, bad) => expect(validateLaunchInput(bad)).toBeTruthy());
});

describe('launchApplicationEnvironment', () => {
  it('POSTs the template ref and values to the scaffolder as the signed-in user, and returns the task id', async () => {
    const a = api(async () => json(201, { id: 'task-1' }));
    await expect(launchApplicationEnvironment(a, input)).resolves.toBe('task-1');
    const [url, init] = (a.fetchApi.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://backstage/api/scaffolder/v2/tasks');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ templateRef: APPLICATION_ENVIRONMENT_TEMPLATE, values: templateValues(input) });
  });

  it('says plainly when Backstage refuses (the permission policy limits scaffolder writes to the admin)', async () => {
    await expect(launchApplicationEnvironment(api(async () => json(403, {})), input)).rejects.toThrow(/limited to the platform admin/);
  });

  it('surfaces the backend message for other failures', async () => {
    await expect(
      launchApplicationEnvironment(api(async () => json(500, { error: { message: 'template not found' } })), input),
    ).rejects.toThrow('template not found');
  });

  it('does not call the scaffolder at all for a request that fails validation', async () => {
    const a = api(async () => json(201, { id: 'x' }));
    await expect(launchApplicationEnvironment(a, { ...input, env: 'Bad_Name' })).rejects.toThrow(/lowercase/);
    expect(a.fetchApi.fetch).not.toHaveBeenCalled();
  });
});

describe('reading the outcome', () => {
  it('finds the pull request in the completion output', () => {
    expect(prUrlFromEvents([{ id: 1, type: 'log' }, completion(prLinks)])).toBe(
      'https://github.com/example-org/gitops-cluster-dev-tenants/pull/42',
    );
  });
  it('falls back to any link that is a pull request when the title differs', () => {
    expect(prUrlFromEvents([completion({ output: { links: [{ title: 'PR', url: 'https://github.com/o/r/pull/7' }] } })])).toBe(
      'https://github.com/o/r/pull/7',
    );
  });
  it('never mistakes the downloadable manifest for the PR', () => {
    expect(prUrlFromEvents([completion({ output: { links: [{ title: 'Download YAML Manifest', url: 'data:application/yaml;base64,AAAA' }] } })])).toBeUndefined();
  });
  it('reports a failed run', () => {
    expect(failureFromEvents([completion({ error: { message: 'repo not found' } })])).toBe('repo not found');
    expect(failureFromEvents([completion({ message: 'Run completed with status: failed' })])).toMatch(/failed/);
    expect(failureFromEvents([completion(prLinks)])).toBeUndefined();
    expect(failureFromEvents([{ id: 1, type: 'log' }])).toBeUndefined();
  });
});

describe('waitForTask', () => {
  it('follows the long-polled events with the last seen id until the completion, then returns the PR', async () => {
    const urls: string[] = [];
    const batches: TaskEvent[][] = [[{ id: 1, type: 'log' }, { id: 2, type: 'log' }], [{ id: 3, type: 'log' }], [completion(prLinks)]];
    const a = api(async url => {
      urls.push(url);
      return json(200, batches.shift() ?? []);
    });
    await expect(waitForTask(a, 'task-1')).resolves.toEqual({
      ok: true,
      prUrl: 'https://github.com/example-org/gitops-cluster-dev-tenants/pull/42',
    });
    expect(urls).toEqual([
      'http://backstage/api/scaffolder/v2/tasks/task-1/events',
      'http://backstage/api/scaffolder/v2/tasks/task-1/events?after=2',
      'http://backstage/api/scaffolder/v2/tasks/task-1/events?after=3',
    ]);
  });

  it('returns the failure when the run fails', async () => {
    const a = api(async () => json(200, [completion({ error: { message: 'cluster not registered' } })]));
    await expect(waitForTask(a, 't')).resolves.toEqual({ ok: false, error: 'cluster not registered' });
  });

  it('reports a finished run that opened no pull request instead of claiming success', async () => {
    const a = api(async () => json(200, [completion({ output: { links: [] } })]));
    const r = await waitForTask(a, 't');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/did not report a pull request/);
  });

  it('gives up with a clear message after the timeout', async () => {
    const a = api(async () => json(200, [{ id: 1, type: 'log' }]));
    const r = await waitForTask(a, 't', 5);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/did not finish in time/);
  });

  it('reports an HTTP failure while reading events', async () => {
    const r = await waitForTask(api(async () => json(502, {})), 't');
    expect(r).toEqual({ ok: false, error: 'Reading the template run failed with 502.' });
  });
});

describe('a request that already exists', () => {
  const input = { appName: 'gate-api', env: 'prod', cluster: 'edge-prod', owner: 'o' };

  it('reads the open pull request out of the "already exists" failure', () => {
    expect(
      existingPrFrom('Pull request creation failed; caused by Error: [octokit-plugin-create-pull-request] Pull request already exists: https://github.com/o/tenants/pull/7. Set update=true to enable updating.'),
    ).toBe('https://github.com/o/tenants/pull/7');
    expect(existingPrFrom('Not Found - https://docs.github.com/rest/git/blobs#create-a-blob')).toBeUndefined();
  });

  it('reuses a request on main for the same cluster, and refuses one for another cluster', () => {
    expect(reuseExisting(input, undefined)).toBeUndefined();
    expect(reuseExisting(input, { url: 'u', cluster: 'edge-prod' })).toEqual({ status: 'done', prUrl: 'u', existing: 'merged' });
    expect(reuseExisting(input, { url: 'u' })).toEqual({ status: 'done', prUrl: 'u', existing: 'merged' });
    const other = reuseExisting(input, { url: 'u', cluster: 'old-prod' });
    expect(other).toMatchObject({ status: 'failed' });
    expect((other as { error: string }).error).toMatch(/already has an ApplicationEnvironment request for cluster old-prod/);
  });

  it('looks the request up on the glidepath backend: 404 is none, other failures throw', async () => {
    const respond = (status: number, body?: unknown) => ({ fetch: jest.fn(async () => new Response(body ? JSON.stringify(body) : null, { status })) }) as any;
    const api404 = respond(404, { error: 'none' });
    await expect(findExistingRequest({ discoveryApi, fetchApi: api404 }, 'o', 'gate-api', 'prod')).resolves.toBeUndefined();
    expect(api404.fetch.mock.calls[0][0]).toBe('http://backstage/api/glidepath/config/env-xr?owner=o&appName=gate-api&env=prod');
    await expect(findExistingRequest({ discoveryApi, fetchApi: respond(502, { error: 'x' }) }, 'o', 'gate-api', 'prod')).rejects.toThrow();
    await expect(
      findExistingRequest({ discoveryApi, fetchApi: respond(200, { path: 'p', url: 'https://github.com/o/t/blob/main/p', cluster: 'edge-prod' }) }, 'o', 'gate-api', 'prod'),
    ).resolves.toEqual({ url: 'https://github.com/o/t/blob/main/p', cluster: 'edge-prod' });
  });
});
