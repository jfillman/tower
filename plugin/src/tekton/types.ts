// Types for the CI/CD tab's CI section - a real Tekton PipelineRun's task
// graph and per-task execution state. Modeled directly off the live shape
// confirmed against kind-dev's actual `tekton.dev/v1` PipelineRun/TaskRun
// objects (kubectl --context kiac-dev -n app-backstage-cicd get pipelinerun
// ci-0-build-... -o json), not the Tekton API's full spec - only the fields
// this tab actually reads.

export interface PipelineTaskDef {
  name: string;
  runAfter: string[];
  // The underlying reusable Task this pipeline task resolves to (e.g.
  // pipeline task "unit-test" resolves taskRef "run-tests") - shown as the
  // node's secondary label, same "human name + real underlying thing" split
  // PrButton/ReleaseMatrix already draw elsewhere in Tower.
  taskRefName?: string;
}

export type RunPhase = 'succeeded' | 'failed' | 'running' | 'pending' | 'cancelled';
export type TaskPhase = RunPhase | 'skipped';

export interface TaskStepSummary {
  name: string;
  // The step's real container name (Tekton always names it `step-<name>`).
  container: string;
  state: 'running' | 'terminated' | 'waiting';
  exitCode?: number;
  startedAt?: string;
  finishedAt?: string;
}

export interface TaskParam {
  name: string;
  value: string;
}

export interface TaskResult {
  name: string;
  value: string;
}

export interface TaskRunSummary {
  name: string;
  pipelineTaskName: string;
  phase: TaskPhase;
  reason?: string;
  message?: string;
  podName?: string;
  namespace: string;
  startTime?: string;
  completionTime?: string;
  steps: TaskStepSummary[];
  // Real input params (TaskRun.spec.params) and output results
  // (TaskRun.status.results) - shown in the task detail panel. Both empty
  // when the underlying Task declares none (confirmed live: validate-config
  // takes no params).
  params: TaskParam[];
  results: TaskResult[];
  raw: unknown;
}

export interface PipelineRunSummary {
  name: string;
  namespace: string;
  cluster: string;
  pipelineName?: string;
  appName?: string;
  sha?: string;
  branch?: string;
  author?: string;
  eventType?: string;
  sourceRepoUrl?: string;
  // Set only for a run triggered via a Tekton Trigger off a CDEvent rather
  // than by Pipelines-as-Code off a real git push/PR (confirmed live: the
  // gitops-image-bump stage of a flow carries no pipelinesascode.tekton.dev/*
  // labels at all - no sha/branch/sender to show - only
  // triggers.tekton.dev/trigger). The run list falls back to showing
  // pipelineName + this instead of the branch/commit/event descriptor.
  triggerName?: string;
  // A CDEvent-triggered run's own name carries a human-readable slug shared
  // by every stage of the same flow execution (confirmed live:
  // ci-1-deploy-vivid-egret-7c3a6e2a, ci-2-test-vivid-egret-e801353a,
  // ci-3-deploy-vivid-egret-96233f71 and ci-4-test-vivid-egret-63919531 are
  // four stages of one "vivid-egret" flow run; a separate execution used
  // "firm-bear" instead) - the only place this correlation exists, no label
  // carries it separately. Undefined for the flow's own first stage (a
  // Pipelines-as-Code run off a real push has no chain to correlate against
  // yet, so its name carries no slug at all).
  flowSlug?: string;
  // The raw hangar.io/flow (or platform.io/flow) label value - 'ci' for the
  // app's main build/test/deploy/release chain, 'pr-build' for a PR's own
  // preview build (useTektonPipelineRuns.ts's own filter already allows
  // both through). Lets the run list offer a "release flow only" filter
  // (2026-09-12: "pr builds could be a busy task that fills up the table.
  // users might want to view release flows only").
  flow?: string;
  phase: RunPhase;
  reason?: string;
  message?: string;
  startTime?: string;
  completionTime?: string;
  tasks: PipelineTaskDef[];
  finallyTasks: PipelineTaskDef[];
  // Keyed by pipelineTaskName (not TaskRun name) - every lookup this tab
  // does ("what's the state of task X in this run") starts from the
  // pipeline's own task name, never the generated TaskRun name.
  taskRunsByPipelineTask: Record<string, TaskRunSummary>;
  // The PipelineRun's own top-level params (spec.params - what this whole
  // run was invoked with, e.g. git-revision/image-repo) and results
  // (status.results - what it ultimately produced, e.g. a final image
  // digest) - distinct from any one task's own params/results, which stay
  // on that TaskRunSummary (2026-09-11: "find a way to add the pipeline
  // inputs and results somewhere in the expanded panel below the DAG").
  params: TaskParam[];
  results: TaskResult[];
  raw: unknown;
}

export interface GraphNode {
  id: string;
  label: string;
  sub?: string;
  finally: boolean;
  col: number;
  row: number;
  phase: TaskPhase;
}

export interface GraphEdge {
  from: string;
  to: string;
  finally: boolean;
}

export interface PipelineGraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  cols: number;
  maxRows: number;
  finallyColStart: number;
}
