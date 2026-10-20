const PATHS = /* @__PURE__ */ new Set(["gitsign", "github-merge-strict", "github-merge"]);
function provenanceCheck(checks) {
  return checks?.find((c) => c.name.replace(/^Pipelines as Code(?:\s+CI)?\s*\/\s*/i, "").replace(/-+\s*$/, "").toLowerCase() === "provenance");
}
function isPinPr(prUrl) {
  return Boolean(prUrl) && !/\/gitops-[^/]+\/pull\//.test(prUrl);
}
function commitProofOf(r) {
  const check = provenanceCheck(r.guardrails?.checks);
  if (!check) return { state: "none" };
  if (isPinPr(r.guardrailsPrUrl)) return { state: "not-required" };
  const sig = check.signature;
  if (sig) {
    if (sig.v === 1 && PATHS.has(sig.path)) return { state: sig.path, evidence: sig };
    return { state: "unknown", evidence: sig };
  }
  if (check.status === "completed" && check.conclusion && check.conclusion !== "success") return { state: "failed" };
  if (check.status !== "completed") return { state: "none" };
  return { state: "not-recorded" };
}
const COMMIT_PROOF_MAX = 6;
const POINTS = { gitsign: 6, "github-merge-strict": 4, "github-merge": 2 };
function commitProofPoints(p) {
  return POINTS[p.state] ?? 0;
}
function commitProofNote(p) {
  switch (p.state) {
    case "gitsign":
      return "An allowed person signed the released commit with their own short-lived Sigstore certificate.";
    case "github-merge-strict":
      return "GitHub merged it for an allowed login, and every commit in the PR is gitsign-signed.";
    case "github-merge":
      return "GitHub merged it for an allowed login; GitHub's key and record are the proof, not a personal key.";
    case "not-required":
      return "Cloud targets don't check commit signatures (glidepath ADR-0020).";
    case "failed":
      return "The provenance gate didn't pass, so the commit isn't proven.";
    case "unknown":
      return "The gate recorded a proof this version of Tower does not read.";
    default:
      return "How the commit was proven isn't on record.";
  }
}
function commitProofChip(p) {
  switch (p.state) {
    case "gitsign":
      return "gitsign";
    case "github-merge-strict":
      return "GitHub merge, strict";
    case "github-merge":
      return "GitHub merge";
    case "not-recorded":
      return "not recorded";
    case "not-required":
      return "not required";
    case "unknown":
      return "unknown proof";
    default:
      return void 0;
  }
}
function commitProofTone(p) {
  if (p.state === "gitsign" || p.state === "github-merge-strict" || p.state === "github-merge") return "ok";
  if (p.state === "failed") return "bad";
  return "neutral";
}
function commitProofLine(p) {
  const e = p.evidence;
  let pr = "its PR";
  if (e?.pr) pr = e.repo ? `${e.repo}#${e.pr}` : `#${e.pr}`;
  const approvers = e?.approvers?.length ? `; approved by ${e.approvers.join(", ")}` : "";
  switch (p.state) {
    case "gitsign":
      return `Signed by ${e?.signer ?? "an allowed signer"} (Sigstore, logged in Rekor)`;
    case "github-merge-strict":
      return `Merged by ${e?.mergedBy ?? "an allowed login"} in ${pr}; all${e?.strictCommits ? ` ${e.strictCommits}` : ""} commits gitsign-signed${approvers}`;
    case "github-merge":
      return `Merged by ${e?.mergedBy ?? "an allowed login"} in ${pr} (GitHub's key ${e?.key ?? "web-flow"})${approvers}`;
    case "not-recorded":
      return "Recorded before the gate kept this";
    case "not-required":
      return "Cloud target: commit signing is not checked (ADR-0020)";
    case "failed":
      return "The provenance gate failed; see the gates";
    case "unknown":
      return `Proven by "${e?.path ?? "?"}" (a newer gate than this Tower knows)`;
    default:
      return "No provenance gate result on record";
  }
}
const MERGE_HINT = "Proven by GitHub's signature and its record of who merged, not by a personal key.";
const COMMIT_SIGNING_DOC = "https://github.com/jfillman/glidepath/blob/main/docs/admin/commit-signing.md#what-a-web-flow-signature-does-and-doesnt-prove";
function isMergePath(p) {
  return p.state === "github-merge" || p.state === "github-merge-strict";
}
function commitProofPrUrl(p) {
  const e = p.evidence;
  return e?.repo && e.pr ? `https://github.com/${e.repo}/pull/${e.pr}` : void 0;
}

export { COMMIT_PROOF_MAX, COMMIT_SIGNING_DOC, MERGE_HINT, commitProofChip, commitProofLine, commitProofNote, commitProofOf, commitProofPoints, commitProofPrUrl, commitProofTone, isMergePath, provenanceCheck };
//# sourceMappingURL=commitProof.esm.js.map
