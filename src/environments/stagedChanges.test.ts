import {
  addedFlightEnvs,
  applyStaged,
  buildDeploy,
  deleteFilesFor,
  describeChanges,
  envFilePaths,
  followUps,
  isUnchanged,
  planReleaseSteps,
  releaseStepEnvs,
  pipelinesNamingEnv,
  readEnvironments,
  removedEnvs,
  stageSetBlock,
  validateAddedFlight,
  validateEnvironments,
  validateRemovals,
  type EnvDef,
} from './stagedChanges';

const ground = (name: string, extra: Partial<EnvDef> = {}): EnvDef => ({ name, tier: 'ground', ...extra });
const flight = (name: string, cluster?: string): EnvDef => (cluster ? { name, tier: 'flight', cluster } : { name, tier: 'flight' });

describe('readEnvironments', () => {
  it('reads the new shape, keeping cloud overrides', () => {
    const r = readEnvironments({
      environments: [
        { name: 'dev', tier: 'ground' },
        { name: 'test', tier: 'ground', lambda: { functionName: 'fn-test' } },
        { name: 'prod', tier: 'flight', cluster: 'kind-prod' },
      ],
    });
    expect(r.shape).toBe('new');
    expect(r.envs).toEqual([ground('dev'), ground('test', { lambda: { functionName: 'fn-test' } }), flight('prod', 'kind-prod')]);
  });

  it('reads the old shape: lower then upper, with clusters', () => {
    const r = readEnvironments({
      lowerEnvironments: ['dev', 'test'],
      upperEnvironments: [{ name: 'staging', cluster: 'kind-prod' }, 'prod'],
    });
    expect(r.shape).toBe('old');
    expect(r.envs).toEqual([ground('dev'), ground('test'), flight('staging', 'kind-prod'), flight('prod')]);
  });

  it('keeps promotionOrder when it names exactly the declared environments', () => {
    const r = readEnvironments({
      lowerEnvironments: ['dev', 'test'],
      upperEnvironments: ['prod'],
      promotionOrder: ['test', 'dev', 'prod'],
    });
    expect(r.envs.map(e => e.name)).toEqual(['test', 'dev', 'prod']);
  });

  it('ignores a promotionOrder that does not match (a typo, or a partial list)', () => {
    const r = readEnvironments({ lowerEnvironments: ['dev'], upperEnvironments: ['prod'], promotionOrder: ['dev'] });
    expect(r.envs.map(e => e.name)).toEqual(['dev', 'prod']);
    expect(readEnvironments({ lowerEnvironments: ['dev'], promotionOrder: ['dev', 'ghost'] }).envs.map(e => e.name)).toEqual(['dev']);
  });

  it('is the default Ground dev when nothing is declared, like the schema', () => {
    expect(readEnvironments(undefined)).toEqual({ shape: 'old', envs: [ground('dev')] });
    expect(readEnvironments({}).envs).toEqual([ground('dev')]);
  });

  it('treats an empty environments list as not declared', () => {
    expect(readEnvironments({ environments: [], lowerEnvironments: ['qa'] }).envs).toEqual([ground('qa')]);
  });
});

describe('applyStaged', () => {
  const base = [ground('dev'), ground('test'), flight('staging', 'kind-prod'), flight('prod', 'kind-prod')];

  it('adds a Ground environment after the last Ground one, before any Flight one', () => {
    expect(applyStaged(base, [{ kind: 'add', env: ground('qa') }]).map(e => e.name)).toEqual(['dev', 'test', 'qa', 'staging', 'prod']);
  });

  it('adds a Flight environment at the end', () => {
    expect(applyStaged(base, [{ kind: 'add', env: flight('dr', 'kind-prod') }]).map(e => e.name)).toEqual(['dev', 'test', 'staging', 'prod', 'dr']);
  });

  it('does not mutate what it was given', () => {
    const copy = JSON.parse(JSON.stringify(base));
    applyStaged(base, [{ kind: 'add', env: ground('qa') }, { kind: 'remove', name: 'dev' }]);
    expect(base).toEqual(copy);
  });

  it('moves within a tier but never across tiers', () => {
    expect(applyStaged(base, [{ kind: 'move', name: 'test', direction: 'up' }]).map(e => e.name)).toEqual(['test', 'dev', 'staging', 'prod']);
    expect(applyStaged(base, [{ kind: 'move', name: 'test', direction: 'down' }]).map(e => e.name)).toEqual(['dev', 'test', 'staging', 'prod']); // next is Flight
    expect(applyStaged(base, [{ kind: 'move', name: 'dev', direction: 'up' }]).map(e => e.name)).toEqual(['dev', 'test', 'staging', 'prod']); // first
    expect(applyStaged(base, [{ kind: 'move', name: 'staging', direction: 'up' }]).map(e => e.name)).toEqual(['dev', 'test', 'staging', 'prod']); // previous is Ground
  });

  it('sets and clears a cloud block', () => {
    const withBlock = applyStaged([ground('dev')], [{ kind: 'setBlock', name: 'dev', block: 'lambda', value: { functionName: 'f' } }]);
    expect(withBlock[0].lambda).toEqual({ functionName: 'f' });
    expect(applyStaged(withBlock, [{ kind: 'setBlock', name: 'dev', block: 'lambda', value: undefined }])[0].lambda).toBeUndefined();
    expect(applyStaged(withBlock, [{ kind: 'setBlock', name: 'dev', block: 'lambda', value: {} }])[0].lambda).toBeUndefined();
  });

  it('removes an environment and applies changes in order', () => {
    const out = applyStaged(base, [{ kind: 'add', env: ground('qa') }, { kind: 'move', name: 'qa', direction: 'up' }, { kind: 'remove', name: 'dev' }]);
    expect(out.map(e => e.name)).toEqual(['qa', 'test', 'staging', 'prod']);
  });

  it('keeps a no-op move a no-op for an unknown environment', () => {
    expect(isUnchanged(base, applyStaged(base, [{ kind: 'move', name: 'ghost', direction: 'up' }]))).toBe(true);
  });
});

describe('validateEnvironments', () => {
  it('accepts a good Kubernetes list', () => {
    expect(validateEnvironments([ground('dev'), flight('prod', 'kind-prod')], undefined)).toEqual([]);
  });
  it('refuses a duplicate, a bad name and an empty list', () => {
    expect(validateEnvironments([ground('dev'), ground('dev')], undefined).join()).toMatch(/listed twice/);
    expect(validateEnvironments([ground('Dev_1')], undefined).join()).toMatch(/not a valid environment name/);
    expect(validateEnvironments([], undefined).join()).toMatch(/at least one/);
  });
  it('refuses a Ground environment with a cluster', () => {
    expect(validateEnvironments([ground('dev', { cluster: 'kind-x' })], undefined).join()).toMatch(/not supported yet/);
  });
  it('allows Flight on a cloud target (a release pin environment), but not with a cluster', () => {
    expect(validateEnvironments([ground('dev'), flight('prod')], 'aws-lambda')).toEqual([]);
    expect(validateEnvironments([ground('dev'), flight('prod', 'kind-prod')], 'aws-lambda').join()).toMatch(/sets a cluster, but aws-lambda has none/);
  });
  it('refuses an override block for another target, or on a Kubernetes app', () => {
    expect(validateEnvironments([ground('dev', { ecs: { service: 's' } })], 'aws-lambda').join()).toMatch(/sets ecs, but this app's target is aws-lambda/);
    expect(validateEnvironments([ground('dev', { lambda: { functionName: 'f' } })], undefined).join()).toMatch(/target is k8s-rollout/);
    expect(validateEnvironments([ground('dev', { lambda: { functionName: 'f' } })], 'aws-lambda')).toEqual([]);
  });
});

describe('buildDeploy', () => {
  it('replaces the three older fields with environments and keeps everything else', () => {
    const out = buildDeploy(
      {
        target: 'aws-lambda',
        lambda: { functionName: 'fn' },
        strategy: 'rollout',
        lowerEnvironments: ['dev'],
        upperEnvironments: [],
        promotionOrder: ['dev'],
        releaseFile: 'glidepath/releases/{env}.yaml',
      },
      [ground('dev'), ground('test', { lambda: { functionName: 'fn-test' } })],
    );
    expect(out).toEqual({
      target: 'aws-lambda',
      lambda: { functionName: 'fn' },
      strategy: 'rollout',
      releaseFile: 'glidepath/releases/{env}.yaml',
      environments: [
        { name: 'dev', tier: 'ground' },
        { name: 'test', tier: 'ground', lambda: { functionName: 'fn-test' } },
      ],
    });
  });
  it('never writes the old fields next to environments', () => {
    const out = buildDeploy({ environments: [{ name: 'dev', tier: 'ground' }], lowerEnvironments: ['x'] }, [ground('dev')]);
    expect('lowerEnvironments' in out).toBe(false);
  });
  it('round-trips: reading what it wrote gives the same environments', () => {
    const envs = [ground('dev'), ground('qa', { lambda: { functionName: 'q' } }), flight('prod', 'kind-prod')];
    expect(readEnvironments(buildDeploy({}, envs)).envs).toEqual(envs);
  });
  it('writes an old-shape app in the new shape with the same environments in the same order', () => {
    const old = { lowerEnvironments: ['dev', 'test'], upperEnvironments: [{ name: 'staging', cluster: 'kind-prod' }], promotionOrder: ['dev', 'test', 'staging'] };
    const { envs } = readEnvironments(old);
    expect(readEnvironments(buildDeploy(old, envs)).envs).toEqual(envs);
  });
});

describe('describeChanges', () => {
  const before = [ground('dev'), ground('test')];

  it('says nothing when nothing changed', () => {
    expect(describeChanges(before, before, 'new')).toEqual([]);
    expect(describeChanges(before, before, 'old')).toEqual([]); // no conversion for a no-op
  });

  it('describes an added environment and where it goes', () => {
    expect(describeChanges(before, [...before, ground('qa')], 'new')).toEqual([{ kind: 'add', title: 'Add environment qa', detail: 'Ground, after test' }]);
  });

  it('describes a removal', () => {
    expect(describeChanges(before, [ground('dev')], 'new')).toEqual([{ kind: 'remove', title: 'Remove environment test' }]);
  });

  it('describes each changed override field, with what applied before', () => {
    const after = [ground('dev'), ground('test', { lambda: { functionName: 'fn-test', region: 'eu-west-1' } })];
    const lines = describeChanges(before, after, 'new');
    expect(lines.map(l => l.title)).toEqual(['test: lambda.functionName', 'test: lambda.region']);
    expect(lines[0].detail).toBe('app-level value to fn-test');
  });

  it('describes clearing an override', () => {
    const had = [ground('test', { lambda: { functionName: 'fn-test' } })];
    const lines = describeChanges(had, [ground('test')], 'new');
    expect(lines).toEqual([{ kind: 'edit', title: 'test: lambda.functionName', detail: 'fn-test removed (the app-level value applies)' }]);
  });

  it('describes a reorder among the environments that remain', () => {
    const lines = describeChanges(before, [ground('test'), ground('dev')], 'new');
    expect(lines).toEqual([{ kind: 'reorder', title: 'Change the promotion order', detail: 'test to dev' }]);
  });

  it('puts the conversion first for an old-shape app, as a change of its own', () => {
    const lines = describeChanges(before, [...before, ground('qa')], 'old');
    expect(lines[0].kind).toBe('migrate');
    expect(lines[0].title).toMatch(/Convert the environment list/);
    expect(lines).toHaveLength(2);
  });
});

describe('followUps', () => {
  it('tells the user a new Ground environment gets its file from Glidepath after the merge', () => {
    const out = followUps([ground('dev')], [ground('dev'), ground('qa')], undefined);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/glidepath\/envs\/qa\.yaml/);
  });
  it('names the deleted file under glidepath/', () => {
    expect(followUps([ground('dev'), ground('qa')], [ground('dev')], undefined, 'shop')[0]).toMatch(/deletes glidepath\/envs\/qa\.yaml/);
  });
  it('says nothing for a cloud environment (no environment file) or when nothing was added', () => {
    expect(followUps([ground('dev')], [ground('dev'), ground('qa')], 'aws-lambda')).toEqual([]);
    expect(followUps([ground('dev')], [ground('dev')], undefined)).toEqual([]);
  });
});

describe('stageSetBlock', () => {
  it('replaces an earlier edit of the same block instead of piling up one per keystroke', () => {
    let staged = stageSetBlock([], 'test', 'lambda', { functionName: 'f' });
    staged = stageSetBlock(staged, 'test', 'lambda', { functionName: 'fn' });
    staged = stageSetBlock(staged, 'test', 'lambda', { functionName: 'fn-test' });
    expect(staged).toEqual([{ kind: 'setBlock', name: 'test', block: 'lambda', value: { functionName: 'fn-test' } }]);
  });
  it('keeps edits to other environments and other staged kinds', () => {
    const staged = stageSetBlock(
      [{ kind: 'add', env: ground('qa') }, { kind: 'setBlock', name: 'dev', block: 'lambda', value: { functionName: 'd' } }],
      'test',
      'lambda',
      { functionName: 't' },
    );
    expect(staged).toHaveLength(3);
    expect(applyStaged([ground('dev'), ground('test')], staged).map(e => e.lambda?.functionName)).toEqual(['d', 't', undefined]);
  });
});

describe('adding a Flight environment', () => {
  const before = [ground('dev'), flight('staging', 'kind-prod')];

  it('finds the Flight environments that are new, and only those', () => {
    const after = applyStaged(before, [{ kind: 'add', env: ground('qa') }, { kind: 'add', env: flight('prod', 'kind-prod') }]);
    expect(addedFlightEnvs(before, after).map(e => e.name)).toEqual(['prod']);
    expect(addedFlightEnvs(before, before)).toEqual([]);
  });

  it('requires a cluster for a new Flight environment', () => {
    const after = applyStaged(before, [{ kind: 'add', env: flight('prod') }]);
    expect(validateAddedFlight(before, after, undefined).join()).toMatch(/needs the cluster it runs on/);
    const ok = applyStaged(before, [{ kind: 'add', env: flight('prod', 'kind-prod') }]);
    expect(validateAddedFlight(before, ok, undefined)).toEqual([]);
  });

  it('does not re-check an existing Flight environment that names no cluster (an older, own-cluster one)', () => {
    const old = [ground('dev'), flight('staging')];
    expect(validateAddedFlight(old, old, undefined)).toEqual([]);
  });

  it('needs no cluster for a Flight environment on a cloud target, and explains the pin PR', () => {
    const after = applyStaged([ground('dev')], [{ kind: 'add', env: flight('prod') }]);
    expect(validateAddedFlight([ground('dev')], after, 'aws-lambda')).toEqual([]);
    expect(validateEnvironments(after, 'aws-lambda')).toEqual([]);
    expect(followUps([ground('dev')], after, 'aws-lambda').join()).toMatch(/glidepath\/releases\/prod\.yaml/);
  });

  it('tells the user the order to merge the two pull requests', () => {
    const after = applyStaged(before, [{ kind: 'add', env: flight('prod', 'kind-prod') }]);
    const out = followUps(before, after, undefined);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/Merge that one before the cicd\.yaml change/);
    expect(out[0]).not.toMatch(/not added/); // the release step is added by default now, and has its own line
  });
});

describe('removing environments', () => {
  const before = [ground('dev'), ground('qa'), flight('prod', 'kind-prod')];

  it('names exactly the files the backend allows deleting', () => {
    expect(envFilePaths('qa')).toEqual([
      'glidepath/envs/qa.yaml',
      'glidepath/envs/qa.release.yaml',
    ]);
  });

  it('finds removed environments', () => {
    expect(removedEnvs(before, [ground('dev'), flight('prod', 'kind-prod')]).map(e => e.name)).toEqual(['qa']);
    expect(removedEnvs(before, before)).toEqual([]);
  });

  it('finds pipelines with a step for an environment, in map and list form', () => {
    const map = { ci: { steps: [{ stage: 'build' }, { stage: 'deploy', env: 'qa' }] }, other: { steps: [{ env: 'dev' }] } };
    expect(pipelinesNamingEnv(map, 'qa')).toEqual(['ci']);
    expect(pipelinesNamingEnv(map, 'nope')).toEqual([]);
    expect(pipelinesNamingEnv([{ name: 'ci', steps: [{ env: 'qa' }] }], 'qa')).toEqual(['ci']);
    expect(pipelinesNamingEnv(undefined, 'qa')).toEqual([]);
  });

  it('refuses a removal a pipeline step still uses, naming the pipeline', () => {
    const after = [ground('dev'), flight('prod', 'kind-prod')];
    expect(validateRemovals(before, after, { ci: { steps: [{ env: 'qa' }] } })).toEqual([
      'Pipeline "ci" still has a step for "qa". Remove that step in the Glidepath tab first.',
    ]);
    expect(validateRemovals(before, after, { ci: { steps: [{ env: 'dev' }] } })).toEqual([]);
  });

  it('refuses to remove a Flight environment', () => {
    expect(validateRemovals(before, [ground('dev'), ground('qa')], undefined)[0]).toMatch(/Flight environment "prod" cannot be removed/);
  });

  it('deletes files only for removed Ground environments of a Kubernetes app', () => {
    const after = [ground('dev')];
    expect(deleteFilesFor(before, after, undefined)).toEqual(envFilePaths('qa'));
    expect(deleteFilesFor(before, after, 'k8s-rollout')).toEqual(envFilePaths('qa'));
    expect(deleteFilesFor(before, after, 'aws-lambda')).toEqual([]);
    expect(deleteFilesFor(before, before, undefined)).toEqual([]);
  });

  it('says what a Ground removal will take with it, and that a cloud resource is left alone', () => {
    const after = [ground('dev'), flight('prod', 'kind-prod')];
    const k8s = followUps(before, after, undefined, 'air-traffic-api');
    expect(k8s).toHaveLength(1);
    expect(k8s[0]).toMatch(/deletes glidepath\/envs\/qa\.yaml/);
    expect(k8s[0]).toMatch(/air-traffic-api-qa/);
    expect(k8s[0]).toMatch(/app-air-traffic-api-qa/);
    expect(followUps(before, after, 'aws-lambda', 'fn')[0]).toMatch(/not deleted/);
  });
});

describe('release steps for new Flight environments', () => {
  const envs = [ground('dev'), flight('staging', 'kind-prod'), flight('prod', 'kind-prod')];
  const ci = { trigger: { branch: 'main' }, steps: [{ stage: 'build' }, { stage: 'deploy', env: 'dev' }, { stage: 'release', env: 'staging' }] };

  it('inserts the step right after the step for the environment before it', () => {
    const plan = planReleaseSteps({ ci }, envs, ['prod']);
    expect((plan.pipelines as any).ci.steps).toEqual([...ci.steps, { stage: 'release', env: 'prod' }]);
    expect(plan.added).toEqual([{ env: 'prod', pipeline: 'ci', after: 'staging' }]);
  });

  it('inserts mid-list when the previous environment is not last', () => {
    const withTail = { ci: { ...ci, steps: [...ci.steps, { stage: 'gitops-image-bump', gitopsRepo: 'g', manifestPath: 'm' }] } };
    const steps = (planReleaseSteps(withTail, envs, ['prod']).pipelines as any).ci.steps;
    expect(steps.map((s: any) => s.env ?? s.stage)).toEqual(['build', 'dev', 'staging', 'prod', 'gitops-image-bump']);
  });

  it('puts it at the end, saying so, when the environment before it has no step', () => {
    const plan = planReleaseSteps({ ci: { steps: [{ stage: 'build' }] } }, envs, ['staging']);
    expect((plan.pipelines as any).ci.steps).toEqual([{ stage: 'build' }, { stage: 'release', env: 'staging' }]);
    expect(plan.added[0]).toEqual({ env: 'staging', pipeline: 'ci' });
  });

  it('adds several in order, each after its predecessor', () => {
    const plan = planReleaseSteps({ ci: { steps: [{ stage: 'build' }, { stage: 'deploy', env: 'dev' }] } }, envs, ['staging', 'prod']);
    expect((plan.pipelines as any).ci.steps.map((s: any) => s.env ?? s.stage)).toEqual(['build', 'dev', 'staging', 'prod']);
  });

  it('chooses the pipeline with the most deploy and release steps', () => {
    const small = { steps: [{ stage: 'build' }] };
    const plan = planReleaseSteps({ other: small, ci }, envs, ['prod']);
    expect(plan.added[0].pipeline).toBe('ci');
    expect((plan.pipelines as any).other).toEqual(small);
  });

  it('works on the legacy list form and keeps its shape', () => {
    const plan = planReleaseSteps([{ name: 'ci', ...ci }], envs, ['prod']);
    expect(Array.isArray(plan.pipelines)).toBe(true);
    expect((plan.pipelines as any)[0].steps.at(-1)).toEqual({ stage: 'release', env: 'prod' });
  });

  it('never changes its input', () => {
    const input = { ci: JSON.parse(JSON.stringify(ci)) };
    planReleaseSteps(input, envs, ['prod']);
    expect(input.ci.steps).toHaveLength(3);
  });

  it('leaves an environment that already has a step alone, and says why', () => {
    const plan = planReleaseSteps({ ci }, envs, ['staging']);
    expect(plan.added).toEqual([]);
    expect(plan.skipped).toEqual([{ env: 'staging', reason: 'a pipeline already has a step for it' }]);
    expect(plan.pipelines).toEqual({ ci });
  });

  it('adds nothing, and says why, when there is no pipeline with steps', () => {
    for (const none of [undefined, {}, { ci: { trigger: {} } }]) {
      const plan = planReleaseSteps(none, envs, ['prod']);
      expect(plan.added).toEqual([]);
      expect(plan.skipped[0].env).toBe('prod');
    }
  });

  it('only asks for environments staged with the step on and still present', () => {
    const staged = [
      { kind: 'add' as const, env: flight('dr', 'kind-prod'), releaseStep: true },
      { kind: 'add' as const, env: flight('dr2', 'kind-prod') },
      { kind: 'add' as const, env: ground('qa'), releaseStep: true },
    ];
    const after = applyStaged(envs, staged);
    expect(releaseStepEnvs(staged, after)).toEqual(['dr']);
    expect(releaseStepEnvs(staged, after.filter(e => e.name !== 'dr'))).toEqual([]);
  });
});
