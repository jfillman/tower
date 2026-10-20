const SLSA_PROVENANCE = "https://slsa.dev/provenance/v0.2";
const SIMPLE_SIGNING = "cosign.sigstore.dev/signature/simple-signing";
const CONTRADICTED = ["log-entry-mismatch", "digest-mismatch", "signature-invalid"];
function codeOf(a) {
  if (a.verificationCode) return a.verificationCode;
  if (a.verified) return "verified";
  const e = (a.verificationError ?? "").toLowerCase();
  if (e.includes("trust root")) return "trust-root-unavailable";
  if (e.includes("digest does not match")) return "digest-mismatch";
  if (e.includes("timestamps")) return "no-log-entry";
  if (e.includes("inclusion promise") || e.includes("checkpoint")) return "stale-receipt";
  if (e.includes("missing its")) return "incomplete";
  return "signature-invalid";
}
function verdictOf(a) {
  if (!a) return "missing";
  const code = codeOf(a);
  if (code === "verified") return "verified";
  return CONTRADICTED.includes(code) ? "contradicted" : "unverified";
}
function worstVerdict(atts) {
  if (atts.length === 0) return "missing";
  const vs = atts.map(verdictOf);
  if (vs.includes("contradicted")) return "contradicted";
  if (vs.includes("unverified")) return "unverified";
  return "verified";
}
function tasksOf(a) {
  if (!a || a.predicateType !== SLSA_PROVENANCE) return [];
  return (a.predicate?.buildConfig?.tasks ?? []).filter(Boolean);
}
function resultOf(a, task, name) {
  return tasksOf(a).find((t) => t.name === task)?.results?.find((r) => r.name === name)?.value;
}
function isBuildProvenance(a) {
  return a.predicateType === SLSA_PROVENANCE && tasksOf(a).some((t) => t.name === "build-image");
}
function isTestProvenance(a) {
  return a.predicateType === SLSA_PROVENANCE && tasksOf(a).some((t) => t.name === "run-testworkflow");
}
function findSlsa(p) {
  const slsa = p?.attestations.filter((a) => a.predicateType === SLSA_PROVENANCE) ?? [];
  return slsa.find(isBuildProvenance) ?? slsa.find((a) => !isTestProvenance(a)) ?? slsa[0];
}
function num(v) {
  if (v === void 0 || v === "") return void 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : void 0;
}
function testRunOf(a) {
  if (!isTestProvenance(a)) return void 0;
  const r = (name) => resultOf(a, "run-testworkflow", name);
  return {
    attestation: a,
    role: r("role") ?? "test",
    outcome: r("outcome") ?? "",
    testsTotal: num(r("tests-total")),
    testsPassed: num(r("tests-passed")),
    testsFailed: num(r("tests-failed")),
    testsSkipped: num(r("tests-skipped")),
    workflowSource: r("workflow-source") || void 0,
    workflowDigest: r("workflow-digest") || void 0,
    executionId: r("execution-id") || void 0,
    reportPath: r("report-path") || void 0,
    finishedOn: a.predicate?.metadata?.buildFinishedOn
  };
}
function findTestRuns(p) {
  const runs = (p?.attestations ?? []).map(testRunOf).filter((r) => !!r);
  return runs.sort((x, y) => (y.finishedOn ?? "").localeCompare(x.finishedOn ?? ""));
}
function isSharedCheckRide(r) {
  return r.role === "check-ride" && (r.workflowSource?.startsWith("argocd:") ?? false);
}
function findCheckRide(p) {
  const rides = findTestRuns(p).filter((r) => r.role === "check-ride");
  return rides.find((r) => r.outcome === "passed" && verdictOf(r.attestation) === "verified") ?? rides[0];
}
function findReleaseTestRun(p) {
  return findCheckRide(p) ?? findTestRuns(p)[0];
}
function findSbom(p) {
  return p?.attestations.find((a) => /cyclonedx|spdx/i.test(a.predicateType));
}
function findSignature(p) {
  return p?.attestations.find((a) => a.predicateType === SIMPLE_SIGNING);
}
function isSignedAndAttested(p) {
  if (!p) return false;
  return verdictOf(findSlsa(p)) === "verified" && worstVerdict(p.attestations) !== "contradicted";
}
function explain(a, what) {
  const code = codeOf(a);
  const logged = a.transparencyLog ? `Rekor entry #${a.transparencyLog.logIndex}` : "the transparency log";
  switch (code) {
    case "verified":
      return {
        headline: `The ${what} is verified`,
        body: `Its signature checks out against this platform's signing root, and ${logged} shows it was signed while the short-lived signing certificate was valid.`,
        tone: "good",
        label: "verified"
      };
    case "no-log-entry":
      return {
        headline: `The ${what} isn't in the transparency log`,
        body: `Tower found no Rekor entry for it. Without one, nothing shows the short-lived signing certificate was still valid when it was used, so the signature can't be relied on.`,
        consequence: "Treat it as unsigned. It says nothing about tampering; the image may predate the transparency log.",
        tone: "warn",
        label: "not logged"
      };
    case "stale-receipt":
      return {
        headline: `Rekor's receipt for the ${what} couldn't be checked`,
        body: `The receipt in the image was signed with a key Rekor no longer has (it got a new key when it restarted), and Tower couldn't get a fresh receipt from Rekor just now. The entry itself is still in the log.`,
        consequence: "Not a sign of tampering. It should verify once Rekor is reachable; the release gate reads Rekor directly.",
        tone: "warn",
        label: "unchecked"
      };
    case "trust-root-unavailable":
      return {
        headline: `The ${what} couldn't be checked right now`,
        body: "Tower couldn't load this platform's signing root, so nothing on this image could be checked.",
        consequence: "This says nothing about the image. Try again shortly.",
        tone: "warn",
        label: "unchecked"
      };
    case "incomplete":
      return {
        headline: `The ${what} is incomplete`,
        body: "Part of what is needed to check it (the certificate or the signature itself) is missing from the image.",
        consequence: "It can't be verified. Rebuilding the image signs it again.",
        tone: "warn",
        label: "incomplete"
      };
    case "log-entry-mismatch":
      return {
        headline: `The transparency log disagrees with the ${what}`,
        body: `Rekor's entry at the position this ${what} names is a different record from the one it carries.`,
        consequence: "Treat this image as untrusted until someone has looked into it. Don't promote it.",
        tone: "bad",
        label: "contradicted"
      };
    case "digest-mismatch":
      return {
        headline: `The ${what} belongs to a different image`,
        body: "It was signed for another image digest, not this one.",
        consequence: "Treat this image as untrusted until someone has looked into it. Don't promote it.",
        tone: "bad",
        label: "wrong image"
      };
    default:
      return {
        headline: `The ${what}'s signature doesn't check out`,
        body: `Checked against this platform's signing root, the signature failed${a.verificationError ? ` (${a.verificationError})` : ""}.`,
        consequence: "Treat this image as untrusted until someone has looked into it. Don't promote it.",
        tone: "bad",
        label: "failed"
      };
  }
}

export { SIMPLE_SIGNING, SLSA_PROVENANCE, explain, findCheckRide, findReleaseTestRun, findSbom, findSignature, findSlsa, findTestRuns, isBuildProvenance, isSharedCheckRide, isSignedAndAttested, isTestProvenance, testRunOf, verdictOf, worstVerdict };
//# sourceMappingURL=supplyChain.esm.js.map
