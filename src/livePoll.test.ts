import { FAST_POLL_MS, NORMAL_POLL_MS, livePollMs } from './livePoll';

describe('livePollMs', () => {
  it('stops polling while the page is hidden', () => {
    expect(livePollMs(false, true)).toBeNull();
    expect(livePollMs(false, false)).toBeNull();
  });
  it('polls fast while something is being watched, normally otherwise', () => {
    expect(livePollMs(true, true)).toBe(FAST_POLL_MS);
    expect(livePollMs(true, false)).toBe(NORMAL_POLL_MS);
    expect(livePollMs(true, false, 15_000)).toBe(15_000);
  });
});
