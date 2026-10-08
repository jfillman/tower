import { archivedRunToSummary, parseArchivedLog } from './pipelineHistoryApi';
import type { TaskStepSummary } from './types';

const steps: TaskStepSummary[] = [
  { name: 'build', container: 'step-build', state: 'terminated', exitCode: 0 },
  { name: 'push', container: 'step-push', state: 'terminated', exitCode: 0 },
];

describe('parseArchivedLog', () => {
  it('groups prefixed lines by step, drops init containers, keeps continuations', () => {
    const text = [
      '[prepare] 2026/10/08 06:22:35 Entrypoint initialization',
      '',
      '[build] compiling',
      'continued line',
      '[push] pushed sha256:abc',
      '[build] done',
      '',
    ].join('\n');
    const blocks = parseArchivedLog(text, steps);
    expect(blocks.map(b => b.step)).toEqual(['build', 'push']);
    expect(blocks[0].lines.map(l => l.text)).toEqual(['compiling', 'continued line', 'done']);
    expect(blocks[1].lines.map(l => l.text)).toEqual(['pushed sha256:abc']);
  });

  it('gives a step with no output an empty block', () => {
    expect(parseArchivedLog('[build] x', steps)[1]).toMatchObject({ step: 'push', lines: [] });
  });
});

describe('archivedRunToSummary', () => {
  it('summarizes like a live run and marks the archive', () => {
    const run = archivedRunToSummary('boarding-api', {
      result: '5fb44953-9d9d-4e37-b783-a57b92562a1a',
      pipelineRun: {
        metadata: {
          name: 'ci-0-build-abc',
          namespace: 'app-boarding-api-cicd',
          labels: { 'tekton.dev/pipeline': 'build' },
          annotations: {},
        },
        status: {
          conditions: [{ type: 'Succeeded', status: 'True', reason: 'Succeeded' }],
          childReferences: [{ kind: 'TaskRun', name: 'ci-0-build-abc-compile', pipelineTaskName: 'compile' }],
          pipelineSpec: { tasks: [{ name: 'compile' }] },
        },
      } as any,
      taskRuns: [
        {
          metadata: { name: 'ci-0-build-abc-compile', namespace: 'app-boarding-api-cicd', labels: {}, annotations: {} },
          status: { conditions: [{ type: 'Succeeded', status: 'True' }], podName: 'p', steps: [] },
        } as any,
      ],
    });
    expect(run.phase).toBe('succeeded');
    expect(run.taskRunsByPipelineTask.compile?.name).toBe('ci-0-build-abc-compile');
    expect(run.archive).toEqual({ app: 'boarding-api', result: '5fb44953-9d9d-4e37-b783-a57b92562a1a' });
  });
});
