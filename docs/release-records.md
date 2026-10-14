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

**Promote** sends the leading candidate to the first Flight environment through the same promote flow as the
Matrix. Tower only sees the 20 newest merged PRs, so the draft says when older scope may be missing.

Merges that only touch `cicd.yaml`, `glidepath/` or `.tekton/` are in scope but build no image, so a draft can have
scope and no candidate.

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
