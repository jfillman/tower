import { flowBucket } from './PipelineRunList';

describe('Pipelines: the Release flows filter', () => {
  it("counts Tower's promote and rollback runs, and a cicd.yaml's own flow names, as release flows (found live: boarding-api)", () => {
    expect(['ci', 'promote', 'rollback', 'promote-staging'].map(f => flowBucket(f))).toEqual(['ci', 'ci', 'ci', 'ci']);
    expect([flowBucket('pr-build'), flowBucket('guardrail'), flowBucket(undefined)]).toEqual(['pr-build', 'guardrail', undefined]);
  });
});
