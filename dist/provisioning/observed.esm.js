function updateObservation(prev, steps, now) {
  const next = { ...prev };
  for (const s of steps) {
    const o = { ...next[s.id] };
    if (s.state === "run") {
      o.sawRunning = true;
      o.startedAt ??= now;
    } else if (s.state === "done" && o.sawRunning) {
      o.endedAt ??= now;
    }
    if (o.sawRunning || o.endedAt !== void 0 || o.startedAt !== void 0) next[s.id] = o;
  }
  return next;
}

export { updateObservation };
//# sourceMappingURL=observed.esm.js.map
