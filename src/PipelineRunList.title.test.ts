import { pipelineTitle } from './PipelineRunList';

type Run = Parameters<typeof pipelineTitle>[0];
const run = (pipelineName: string, params: Record<string, string> = {}): Run =>
  ({ name: `${pipelineName}-abc12`, pipelineName, params: Object.entries(params).map(([name, value]) => ({ name, value })) }) as unknown as Run;

describe('pipelineTitle', () => {
  it('titles a stub gate by its gate name, not the shared governance-check Pipeline', () => {
    expect(pipelineTitle(run('governance-check', { 'gate-name': 'itsm' }))).toBe('itsm-check');
    expect(pipelineTitle(run('governance-check', { 'gate-name': 'image-promotion' }))).toBe('image-promotion-check');
  });
  it('keeps the Pipeline name for real gates and the env for stage pipelines', () => {
    expect(pipelineTitle(run('sast-check'))).toBe('sast-check');
    expect(pipelineTitle(run('deploy', { env: 'dev' }))).toBe('deploy to dev');
    expect(pipelineTitle(run('governance-check'))).toBe('governance-check');
  });
});
