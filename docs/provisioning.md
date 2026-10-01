# Provisioning progress

After a user creates an Airframe application, the Tower home page shows how far along it is.

- **In-flight strip** on the Services tab: one row per service being provisioned, with a segmented progress bar, the current step and time remaining. Click a row to open it.
- **Provisioning tab**: one service at a time, with every step, how long each took against its typical duration, and what is still waiting. Deep link: `/tower?view=provisioning&service=<name>`.

## Where the status comes from

Tower reads these through the Kubernetes proxy on the dev cluster, with its existing read-only identity:

| Step | Signal |
|---|---|
| Request accepted | The application XR exists (`catalog.hangar.io`: NodeJS, SpringBoot, Python, Go) |
| Dev cluster chosen | XR condition `DevClusterReady` |
| CI/CD onboarded | XR condition `CicdOnboarded` |
| Repositories and starter files | The XR's `Repository` and `RepositoryFile` objects (label `crossplane.io/composite=<name>`); done when every one the XR composes is `Ready`. Falls back to XR `Ready` if they cannot be read |
| First build and checks | Earliest PipelineRun in `app-<name>-cicd`; progress is tasks finished out of tasks in the pipeline |
| Running healthy in dev | Rollout in `app-<name>-dev`: `Healthy` with all replicas available |

A service counts as in flight if its XR is under 24 hours old and not finished. One that was built more than 4 hours ago but has no rollout on the dev cluster is treated as stalled and dropped, which covers apps that deploy elsewhere (Backstage itself deploys to kind-prod). A finished one stays in the strip for 15 minutes.

The logic lives in `src/provisioning/deriveProvisioning.ts` and is pure, so it is tested against conditions copied from a live XR.

## Known limits

- **Per-resource progress needs a read grant.** The `backstage-github-mr-viewer` ClusterRole (read-only on `repo.github.m.upbound.io` repositories and repositoryfiles) lives in `gitops-cluster-dev`'s `backstage-ingestor-rbac`. On a cluster without it, the step falls back to waiting for the whole XR to be Ready.
- **Typical durations are estimates**, hard-coded in `TYPICAL_SEC`, until Tower records history.
- **Cluster and CI/CD durations on old XRs are not meaningful.** Crossplane resets those condition times on re-reconcile. They are accurate for a service watched while it is being created.
- **A stuck deploy disappears after 4 hours.** A service that is built but never gets a rollout on the dev cluster stops showing, the same as one that deploys elsewhere.
- **The scaffolder does not link here yet.** Landing the user on this page after Go needs the template's success output to point at the deep link above.
