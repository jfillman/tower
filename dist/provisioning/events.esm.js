function buildEvents(steps, now) {
  const events = [];
  for (const s of steps) {
    if (s.state !== "pend" && s.startedAt !== void 0) {
      events.push({ at: s.startedAt, kind: "start", stepId: s.id, text: `${s.title} started` });
    }
    if (s.state === "done" && s.endedAt !== void 0) {
      events.push({ at: s.endedAt, kind: "done", stepId: s.id, text: `${s.title} done` });
    }
    if (s.state === "fail") {
      events.push({ at: now, kind: "fail", stepId: s.id, text: `${s.title} failed${s.detail ? `: ${s.detail}` : ""}` });
    }
  }
  return events.map((e, i) => ({ e, i })).sort((a, b) => a.e.at - b.e.at || a.i - b.i).map((x) => x.e);
}

export { buildEvents };
//# sourceMappingURL=events.esm.js.map
