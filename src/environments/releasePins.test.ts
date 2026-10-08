import { promoteCandidates, releaseTagOf, rollbackCandidate, type PinState } from './releasePins';
import type { CloudDeploy } from '../cloudDeploy';

const d = (env: string, tag: string, phase: string, at: string): CloudDeploy =>
  ({ env, imageRef: `ghcr.io/o/a:${tag}`, imageTag: tag, phase, completionTime: at }) as unknown as CloudDeploy;

describe('promoteCandidates', () => {
  it("puts the previous environment's last successful deploy first, then other built images, one per image", () => {
    const out = promoteCandidates(
      [
        d('dev', '1.0.0-aaaaaaa', 'succeeded', '2026-10-01T00:00:00Z'),
        d('qa', '1.1.0-bbbbbbb', 'succeeded', '2026-10-03T00:00:00Z'),
        d('dev', '1.2.0-ccccccc', 'failed', '2026-10-04T00:00:00Z'),
        d('dev', '1.0.0-aaaaaaa', 'succeeded', '2026-10-02T00:00:00Z'),
      ],
      'dev',
    );
    expect(out.map(o => o.tag)).toEqual(['1.0.0-aaaaaaa', '1.1.0-bbbbbbb', '1.2.0-ccccccc']);
    expect(out[2].label).toBe('1.2.0-ccccccc (dev, deploy failed)');
  });
});

describe('rollbackCandidate', () => {
  const pin = (tag: string, digest: string) => ({ repository: 'r', tag, digest });
  it('is the newest earlier pin that differs from the current one', () => {
    const state: PinState = {
      env: 'prod',
      path: 'p',
      current: pin('3', 'c'),
      history: [
        { sha: 's3', date: '', message: '', pin: pin('3', 'c') },
        { sha: 's2b', date: '', message: '', pin: pin('3', 'c') },
        { sha: 's2', date: '', message: '', pin: pin('2', 'b') },
      ],
    };
    expect(rollbackCandidate(state)?.sha).toBe('s2');
  });
  it('is nothing with no history to go back to', () => {
    expect(rollbackCandidate({ env: 'prod', path: 'p', current: pin('1', 'a'), history: [{ sha: 's1', date: '', message: '', pin: pin('1', 'a') }] })).toBeUndefined();
    expect(rollbackCandidate({ env: 'prod', path: 'p', history: [] })).toBeUndefined();
  });
});

describe('promoteCandidates from the registry', () => {
  const versions = [
    { digest: 'sha256:a', tags: ['sha256-abc.att'], createdAt: '2026-10-07T20:56:42Z' },
    { digest: 'sha256:b', tags: ['0.1.1-65d4c04', '0.1.1-65d4c04-amd64'], createdAt: '2026-10-07T20:56:02Z' },
    { digest: 'sha256:c', tags: ['0.1.0-dac9953'], createdAt: '2026-10-06T10:00:00Z' },
  ];
  it('offers built images when no deploy runs are left, newest first, skipping signatures and per-arch tags', () => {
    const out = promoteCandidates([], 'dev', { repository: 'ghcr.io/o/fn', versions });
    expect(out.map(c => c.image)).toEqual(['ghcr.io/o/fn:0.1.1-65d4c04', 'ghcr.io/o/fn:0.1.0-dac9953']);
    expect(out[0].label).toMatch(/^0\.1\.1-65d4c04 \(built/);
  });
  it('keeps run-derived images first and does not repeat them', () => {
    const run = { imageRef: 'ghcr.io/o/fn:0.1.0-dac9953', imageTag: '0.1.0-dac9953', env: 'dev', phase: 'succeeded', completionTime: '2026-10-06T11:00:00Z' } as never;
    const out = promoteCandidates([run], 'dev', { repository: 'ghcr.io/o/fn', versions });
    expect(out.map(c => c.image)).toEqual(['ghcr.io/o/fn:0.1.0-dac9953', 'ghcr.io/o/fn:0.1.1-65d4c04']);
  });
  it('releaseTagOf picks the multi-arch tag', () => {
    expect(releaseTagOf(['0.1.1-x-amd64', '0.1.1-x'])).toBe('0.1.1-x');
    expect(releaseTagOf(['sha256-1.sig'])).toBeUndefined();
  });
});
