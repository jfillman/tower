import { COMPONENT_INGESTOR_TASK, triggerCatalogRefresh } from './catalogRefresh';

const discovery = { getBaseUrl: async (id: string) => `http://backstage/api/${id}` };

describe('triggerCatalogRefresh', () => {
  it('POSTs to the catalog scheduler trigger for the component ingestor task', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    await triggerCatalogRefresh(discovery, { fetch: fetchMock as unknown as typeof fetch });
    expect(fetchMock).toHaveBeenCalledWith(
      `http://backstage/api/catalog/.backstage/scheduler/v1/tasks/${COMPONENT_INGESTOR_TASK}/trigger`,
      { method: 'POST' },
    );
  });
  it('rejects with the status when Backstage refuses', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(triggerCatalogRefresh(discovery, { fetch: fetchMock as unknown as typeof fetch })).rejects.toThrow('403');
  });
});
