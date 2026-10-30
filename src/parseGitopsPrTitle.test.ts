import { parseGitopsPrTitle } from './useReleaseContext';

describe('parseGitopsPrTitle', () => {
  it('reads a release PR title', () => {
    expect(parseGitopsPrTitle('Release: gate-api to prod @ 2.0.8-49ccca1')).toEqual({
      appName: 'gate-api', targetEnv: 'prod', imageTag: '2.0.8-49ccca1', kind: 'release',
    });
  });

  it("reads a rollback PR title (glidepath's open-release-pr, RELEASE_KIND=rollback)", () => {
    expect(parseGitopsPrTitle('Rollback: gate-api prod to 2.0.6-f54c365')).toEqual({
      appName: 'gate-api', targetEnv: 'prod', imageTag: '2.0.6-f54c365', kind: 'rollback',
    });
  });

  it('ignores the other gitops PRs', () => {
    expect(parseGitopsPrTitle('Release Record: gate-api @ 2.0.7-92988b1')).toBeUndefined();
    expect(parseGitopsPrTitle('Onboarding: re-sync governance-check boilerplate')).toBeUndefined();
  });
});
