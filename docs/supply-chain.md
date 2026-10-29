# Supply chain

Every image Tower shows (the Release matrix, Deployments, a release record) has a supply-chain strip: **Build →
SAST / SBOM → Signature → Tests → Sign + Attest → Rekor → Promoted**, then the environments. Tower checks each signature
itself, in Backstage's backend, against this platform's own Fulcio root and Rekor log (the promotion: against public
Sigstore and the promoter's identity); it does not take the image's word for it.

## What the steps are

| Step | What it stands for |
|---|---|
| **Build** | The SLSA build provenance Tekton Chains signs: which pipeline run built the image, from which commit. The release gate checks this one. |
| **SAST / SBOM** | The CycloneDX software bill of materials attached to the image. |
| **Signature** | The `cosign sign` signature on the image manifest itself. |
| **Tests** | The attested test runs on the image (since 2026-10-19 Tekton Chains attaches every Glidepath test stage's provenance to the image it tested). The step stands for the **check ride**, the run from the shared check-rides repository that the qa release gate reads; the team's own runs are listed in its detail, each with its counts, its Testkube execution and a download of the attestation document. |
| **Sign + Attest** | All of the above together: "n of m verified". |
| **Rekor** | Their entries in the platform's transparency log, which show each signature was made while its 10-minute signing certificate was valid. |
| **Promoted** | The promotion to Flight (Glidepath ADR-0029): the attestation the promoter workflow signs on the Flight copy, verified offline against the public Sigstore root and the promoter workflow's exact identity (`glidepath.promotion.promoterRepo`), the same check an upper cluster's admission makes. Grey for an image in Ground only. Not part of Sign + Attest or Rekor, which stand for what this platform signed. |

## What the colours mean

| Colour | Meaning |
|---|---|
| Green | Checked and verified. |
| Amber | There, but not verified, for a reason that is not evidence of tampering. The step says why and what to do. |
| Red | Something contradicts the image: Rekor's entry is a different record, the signature names another image, or the signature fails. Don't promote it; look into it. |
| Grey | Missing (the image may predate that gate), or still loading. |

A step is green only when what it stands for verified. Before 2026-10-14 the first four turned green as soon as the
item existed, and Sign + Attest when any one attestation verified.

**Tests** reads its colour from the run, not only the signature: green is a verified, passed check ride from the shared
repository; amber is tests that passed with no check ride, a check ride not from the shared repository, or a passed
ride whose attestation didn't verify; red is a latest check ride that failed; grey is no attested run. When a digest
carries several check rides, the newest verified pass is the one shown, so a flaky re-run never hides the evidence.
Since test runs are attested onto the same digest as the build, Tower identifies the **build** provenance by its
`build-image` task rather than taking the first SLSA attestation it finds.

The download on each test run is the provenance document (the SLSA statement's predicate), whose
`buildConfig.tasks[]` entry named `run-testworkflow` carries the result: `outcome`, `role`, `tests-total`,
`tests-passed`, `tests-failed`, `tests-skipped`, `workflow-source`, `workflow-digest`, `execution-id`. The qa
release gate verifies the same document. See Glidepath's `docs/admin/testing.md`.

"Signed and attested", as the readiness score and the record count it, means: the build provenance
verified, and nothing on the image contradicting it.

## The results, in plain words

| Result | What it means | What to do |
|---|---|---|
| Verified | The signature checks out, and its Rekor entry shows it was made while the certificate was valid. | Nothing. |
| Not logged | No Rekor entry was found, so nothing shows the short-lived certificate was valid when it was used. | Treat it as unsigned. The image may predate the transparency log. |
| Unchecked (receipt) | The receipt in the image was signed with a Rekor key that no longer exists, and Tower couldn't get a fresh one. | Not tampering. It verifies once Rekor is reachable; the release gate reads Rekor directly. |
| Unchecked (trust root) | Tower couldn't load the platform's signing root. | Try again shortly. It says nothing about the image. |
| Incomplete | The certificate or signature is missing from the image. | Rebuild to sign again. |
| Contradicted / wrong image / failed | See red, above. | Don't promote the image until someone has looked into it. |

## How Tower checks

- **Receipts are read fresh.** Each signature's Rekor entry is read from Rekor by its log index and used when its body
  matches the image's own copy. Rekor signs the receipt with its current key when it is read, so a receipt from before
  a Rekor key change still verifies. A different body at that index never verifies. Glidepath's provenance gate does
  the same.
- **The image signature's entry is looked up.** Chains logs it to Rekor but doesn't attach the receipt to the image,
  so Tower finds it among the entries next to the image's attestations, by its exact payload hash and signature.
- **Read only.** Tower reads Rekor through <dev-cluster>'s API server as its read identity, which cannot write to the log.
