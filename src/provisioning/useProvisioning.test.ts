import { parseTenantsRepo, toManaged, toOnboardingPrs, toRepoLinks, toSecrets } from './useProvisioning';

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

// The annotation exactly as written on the live sky-marshall XR.
const SOURCE_INFO =
  '{"pushToGit":true,"gitBranch":"main","gitRepo":"github.com?owner=jfillman\\u0026repo=gitops-cluster-dev-tenants","gitLayout":"custom","basePath":""}';

describe('parseTenantsRepo', () => {
  it('reads the owner and repo off the XR source-info annotation', () => {
    expect(parseTenantsRepo(SOURCE_INFO)).toEqual({ owner: 'jfillman', repo: 'gitops-cluster-dev-tenants' });
  });
  it('is undefined for a missing or malformed annotation', () => {
    expect(parseTenantsRepo(undefined)).toBeUndefined();
    expect(parseTenantsRepo('not json')).toBeUndefined();
    expect(parseTenantsRepo('{"gitRepo":"github.com"}')).toBeUndefined();
  });
});

describe('toRepoLinks', () => {
  const repo = (name: string, fullName: string) => ({
    metadata: { name },
    status: { atProvider: { fullName, htmlUrl: `https://github.com/${fullName}` } },
  });
  it('tells the source and GitOps repos apart by the composed resource name', () => {
    expect(
      toRepoLinks('sky-marshall', [
        repo('sky-marshall-src', 'jfillman/sky-marshall'),
        repo('sky-marshall-gitops', 'jfillman/gitops-sky-marshall'),
      ]),
    ).toEqual({
      owner: 'jfillman',
      sourceRepoUrl: 'https://github.com/jfillman/sky-marshall',
      gitopsRepoUrl: 'https://github.com/jfillman/gitops-sky-marshall',
    });
  });
  it('is empty when the repositories could not be read', () => {
    expect(toRepoLinks('x', [])).toEqual({ owner: undefined, sourceRepoUrl: undefined, gitopsRepoUrl: undefined });
  });
});

describe('toSecrets', () => {
  const store = (conditions: { type: string; status: string; message?: string; lastTransitionTime?: string }[]) =>
    ({ metadata: { name: 's', namespace: 'n', creationTimestamp: '' }, status: { conditions } }) as never;
  it('is ready from the Ready condition, with its time', () => {
    expect(
      toSecrets(store([{ type: 'Ready', status: 'True', lastTransitionTime: '2026-10-01T17:50:38Z' }]), true),
    ).toEqual({
      found: true,
      ready: true,
      readyAt: Date.parse('2026-10-01T17:50:38Z'),
      failed: undefined,
    });
  });
  it('reports a failed sync', () => {
    expect(toSecrets(store([{ type: 'Synced', status: 'False', message: 'boom' }]), true)?.failed).toBe('boom');
  });
  it('distinguishes "no SecretStore" from "could not read the list"', () => {
    expect(toSecrets(undefined, true)).toEqual({ found: false, ready: false });
    expect(toSecrets(undefined, false)).toBeUndefined();
  });
});

describe('toOnboardingPrs', () => {
  const pr = (
    repo: 'source' | 'gitops',
    number: number,
    title: string,
    state: 'open' | 'merged',
    mergedAt?: string,
  ) => ({
    repo,
    number,
    title,
    url: `https://github.com/o/${repo}/pull/${number}`,
    state,
    mergedAt,
  });
  // The real sky-marshall history: onboarding PR #1 merged, a later resync PR #3 merged, plus a human PR.
  const prs = [
    pr('source', 4, 'Remove hand-copied dev.release.yaml', 'open'),
    pr('source', 3, 'Onboarding: re-sync .tekton boilerplate', 'merged', '2026-10-01T21:58:55Z'),
    pr('source', 1, 'Onboarding: re-sync .tekton boilerplate', 'merged', '2026-10-01T17:56:47Z'),
    pr('gitops', 1, 'Onboarding: re-sync governance-check boilerplate', 'merged', '2026-10-01T17:57:04Z'),
  ];
  it('picks the first merged onboarding PR per repo and ignores other PRs', () => {
    const out = toOnboardingPrs(prs);
    expect(out.source).toMatchObject({ number: 1, state: 'merged', mergedAt: Date.parse('2026-10-01T17:56:47Z') });
    expect(out.gitops).toMatchObject({ number: 1, state: 'merged' });
  });
  it('falls back to an open onboarding PR, and to nothing', () => {
    expect(toOnboardingPrs([pr('source', 2, 'Onboarding: re-sync .tekton boilerplate', 'open')]).source?.state).toBe(
      'open',
    );
    expect(toOnboardingPrs([pr('source', 4, 'Something else', 'open')])).toEqual({
      source: undefined,
      gitops: undefined,
    });
  });
});
