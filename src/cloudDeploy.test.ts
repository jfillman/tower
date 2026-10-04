import fixture from './__fixtures__/cloudDeployRuns.json';
import { toPipelineRunSummary, type RawPipelineRun, type RawTaskRun } from './tekton/useTektonPipelineRuns';
import { cloudDeployFromRun, consoleUrlFor, hasCloudDeployInFlight, summarizeCloudDeploys } from './cloudDeploy';

// A real deploy to ECS captured from kiac-dev (smoke-ecs, ci-1-deploy-swift-bear-772974f5): the
// pipeline label, the resolve-deploy-target / resolve-image-ref results and the cloud task's params
// are exactly what the cluster produced. The variants below change one thing about it.
const real = (fixture as any)['ci-1-deploy-swift-bear-772974f5'];
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

function summarize(edit?: (pr: any, trs: any[]) => void) {
  const pr = clone(real.pipelineRun) as RawPipelineRun;
  const trs = clone(real.taskRuns) as RawTaskRun[];
  edit?.(pr, trs);
  return toPipelineRunSummary(pr, 'kind-dev', new Map(trs.map(t => [t.metadata.name, t])));
}
const taskRun = (trs: any[], name: string) => trs.find(t => t.metadata.labels['tekton.dev/pipelineTask'] === name);
const setConfig = (trs: any[], edit: (c: any) => void) => {
  const t = taskRun(trs, 'resolve-deploy-target');
  const r = t.status.results.find((x: any) => x.name === 'config-json');
  const c = JSON.parse(r.value);
  edit(c);
  r.value = JSON.stringify(c);
};
const setTarget = (trs: any[], target: string) => {
  taskRun(trs, 'resolve-deploy-target').status.results.find((x: any) => x.name === 'target').value = target;
};

describe('cloudDeployFromRun on the real ECS deploy', () => {
  const d = cloudDeployFromRun(summarize())!;
  it('knows the target and the resource it deployed to', () => {
    expect(d.target).toBe('aws-ecs');
    expect(d.targetLabel).toBe('AWS ECS');
    expect(d.resource).toEqual({
      kind: 'ECS service',
      name: 'glidepath-smoke',
      scope: 'glidepath-smoke',
      region: 'us-east-1',
    });
  });
  it('knows the image, its tag and the commit it was built from', () => {
    expect(d.imageRef).toBe('ghcr.io/jfillman/smoke-ecs:0.0.0-4eedae7');
    expect(d.imageTag).toBe('0.0.0-4eedae7');
    expect(d.shortSha).toBe('4eedae7');
    expect(d.env).toBe('dev');
  });
  it('reports a succeeded run with a duration and no failure', () => {
    expect(d.phase).toBe('succeeded');
    expect(d.durationSec).toBeGreaterThan(0);
    expect(d.failure).toBeUndefined();
  });
  it('links to the ECS service in the AWS console', () => {
    expect(d.consoleUrl).toBe(
      'https://us-east-1.console.aws.amazon.com/ecs/v2/clusters/glidepath-smoke/services/glidepath-smoke?region=us-east-1',
    );
  });
});

describe('variants', () => {
  it("a failed cloud task is named as the failure, with Tekton's message", () => {
    const run = summarize((pr, trs) => {
      pr.status.conditions = [{ type: 'Succeeded', status: 'False', reason: 'Failed' }];
      const t = taskRun(trs, 'deploy-aws-ecs');
      t.status.conditions = [
        {
          type: 'Succeeded',
          status: 'False',
          reason: 'Failed',
          message: '"step-update-service" exited with code 252: Error',
        },
      ];
    });
    const d = cloudDeployFromRun(run)!;
    expect(d.phase).toBe('failed');
    expect(d.failure).toEqual({ task: 'deploy-aws-ecs', message: expect.stringContaining('exited with code 252') });
  });

  it('a run still resolving is already a cloud deploy, from resolve-deploy-target alone', () => {
    const run = summarize((pr, trs) => {
      pr.status.conditions = [{ type: 'Succeeded', status: 'Unknown', reason: 'Running' }];
      delete pr.status.completionTime;
      const gone = taskRun(trs, 'deploy-aws-ecs').metadata.name;
      trs.splice(
        trs.findIndex(t => t.metadata.name === gone),
        1,
      );
      pr.status.childReferences = (pr.status.childReferences ?? []).filter((c: any) => c.name !== gone);
    });
    const d = cloudDeployFromRun(run)!;
    expect(d.target).toBe('aws-ecs');
    expect(d.phase).toBe('running');
    expect(d.resource?.name).toBe('glidepath-smoke');
    expect(d.durationSec).toBeUndefined();
    expect(hasCloudDeployInFlight([run])).toBe(true);
  });

  it('a Lambda deploy', () => {
    const run = summarize((_pr, trs) => {
      setTarget(trs, 'aws-lambda');
      setConfig(trs, c => {
        delete c.deploy.ecs;
        c.deploy.lambda = { functionName: 'resize-fn', region: 'eu-west-1' };
      });
    });
    const d = cloudDeployFromRun(run)!;
    expect(d.targetLabel).toBe('AWS Lambda');
    expect(d.resource).toEqual({ kind: 'Lambda function', name: 'resize-fn', region: 'eu-west-1' });
    expect(d.consoleUrl).toBe(
      'https://eu-west-1.console.aws.amazon.com/lambda/home?region=eu-west-1#/functions/resize-fn',
    );
  });

  it('an Azure Container Apps deploy', () => {
    const run = summarize((_pr, trs) => {
      setTarget(trs, 'azure-container-apps');
      setConfig(trs, c => {
        delete c.deploy.ecs;
        c.deploy.azureContainerApps = { resourceGroup: 'rg-smoke', appName: 'thumb-fn' };
      });
    });
    const d = cloudDeployFromRun(run)!;
    expect(d.resource).toEqual({ kind: 'Container App', name: 'thumb-fn', scope: 'rg-smoke', region: undefined });
    expect(d.consoleUrl).toContain('portal.azure.com');
  });

  it('a Kubernetes deploy is not a cloud deploy', () => {
    expect(cloudDeployFromRun(summarize((_pr, trs) => setTarget(trs, 'k8s-rollout')))).toBeUndefined();
  });

  it('survives an unreadable config: still a deploy, just without a resource', () => {
    const run = summarize((_pr, trs) => {
      taskRun(trs, 'resolve-deploy-target').status.results.find((x: any) => x.name === 'config-json').value =
        '{not json';
      taskRun(trs, 'deploy-aws-ecs').spec.params.find((p: any) => p.name === 'config-json').value = '';
    });
    const d = cloudDeployFromRun(run)!;
    expect(d.target).toBe('aws-ecs');
    expect(d.resource).toBeUndefined();
    expect(d.consoleUrl).toBeUndefined();
  });

  it('survives a tag-less image ref', () => {
    const run = summarize((_pr, trs) => {
      const r = taskRun(trs, 'resolve-image-ref').status.results.find((x: any) => x.name === 'image-ref');
      r.value = 'ghcr.io/jfillman/smoke-ecs@sha256:abc';
    });
    const d = cloudDeployFromRun(run)!;
    expect(d.imageTag).toBeUndefined();
    expect(d.shortSha).toBeUndefined();
  });

  it('reads the tag off a ref that also carries a digest', () => {
    const run = summarize((_pr, trs) => {
      const r = taskRun(trs, 'resolve-image-ref').status.results.find((x: any) => x.name === 'image-ref');
      r.value = 'ghcr.io/jfillman/smoke-ecs:0.0.0-4eedae7@sha256:abc';
    });
    expect(cloudDeployFromRun(run)!.imageTag).toBe('0.0.0-4eedae7');
  });
});

describe('summarizeCloudDeploys', () => {
  const REASON = { True: 'Succeeded', False: 'Failed', Unknown: 'Running' } as const;
  const at = (iso: string, phase: 'True' | 'False' | 'Unknown', name: string) =>
    summarize((pr, _trs) => {
      pr.metadata.name = name;
      pr.status.startTime = iso;
      pr.status.completionTime = phase === 'Unknown' ? undefined : iso;
      pr.status.conditions = [
        {
          type: 'Succeeded',
          status: phase,
          reason: REASON[phase],
        },
      ];
    });
  const ok = at('2026-10-04T02:00:00Z', 'True', 'ok-older');
  const failed = at('2026-10-04T03:00:00Z', 'False', 'failed-newer');
  const running = at('2026-10-04T04:00:00Z', 'Unknown', 'running-newest');

  it('orders newest first and picks the last success as current', () => {
    const s = summarizeCloudDeploys([ok, failed]);
    expect(s.deploys.map(d => d.runName)).toEqual(['failed-newer', 'ok-older']);
    expect(s.current?.runName).toBe('ok-older');
  });
  it('flags a latest failure that nothing newer has fixed', () => {
    expect(summarizeCloudDeploys([ok, failed]).latestFailure?.runName).toBe('failed-newer');
    expect(
      summarizeCloudDeploys([failed, ok, at('2026-10-04T05:00:00Z', 'True', 'fixed')]).latestFailure,
    ).toBeUndefined();
  });
  it('reports a deploy in flight without calling it the failure', () => {
    const s = summarizeCloudDeploys([ok, failed, running]);
    expect(s.inFlight?.runName).toBe('running-newest');
    expect(s.latestFailure?.runName).toBe('failed-newer');
  });
  it('is empty for an app with no cloud deploys', () => {
    const s = summarizeCloudDeploys([summarize((_pr, trs) => setTarget(trs, 'k8s-rollout'))]);
    expect(s.deploys).toEqual([]);
    expect(s.current).toBeUndefined();
    expect(hasCloudDeployInFlight([])).toBe(false);
  });
});

describe('consoleUrlFor', () => {
  it('has no link without a resource', () => {
    expect(consoleUrlFor('aws-lambda', undefined)).toBeUndefined();
  });
  it('encodes names', () => {
    expect(consoleUrlFor('aws-lambda', { kind: 'Lambda function', name: 'a b', region: 'us-east-1' })).toContain(
      'a%20b',
    );
  });
});
