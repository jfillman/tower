import { isGuardrailPipeline } from './useTektonPipelineRuns';

describe('isGuardrailPipeline', () => {
  it('counts every catalog gate Pipeline, including itsm and values', () => {
    for (const name of ['sast-check', 'itsm-check', 'values-check', 'bypass-merge-check', 'some-new-check']) {
      expect(isGuardrailPipeline(name)).toBe(true);
    }
  });
  it('leaves the flow Pipelines alone', () => {
    for (const name of [undefined, 'build', 'deploy', 'release', 'release-outcome-notify', 'onboarding-resync']) {
      expect(isGuardrailPipeline(name)).toBe(false);
    }
  });
});
