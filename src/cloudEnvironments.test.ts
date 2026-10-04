import fixture from './__fixtures__/cloudDeployRuns.json';
import { toPipelineRunSummary, type RawPipelineRun, type RawTaskRun } from './tekton/useTektonPipelineRuns';
import { cloudEnvironmentsFromRuns } from './cloudEnvironments';
import { health } from './types';
import { buildReleases } from './useReleaseContext';
import { buildReleaseRecords } from './useReleaseRecords';

const real = (fixture as any)['ci-1-deploy-swift-bear-772974f5'];
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
function run(name: string, start: string, edit?: (pr: any) => void) {
  const pr = clone(real.pipelineRun) as any;
  const trs = clone(real.taskRuns) as RawTaskRun[];
  pr.metadata.name = name;
  pr.status.startTime = start;
  pr.status.completionTime = start;
  edit?.(pr);
  return toPipelineRunSummary(pr as RawPipelineRun, 'kind-dev', new Map(trs.map(t => [t.metadata.name, t])));
}

describe('cloudEnvironmentsFromRuns', () => {
  it('is empty when there are no cloud deploys', () => {
    expect(cloudEnvironmentsFromRuns([]).environments).toEqual([]);
  });

  const out = cloudEnvironmentsFromRuns([run('a', '2026-10-01T10:00:00Z')]);
  it('builds one environment from the real ECS deploy', () => {
    expect(out.environments).toHaveLength(1);
    const e = out.environments[0];
    expect(e.deployed).toBe(true);
    expect(e.cloud?.targetLabel).toBe('AWS ECS');
    expect(e.image).toBeTruthy();
    expect(health(e)).toBe('healthy');
  });
  it('gives the matrix a row per deployed image', () => {
    const { rows } = buildReleases(out.environments, out.history, []);
    expect(rows).toHaveLength(1);
    expect(rows[0].cells[out.environments[0].env]?.status).toBe('deployed');
  });
  it('reports a failed newest deploy as degraded but keeps the last good image', () => {
    const o = cloudEnvironmentsFromRuns([
      run('good', '2026-10-01T10:00:00Z'),
      run('bad', '2026-10-02T10:00:00Z', pr => {
        pr.status.conditions = [{ type: 'Succeeded', status: 'False', reason: 'Failed' }];
      }),
    ]);
    const e = o.environments[0];
    expect(health(e)).toBe('degraded');
    expect(e.image).toBeTruthy();
    expect(o.history[e.env]).toHaveLength(1);
  });

  it('makes a release record for a cloud service that has no upper environment', () => {
    const { rows } = buildReleases(out.environments, out.history, []);
    const records = buildReleaseRecords('smoke', out.environments, rows, [], [], [], {}, { lower: ['dev'], upper: [] });
    expect(records).toHaveLength(1);
    expect(records[0].deployments[0].env).toBe(out.environments[0].env);
    expect(records[0].status).toBe('healthy');
  });

  it('still makes no record for a Kubernetes app that has only a lower environment', () => {
    const k8s = { ...out.environments[0], cloud: undefined };
    const { rows } = buildReleases([k8s], out.history, []);
    expect(buildReleaseRecords('x', [k8s], rows, [], [], [], {}, { lower: [k8s.env], upper: [] })).toEqual([]);
  });
});
