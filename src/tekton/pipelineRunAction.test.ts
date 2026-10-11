import { pipelineRunAction } from './pipelineRunAction';

const discoveryApi = { getBaseUrl: async (id: string) => `http://be/api/${id}` };

describe('pipelineRunAction', () => {
  it('posts only which run to the owner-gated backend route', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await pipelineRunAction(discoveryApi, { fetch }, 'rerun', { namespace: 'app-a-cicd', name: 'ci-0-build-x' });
    expect(fetch).toHaveBeenCalledWith('http://be/api/glidepath/tekton/rerun', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ namespace: 'app-a-cicd', name: 'ci-0-build-x' }),
    });
  });

  it('surfaces a refusal', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'user:default/x is not allowed tower.pipeline.cancel on component:default/a', refused: true }),
    });
    await expect(
      pipelineRunAction(discoveryApi, { fetch }, 'cancel', { namespace: 'app-a-cicd', name: 'r' }),
    ).rejects.toThrow('not allowed tower.pipeline.cancel');
  });
});
