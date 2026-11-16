import { runOriginOf, traceIdOfTraceparent } from './lineage';

const CHAIN = '94e8228a-5cdc-4350-914a-d73802e5b296';
const TRACE = '98f0963d6bc08cb69e6051852fc528de';

describe('runOriginOf (promotion lineage annotations)', () => {
  it('reads the origin glidepath-api stamped on the run', () => {
    expect(
      runOriginOf({
        'glidepath.io/origin-chain-id': CHAIN,
        'glidepath.io/origin-chain-slug': 'ornate-ram',
        'glidepath.io/origin-trace-id': TRACE,
        'hangar.io/initiator': 'user:default/jane',
      }),
    ).toEqual({ chainId: CHAIN, chainSlug: 'ornate-ram', traceId: TRACE });
  });

  it('is undefined with no origin, or a chain id that is not a UUID (a slug or trace never stands alone)', () => {
    expect(runOriginOf(undefined)).toBeUndefined();
    expect(runOriginOf({})).toBeUndefined();
    expect(runOriginOf({ 'glidepath.io/origin-chain-id': 'not-a-uuid', 'glidepath.io/origin-chain-slug': 'ornate-ram' })).toBeUndefined();
    expect(runOriginOf({ 'glidepath.io/origin-chain-slug': 'ornate-ram', 'glidepath.io/origin-trace-id': TRACE })).toBeUndefined();
  });

  it('drops a slug or a trace id that is outside the shape glidepath-api writes', () => {
    expect(runOriginOf({ 'glidepath.io/origin-chain-id': CHAIN, 'glidepath.io/origin-chain-slug': 'Bad Slug', 'glidepath.io/origin-trace-id': 'xyz' })).toEqual({
      chainId: CHAIN,
    });
  });
});

describe('traceIdOfTraceparent', () => {
  it('is the trace id of a W3C traceparent', () => {
    expect(traceIdOfTraceparent(`00-${TRACE}-a71828a66b3e8c7d-01`)).toBe(TRACE);
  });
  it('is undefined for anything else', () => {
    expect(traceIdOfTraceparent(undefined)).toBeUndefined();
    expect(traceIdOfTraceparent('')).toBeUndefined();
    expect(traceIdOfTraceparent(`01-${TRACE}-a71828a66b3e8c7d-01`)).toBeUndefined();
    expect(traceIdOfTraceparent('00-zz-yy-01')).toBeUndefined();
  });
});
