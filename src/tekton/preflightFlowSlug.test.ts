// Regression for the 2026-10-09 catalog change that folded start-flow into a single
// `preflight` task (glidepath#79): a git-rooted build run has no slug in its name, so its
// flow grouping depends entirely on reading chain-slug off the right TaskRun. Fixture is
// the real archived flight-attendant build ci-0-build-5f9jk (Tekton Results records).
import records from './__fixtures__/preflightBuildRun.json';
import { toPipelineRunSummary, TEKTON_CLUSTER, type RawPipelineRun, type RawTaskRun } from './useTektonPipelineRuns';

describe('flow slug from the preflight task', () => {
  // Results records keep `kind` on each object; Tower's Raw* types don't declare it.
  const list = records as Array<(RawPipelineRun | RawTaskRun) & { kind: string }>;
  const pr = list.find(r => r.kind === 'PipelineRun') as unknown as RawPipelineRun;
  const taskRunsByName = new Map<string, RawTaskRun>(
    list.filter(r => r.kind === 'TaskRun').map(r => [r.metadata.name, r as unknown as RawTaskRun]),
  );

  it('reads chain-slug and chain-id off preflight for a build run', () => {
    const summary = toPipelineRunSummary(pr, TEKTON_CLUSTER, taskRunsByName);
    expect(summary.flowSlug).toBe('spry-heron');
    expect(summary.taskRunsByPipelineTask.preflight?.results.find(r => r.name === 'chain-slug')?.value).toBe('spry-heron');
  });
});
