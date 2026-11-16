import { fetchReissuable, NOT_OWNER, postReissue, reissueDisabledReason, tagOf, type ReissuableRelease } from './reissue';

const entry = (over: Partial<ReissuableRelease> = {}): ReissuableRelease => ({
  chainId: '11111111-2222-4333-8444-555555555555',
  env: 'prod',
  cluster: 'hangar-prod',
  image: 'ghcr.io/o/shop:1.2.3-abc1234',
  prUrl: 'https://github.com/o/gitops-shop/pull/7',
  state: 'proposed',
  eligible: true,
  ...over,
});

describe('reissueDisabledReason', () => {
  it('is on for an owner when the API would accept it', () => {
    expect(reissueDisabledReason(entry(), true)).toBeUndefined();
  });
  it('says it is for owners when the caller may not', () => {
    expect(reissueDisabledReason(entry(), false)).toBe(NOT_OWNER);
    expect(reissueDisabledReason(entry({ eligible: false, reason: 'x' }), false)).toBe(NOT_OWNER);
  });
  it("is the API's own reason when it would refuse", () => {
    expect(reissueDisabledReason(entry({ eligible: false, reason: 'a release PR for prod is already open (https://x/9)' }), true)).toBe(
      'a release PR for prod is already open (https://x/9)',
    );
    expect(reissueDisabledReason(entry({ eligible: false }), true)).toMatch(/would refuse/);
  });
});

describe('the backend calls', () => {
  const discovery = { getBaseUrl: async () => 'http://be/api/glidepath' };
  it('reads the candidates and whether this person may reissue', async () => {
    const fetchApi = { fetch: jest.fn(async () => ({ ok: true, json: async () => ({ releases: [entry()], allowed: true }) })) };
    expect(await fetchReissuable(discovery, fetchApi as any, 'shop', 'o')).toEqual({ releases: [entry()], allowed: true });
    expect((fetchApi.fetch.mock.calls as any[][])[0][0]).toBe('http://be/api/glidepath/release/reissuable?appName=shop&owner=o');
  });
  it('treats a missing list as none and a missing allowed as false', async () => {
    const fetchApi = { fetch: async () => ({ ok: true, json: async () => ({}) }) };
    expect(await fetchReissuable(discovery, fetchApi as any, 'shop')).toEqual({ releases: [], allowed: false });
  });
  it('sends only which release', async () => {
    const fetchApi = { fetch: jest.fn(async () => ({ ok: true, json: async () => ({ pipelineRun: 'promote-prod-abc1234d-bd320d' }) })) };
    await postReissue(discovery, fetchApi as any, 'o', 'shop', entry().chainId);
    const [url, init] = (fetchApi.fetch.mock.calls as any[][])[0];
    expect(url).toBe('http://be/api/glidepath/release/reissue');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ owner: 'o', appName: 'shop', chainId: entry().chainId });
  });
  it("throws the API's refusal reason", async () => {
    const fetchApi = { fetch: async () => ({ ok: false, status: 502, json: async () => ({ error: 'release PR #7 is still open' }) }) };
    await expect(postReissue(discovery, fetchApi as any, 'o', 'shop', 'c')).rejects.toThrow('release PR #7 is still open');
    await expect(fetchReissuable(discovery, { fetch: async () => ({ ok: false, status: 500, json: async () => undefined }) } as any, 'shop')).rejects.toThrow('request failed with 500');
  });
  it('names an image by its tag', () => {
    expect(tagOf('ghcr.io/o/shop:1.2.3-abc1234')).toBe('1.2.3-abc1234');
    expect(tagOf(undefined)).toBe('?');
  });
});
