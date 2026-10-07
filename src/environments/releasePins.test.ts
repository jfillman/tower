import { promoteCandidates, rollbackCandidate, type PinState } from './releasePins';
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
