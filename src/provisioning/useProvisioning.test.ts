import { toManaged } from './useProvisioning';

const mr = (name: string, status: 'True' | 'False' | null, at = '2026-09-30T14:12:35Z') => ({
  metadata: { name },
  status: status ? { conditions: [{ type: 'Ready', status, lastTransitionTime: at }] } : undefined,
});

describe('toManaged', () => {
  it('counts a ref that has no object yet as not ready', () => {
    const out = toManaged(
      [
        { kind: 'Repository', name: 'a-src' },
        { kind: 'RepositoryFile', name: 'a-readme' },
        { kind: 'TektonCICD', name: 'a-tektoncicd' },
      ],
      [mr('a-src', 'True')],
    );
    expect(out).toEqual([
      { name: 'a-src', ready: true, readyAt: Date.parse('2026-09-30T14:12:35Z') },
      { name: 'a-readme', ready: false, readyAt: undefined },
    ]);
  });

  it('falls back to what was listed when the XR has no resourceRefs', () => {
    expect(toManaged(undefined, [mr('a-src', 'False')])).toEqual([
      { name: 'a-src', ready: false, readyAt: Date.parse('2026-09-30T14:12:35Z') },
    ]);
  });

  it('is undefined when nothing could be read, so the caller infers from the XR', () => {
    expect(toManaged([{ kind: 'Repository', name: 'a-src' }], [])).toBeUndefined();
    expect(toManaged(undefined, [])).toBeUndefined();
  });
});
