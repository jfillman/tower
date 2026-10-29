import { downloadTestReport } from './useTestRuns';

describe('downloadTestReport', () => {
  it('names the app, so the backend can read the report through glidepath-api', async () => {
    const fetch = jest.fn(async (_url: string) => new Response('<testsuites/>', { status: 200 }));
    const createObjectURL = jest.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: jest.fn() });
    await downloadTestReport({ fetch }, 'http://backend/api/glidepath', 'boarding-api', { id: '6ae0', workflow: 'w' });
    expect(fetch).toHaveBeenCalledWith('http://backend/api/glidepath/tests/report?id=6ae0&app=boarding-api');
  });
});
