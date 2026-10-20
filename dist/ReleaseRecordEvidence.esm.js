import { jsxs, jsx } from 'react/jsx-runtime';
import Link from '@material-ui/core/Link';
import { formatDateTime } from './shared/format.esm.js';
import { ColumnLabel, StatusChip, Hint } from './ui/index.esm.js';
import { verdictOf, isSharedCheckRide, explain } from './supplyChain.esm.js';

function checkRideOf(record) {
  const f = record.testEvidence;
  if (f) {
    return {
      ...f,
      verificationLabel: f.verified ? "verified" : f.verificationError ?? "unverified",
      shared: f.role === "check-ride" && (f.workflowSource?.startsWith("argocd:") ?? false),
      frozen: true
    };
  }
  const l = record.checkRide;
  if (!l) return void 0;
  const verdict = verdictOf(l.attestation);
  return {
    outcome: l.outcome,
    role: l.role,
    testsTotal: l.testsTotal,
    testsPassed: l.testsPassed,
    testsFailed: l.testsFailed,
    testsSkipped: l.testsSkipped,
    workflowSource: l.workflowSource,
    executionId: l.executionId,
    finishedOn: l.finishedOn,
    verified: verdict === "verified",
    verificationLabel: verdict === "verified" ? "verified" : explain(l.attestation, "test attestation").label,
    shared: isSharedCheckRide(l),
    frozen: false
  };
}
function checkRideTone(ride) {
  if (!ride) return "neutral";
  if (ride.outcome !== "passed") return "bad";
  if (ride.role !== "check-ride" || !ride.shared || !ride.verified) return "warn";
  return "ok";
}
function checkRideHeadline(ride) {
  if (!ride) return "No test run attested on this image";
  if (ride.outcome !== "passed") return ride.role === "check-ride" ? "Check ride failed" : "The team's tests did not pass";
  if (ride.role !== "check-ride") return "The team's tests passed; no check ride";
  if (!ride.shared) return "Check ride passed, not from the shared repository";
  if (!ride.verified) return "Check ride passed, attestation not verified";
  return "Check ride passed";
}
function CheckRideBlock({ record, classes }) {
  const ride = checkRideOf(record);
  const counts = ride?.testsTotal !== void 0 ? `${ride.testsPassed ?? 0} of ${ride.testsTotal} passed${ride.testsFailed ? `, ${ride.testsFailed} failed` : ""}${ride.testsSkipped ? `, ${ride.testsSkipped} skipped` : ""}` : void 0;
  return /* @__PURE__ */ jsxs("div", { className: classes.scanBlock, "data-testid": "record-check-ride", children: [
    /* @__PURE__ */ jsxs("div", { className: classes.scanHead, children: [
      /* @__PURE__ */ jsx("span", { className: classes.scanName, children: "Check ride" }),
      /* @__PURE__ */ jsx(StatusChip, { tone: checkRideTone(ride), children: ride ? ride.outcome || "no outcome" : "none" }),
      ride && /* @__PURE__ */ jsx(StatusChip, { tone: ride.verified ? "ok" : "warn", children: ride.verificationLabel })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.scanFindings, children: [
      checkRideHeadline(ride),
      counts ? ` \xB7 ${counts}` : "",
      ride?.workflowSource ? ` \xB7 ${ride.workflowSource}` : "",
      ride?.executionId ? ` \xB7 Testkube ${ride.executionId}` : "",
      ride?.finishedOn ? ` \xB7 ${formatDateTime(ride.finishedOn)}` : ""
    ] }),
    ride && /* @__PURE__ */ jsx(Hint, { children: ride.frozen ? `Frozen into this record when it was sealed${ride.attestedRuns ? ` (${ride.attestedRuns} attested run${ride.attestedRuns === 1 ? "" : "s"} on the image then)` : ""}. The qa release gate read the same provenance.` : "Read live from the image's provenance; the Images tab lists every attested run with a download." })
  ] });
}
function changeRequestTone(state) {
  if (!state || state === "created") return "info";
  if (state === "closed-successful") return "ok";
  if (state === "implementing-failed" || state === "closed-unsuccessful") return "bad";
  return "warn";
}
const STATE_WORDS = {
  created: "created, awaiting approval",
  implementing: "implementing",
  "implementing-failed": "implementing, the deploy failed",
  "closed-successful": "closed successful",
  "closed-unsuccessful": "closed unsuccessful"
};
function ChangeRequestFact({ record, classes }) {
  const cr = record.changeRequest;
  if (!cr) return null;
  const label = cr.number ?? cr.id;
  return /* @__PURE__ */ jsxs("div", { className: classes.kv, style: { marginBottom: 10 }, "data-testid": "record-change-request", children: [
    /* @__PURE__ */ jsx(ColumnLabel, { children: "Change request" }),
    /* @__PURE__ */ jsxs("div", { className: classes.scanHead, children: [
      cr.url ? /* @__PURE__ */ jsx(Link, { href: cr.url, target: "_blank", rel: "noopener noreferrer", children: label }) : /* @__PURE__ */ jsx("span", { children: label }),
      /* @__PURE__ */ jsx(StatusChip, { tone: changeRequestTone(cr.state), children: STATE_WORDS[cr.state ?? "created"] ?? cr.state }),
      cr.approval && cr.state === "created" && /* @__PURE__ */ jsxs(Hint, { children: [
        "approval: ",
        cr.approval
      ] }),
      cr.rolledBackByChange && /* @__PURE__ */ jsxs(Hint, { children: [
        "rolled back by ",
        cr.rolledBackByChange
      ] })
    ] })
  ] });
}

export { ChangeRequestFact, CheckRideBlock, changeRequestTone, checkRideHeadline, checkRideOf, checkRideTone };
//# sourceMappingURL=ReleaseRecordEvidence.esm.js.map
