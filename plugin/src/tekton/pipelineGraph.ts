import type { GraphEdge, GraphNode, PipelineGraphLayout, PipelineRunSummary, TaskPhase } from './types';

// Real Tekton pipelines are DAGs, not fixed shapes - the live "build" pipeline
// this was built against (kind-dev, app-backstage-cicd) has 11 tasks across 7
// dependency-depth levels plus 4 finally tasks, and other apps' pipelines will
// differ again. So this lays out whatever `runAfter` graph the pipeline
// actually declares - depth-first columns by real dependency depth, not
// hand-placed coordinates - the same shape Tekton's own dashboard draws a
// PipelineRun DAG in.

function taskPhase(name: string, run: PipelineRunSummary): TaskPhase {
  const taskRun = run.taskRunsByPipelineTask[name];
  if (taskRun) return taskRun.phase;
  // No TaskRun yet for this pipeline task: still running/queued means it
  // hasn't started (pending); a completed PipelineRun with no TaskRun here
  // means a `when` expression skipped it (see the live condition message
  // "Skipped: 1" this was confirmed against).
  return run.phase === 'succeeded' || run.phase === 'failed' ? 'skipped' : 'pending';
}

export function layoutPipelineGraph(run: PipelineRunSummary): PipelineGraphLayout {
  const byName = new Map(run.tasks.map(t => [t.name, t]));
  const depthOf = new Map<string, number>();
  const visiting = new Set<string>();

  function depthOfTask(name: string): number {
    const cached = depthOf.get(name);
    if (cached !== undefined) return cached;
    const task = byName.get(name);
    if (!task || task.runAfter.length === 0 || visiting.has(name)) {
      depthOf.set(name, 0);
      return 0;
    }
    visiting.add(name);
    const depth = 1 + Math.max(...task.runAfter.map(depthOfTask));
    visiting.delete(name);
    depthOf.set(name, depth);
    return depth;
  }
  run.tasks.forEach(t => depthOfTask(t.name));

  const maxDepth = run.tasks.length ? Math.max(...run.tasks.map(t => depthOf.get(t.name) ?? 0)) : -1;
  const finallyColStart = maxDepth + 1;

  const byDepth = new Map<number, typeof run.tasks>();
  run.tasks.forEach(t => {
    const d = depthOf.get(t.name) ?? 0;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(t);
  });

  const nodes: GraphNode[] = [];
  byDepth.forEach((list, depth) => {
    list.forEach((t, row) => {
      nodes.push({
        id: t.name,
        label: t.name,
        sub: t.taskRefName,
        finally: false,
        col: depth,
        row,
        phase: taskPhase(t.name, run),
      });
    });
  });
  run.finallyTasks.forEach((t, row) => {
    nodes.push({
      id: t.name,
      label: t.name,
      sub: t.taskRefName,
      finally: true,
      col: finallyColStart,
      row,
      phase: taskPhase(t.name, run),
    });
  });

  const edges: GraphEdge[] = [];
  run.tasks.forEach(t => t.runAfter.forEach(dep => edges.push({ from: dep, to: t.name, finally: false })));

  // Finally tasks run after the whole pipeline regardless of outcome, not
  // after any one specific task - drawn (like Tekton's own dashboard) as a
  // dashed edge from every "leaf" regular task (one nothing else runs
  // after) into each finally task, across the divider.
  const referenced = new Set(run.tasks.flatMap(t => t.runAfter));
  const leaves = run.tasks.filter(t => !referenced.has(t.name));
  run.finallyTasks.forEach(ft => leaves.forEach(leaf => edges.push({ from: leaf.name, to: ft.name, finally: true })));

  const maxRows = Math.max(1, ...[...byDepth.values()].map(l => l.length), run.finallyTasks.length);

  return { nodes, edges, cols: finallyColStart + 1, maxRows, finallyColStart };
}
