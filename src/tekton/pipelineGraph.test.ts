import { layoutPipelineGraph } from './pipelineGraph';
import type { PipelineRunSummary } from './types';

const run = (tasks: Array<[string, string[]]>, finallyTasks: string[] = []) =>
  ({
    phase: 'succeeded',
    taskRunsByPipelineTask: {},
    tasks: tasks.map(([name, runAfter]) => ({ name, taskRefName: name, runAfter })),
    finallyTasks: finallyTasks.map(name => ({ name, taskRefName: name, runAfter: [] })),
  }) as unknown as PipelineRunSummary;

const cols = (r: PipelineRunSummary) => Object.fromEntries(layoutPipelineGraph(r).nodes.map(n => [n.id, n.col]));

describe('layoutPipelineGraph', () => {
  it('puts a task with no runAfter just before what waits on it (Glidepath deploy)', () => {
    const deploy = run(
      [
        ['preflight', []],
        ['resolve-image-ref', []],
        ['resolve-deploy-target', ['preflight']],
        ['deploy', ['resolve-image-ref', 'resolve-deploy-target']],
        ['deploy-aws-lambda', ['resolve-image-ref', 'resolve-deploy-target']],
      ],
      ['debrief'],
    );
    expect(cols(deploy)).toEqual({
      preflight: 0,
      'resolve-image-ref': 1,
      'resolve-deploy-target': 1,
      deploy: 2,
      'deploy-aws-lambda': 2,
      debrief: 3,
    });
  });

  it('keeps leaves and chains at their dependency depth', () => {
    expect(cols(run([['a', []], ['b', ['a']], ['c', ['b']], ['lonely', []]]))).toEqual({ a: 0, b: 1, c: 2, lonely: 0 });
  });

  it('pulls a root only as far as its earliest successor allows', () => {
    // x feeds both b (col 1) and d (col 3): it stays in col 0.
    expect(cols(run([['a', []], ['x', []], ['b', ['a', 'x']], ['c', ['b']], ['d', ['c', 'x']]]))).toEqual({ a: 0, x: 0, b: 1, c: 2, d: 3 });
  });
});
