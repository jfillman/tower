function taskPhase(name, run) {
  const taskRun = run.taskRunsByPipelineTask[name];
  if (taskRun) return taskRun.phase;
  return run.phase === "succeeded" || run.phase === "failed" ? "skipped" : "pending";
}
function layoutPipelineGraph(run) {
  const byName = new Map(run.tasks.map((t) => [t.name, t]));
  const depthOf = /* @__PURE__ */ new Map();
  const visiting = /* @__PURE__ */ new Set();
  function depthOfTask(name) {
    const cached = depthOf.get(name);
    if (cached !== void 0) return cached;
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
  run.tasks.forEach((t) => depthOfTask(t.name));
  const maxDepth = run.tasks.length ? Math.max(...run.tasks.map((t) => depthOf.get(t.name) ?? 0)) : -1;
  const finallyColStart = maxDepth + 1;
  const byDepth = /* @__PURE__ */ new Map();
  run.tasks.forEach((t) => {
    const d = depthOf.get(t.name) ?? 0;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d).push(t);
  });
  const nodes = [];
  byDepth.forEach((list, depth) => {
    list.forEach((t, row) => {
      nodes.push({
        id: t.name,
        label: t.name,
        sub: t.taskRefName,
        finally: false,
        col: depth,
        row,
        phase: taskPhase(t.name, run)
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
      phase: taskPhase(t.name, run)
    });
  });
  const edges = [];
  run.tasks.forEach((t) => t.runAfter.forEach((dep) => edges.push({ from: dep, to: t.name, finally: false })));
  const referenced = new Set(run.tasks.flatMap((t) => t.runAfter));
  const leaves = run.tasks.filter((t) => !referenced.has(t.name));
  run.finallyTasks.forEach((ft) => leaves.forEach((leaf) => edges.push({ from: leaf.name, to: ft.name, finally: true })));
  const maxRows = Math.max(1, ...[...byDepth.values()].map((l) => l.length), run.finallyTasks.length);
  return { nodes, edges, cols: finallyColStart + 1, maxRows, finallyColStart };
}

export { layoutPipelineGraph };
//# sourceMappingURL=pipelineGraph.esm.js.map
