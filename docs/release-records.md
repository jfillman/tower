# Release records

Releases → **Record** is an app's release history: one record per image that reached a Flight environment, with
what changed, what was built and what happened, plus the human context people add. Above the records sits the
release that is still being put together.

## Next release (the draft)

The draft opens the moment the previous release reaches Flight, so an app always has one, before any PR is opened.
It is computed from data Tower already reads and nothing is saved.

| Part | What it is |
|---|---|
| **Scope** | Source PRs merged to main after the previous release's own commit landed. Each merge to main builds an image, and promoting one ships every PR merged up to it, because main is a single line. |
| **Incoming** | Open PRs on the source repo, from any branch. Shown, not in scope: no image from main contains them yet. |
| **Issues** | Issues those PRs close, read from GitHub's closing keywords (`Fixes #12`, `closes owner/repo#5`) in the PR title and body. Issues linked only through a PR's Development sidebar are not seen. |
| **Candidates** | Images built from main since the previous release, newest first, with where each runs on Ground, how long it has been there and how many scope PRs it contains. The leading candidate is the one live on the highest Ground environment. |
| **Readiness** | Checks on the leading candidate: changes merged, running on Ground, 24 hours on Ground, build and scans passed, signed and attested, version bumped, and a healthy previous release to roll back to. Display only: nothing is blocked. |
| **Version** | A suggestion: the previous release's version plus the bump the merged PRs call for (a breaking change: major, or minor before 1.0; a feature: minor; otherwise patch). The real version is whatever the promoted image's tag carries. |

**Notes and owner** is the one part of the draft people write: release notes in Keep a Changelog sections (Added,
Changed, Fixed, Security, Deprecated, Removed), known issues, rollback notes, an owner and a risk level. "Fill empty
sections from the merged PRs" pre-fills the notes from the scope's PR titles. Saving makes a direct commit to
`glidepath/releases/next.yaml` in the app's repo, which builds nothing. When the release reaches Flight, Tower copies
the draft into its record (schema v2, under `release`) and clears the file for the next release. App owners and
admins can edit it. Once loaded, the draft adds three readiness checks: release notes, release owner and, for
Hand-flown apps, sign-off.

**Promote** sends the leading candidate to the first Flight environment through the same promote flow as the
Matrix. Tower only sees the 20 newest merged PRs, so the draft says when older scope may be missing.

Merges that only touch `cicd.yaml`, `glidepath/` or `.tekton/` are in scope but build no image, so a draft can have
scope and no candidate.

## Release modes and sign-off

An app releases in one of three modes:

| Mode | What it means |
|---|---|
| **Hand-flown** | A release PR to the sign-off environment needs an approving review from someone other than the person who merges it. |
| **Assisted** (the default) | A person merges each Flight release PR. Tower records who merged and who reviewed; no sign-off is required. |
| **Autoland** | Releases land in production with no human. Not available yet: it needs real test results and canary metrics to decide on its own. |

The **sign-off environment** is the Flight environment `cicd.yaml` marks `production: true`, else the last Flight
environment. Staging and pre-prod never need a sign-off.

Modes live in one platform-owned file, `release-modes.yaml` in `gitops-cluster-dev-tenants` (`tower.releaseModes` in
app-config moves it). Only admins can change a mode: **Change** in the Record tab's mode bar opens a PR to that file,
and the mode takes effect when the PR merges.

```yaml
defaultMode: assisted
apps:
  boarding-api: hand-flown
```

GitHub Free cannot require a check on a private repository, so Hand-flown is a soft gate:

- Every two minutes Tower sets a `hangar/release-signoff` commit status on each open release PR to the sign-off
  environment: pending until a sign-off counts, then success with who signed.
- A release PR that merges without one (no approval, or only the merger's own) raises a high-severity "Shipped
  without a sign-off" notification, and the record says so.

A **sign-off counts** when it is an approving review (each reviewer's latest review decides), submitted before the
merge, by someone other than the person who merged the PR. Release PRs are opened by the Glidepath app, so with one
GitHub account a sign-off always needs a second account.

The record's **Release notes and sign-off** panel shows the notes the draft carried and the sign-off: from the
record when it was written after the production PR merged, otherwise read live from the PR. The confidence score's
approval points now come from sign-offs that count (+5 each, up to +10), and only from sign-offs the record
carries: one read live from the PR is shown but does not move the score, so a record scores the same in the list,
in Compare and when opened. The list also uses the guardrail results frozen in each committed record, the same ones
the opened record falls back to. Approvals added to a record's human context
after release are shown as acknowledgements and earn nothing.

## Release names

Every release gets a tree name, in order per app, the way hurricanes are named: ASPEN, BIRCH, CEDAR, DOGWOOD...
(U, V and X are skipped; after the last name the list starts again with a numeral, ASPEN II). The first letter shows
where a release falls in the app's history. Names are a different word family from image slugs (lowercase
adjective-animal pairs like `amber-finch`), so "CEDAR, shipped as amber-finch" reads unambiguously: people talk
about the release, the slug says which build went out.

A name is a release's position in the app's committed records (`GET /api/glidepath/release-records`), so it never
changes. A release whose record PR is still open is counted too. A release that reached Flight but never got a
record is shown without a name, since counting it would rename every later release once it leaves Tower's window.
Names show only once that history has loaded.

## Flight environments

When an app has more than one Flight environment (staging, pre-prod, prod), each record shows how far its image
got: ● live there now, ✓ was deployed there, ○ never reached it.

## Which PRs belong to a record

A record's PRs are the ones merged after the previous release's commit landed on main, up to its own. "Landed" is
the merge time of the PR whose merge commit the image was built from, else the build run's start, else the image's
first deploy. The draft uses the same boundary, so a PR is never in both.
