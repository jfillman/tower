import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState } from 'react';
import Link from '@material-ui/core/Link';
import { formatDateTime } from './shared/format.esm.js';
import { ColumnLabel, StatusChip, Hint, TextLink } from './ui/index.esm.js';
import { JsonDocumentView } from './ResourceInspector.esm.js';
import { PrRef } from './ui/PrRef.esm.js';
import { findPromotion, verdictOf, isSharedCheckRide, explain } from './supplyChain.esm.js';
import { commitProofOf, commitProofChip, commitProofPrUrl, commitProofTone, commitProofLine, isMergePath, MERGE_HINT, COMMIT_SIGNING_DOC } from './commitProof.esm.js';

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
function promotionPr(ref) {
  const m = /^([^/#@\s]+\/[^/#@\s]+)#(\d+)/.exec(ref ?? "");
  return m ? { url: `https://github.com/${m[1]}/pull/${m[2]}`, number: Number(m[2]) } : void 0;
}
function FlightPromotionFact({
  record,
  classes
}) {
  const [open, setOpen] = useState(false);
  const p = record.flightPromotion;
  if (!p) return null;
  const statement = findPromotion(record.provenance);
  const pr = promotionPr(p.pullRequest);
  const gates = p.gates ? Object.keys(p.gates).length : 0;
  return /* @__PURE__ */ jsxs("div", { className: classes.kv, style: { marginBottom: 10 }, "data-testid": "record-flight-promotion", children: [
    /* @__PURE__ */ jsx(ColumnLabel, { children: "Promoted to Flight" }),
    /* @__PURE__ */ jsxs("div", { className: classes.scanHead, children: [
      /* @__PURE__ */ jsx("span", { children: p.promotedAt ? formatDateTime(p.promotedAt) : "promoted" }),
      /* @__PURE__ */ jsx(StatusChip, { tone: p.verified ? "ok" : "warn", children: p.verified ? "attestation verified" : "not verified" }),
      pr && /* @__PURE__ */ jsx(PrRef, { pr, size: "inline" }),
      gates > 0 && /* @__PURE__ */ jsxs(Hint, { children: [
        gates,
        " required gate",
        gates === 1 ? "" : "s",
        " green"
      ] }),
      p.runUrl && /* @__PURE__ */ jsx(Link, { href: p.runUrl, target: "_blank", rel: "noopener noreferrer", children: "promoter run" })
    ] }),
    p.source && /* @__PURE__ */ jsxs(Hint, { children: [
      "from ",
      p.source.split("@")[0]
    ] }),
    (p.signer || p.logIndex !== void 0) && /* @__PURE__ */ jsxs(Hint, { children: [
      p.signer && /* @__PURE__ */ jsxs(Fragment, { children: [
        "signed by ",
        p.signer.replace(/^https:\/\/github\.com\//, "")
      ] }),
      p.signer && p.logIndex !== void 0 && " \xB7 ",
      p.logIndex !== void 0 && /* @__PURE__ */ jsxs(Link, { href: `https://search.sigstore.dev/?logIndex=${p.logIndex}`, target: "_blank", rel: "noopener noreferrer", children: [
        "public Rekor #",
        p.logIndex
      ] })
    ] }),
    !p.verified && p.verificationError && /* @__PURE__ */ jsx(Hint, { children: p.verificationError }),
    /* @__PURE__ */ jsx(TextLink, { expanded: open, onClick: () => setOpen((v) => !v), children: "Promotion attestation" }),
    open && /* @__PURE__ */ jsx(
      JsonDocumentView,
      {
        value: statement ? { predicateType: statement.predicateType, subject: statement.subject, predicate: statement.predicate } : { predicateType: "https://hangar.io/attestations/promotion/v1", predicate: p }
      }
    )
  ] });
}
function CommitSignatureBlock({ record, classes }) {
  const proof = commitProofOf(record);
  const chip = commitProofChip(proof);
  if (!chip) return null;
  const prUrl = commitProofPrUrl(proof);
  return /* @__PURE__ */ jsxs("div", { className: classes.scanBlock, "data-testid": "record-commit-signature", children: [
    /* @__PURE__ */ jsxs("div", { className: classes.scanHead, children: [
      /* @__PURE__ */ jsx("span", { className: classes.scanName, children: "Commit signature" }),
      /* @__PURE__ */ jsx(StatusChip, { tone: commitProofTone(proof), children: chip })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.scanFindings, children: [
      commitProofLine(proof),
      prUrl && /* @__PURE__ */ jsxs(Fragment, { children: [
        " \xB7 ",
        /* @__PURE__ */ jsx(PrRef, { pr: { url: prUrl, number: proof.evidence?.pr }, size: "inline" })
      ] })
    ] }),
    isMergePath(proof) && /* @__PURE__ */ jsxs(Hint, { children: [
      MERGE_HINT,
      " ",
      /* @__PURE__ */ jsx(Link, { href: COMMIT_SIGNING_DOC, target: "_blank", rel: "noopener noreferrer", children: "What that means" })
    ] })
  ] });
}
function hasCommitSignature(record) {
  const { state } = commitProofOf(record);
  return state === "gitsign" || state === "github-merge-strict" || state === "github-merge" || state === "unknown";
}

export { ChangeRequestFact, CheckRideBlock, CommitSignatureBlock, FlightPromotionFact, changeRequestTone, checkRideHeadline, checkRideOf, checkRideTone, hasCommitSignature };
//# sourceMappingURL=ReleaseRecordEvidence.esm.js.map
