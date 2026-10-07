const RELEASE_RECORD_SELECTOR = "hangar.io/subcomponent=release-tracking";
const DEPLOYING_STATES = /* @__PURE__ */ new Set(["merged", "progressing", "sync-failed"]);
const FAILED_STATES = /* @__PURE__ */ new Set(["aborted", "degraded"]);
const nonEmpty = (v) => v ? v : void 0;
function toReleaseRecord(cm) {
  const d = cm.data ?? {};
  const labels = cm.metadata.labels ?? {};
  return {
    name: cm.metadata.name,
    namespace: cm.metadata.namespace,
    releaseId: nonEmpty(d.releaseId),
    kind: nonEmpty(d.kind),
    appName: d.appName || labels["hangar.io/app"] || cm.metadata.namespace.replace(/^app-/, "").replace(/-cicd$/, ""),
    env: d.env || labels["hangar.io/env"] || "",
    cluster: d.cluster || labels["hangar.io/cluster"] || "",
    // A record from before the state machine has no state; it was opened, so it is proposed.
    state: d.state || "proposed",
    stateAt: nonEmpty(d.stateAt),
    prUrl: nonEmpty(d.prUrl),
    prCreatedAt: nonEmpty(d.prCreatedAt),
    mergedAt: nonEmpty(d.mergedAt),
    flowStartTime: nonEmpty(d.flowStartTime),
    gitUrl: nonEmpty(d.gitUrl),
    gitRevision: nonEmpty(d.gitRevision),
    lastFactAt: nonEmpty(d.lastFactAt),
    lastFactPhase: nonEmpty(d.lastFactPhase),
    lastError: nonEmpty(d.lastError),
    drift: nonEmpty(d.drift),
    supersededBy: nonEmpty(d.supersededBy)
  };
}
const RELEASE_EVENT_REASONS = ["ReleaseStalled", "ReleaseDrift"];
function toReleaseEvent(e) {
  if (e.reason !== "ReleaseStalled" && e.reason !== "ReleaseDrift") return void 0;
  return {
    reason: e.reason,
    namespace: e.involvedObject?.namespace ?? e.metadata.namespace,
    recordName: e.involvedObject?.name ?? "",
    message: e.message,
    at: e.lastTimestamp ?? e.eventTime ?? e.firstTimestamp ?? e.metadata.creationTimestamp
  };
}

export { DEPLOYING_STATES, FAILED_STATES, RELEASE_EVENT_REASONS, RELEASE_RECORD_SELECTOR, toReleaseEvent, toReleaseRecord };
//# sourceMappingURL=releaseRecords.esm.js.map
