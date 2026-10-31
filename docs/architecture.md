# Architecture

Tower is built as a Backstage **frontend module** consisting of tab-based UI, data-fetching hooks, and utility components for cloud-native platform visibility.

## Module Structure

```
plugin/src/tower/
├── index.tsx                    # Route entry point
├── useReleaseContext.ts         # Release data context
├── useFleetEnvironments.tsx      # Environment state management
├── useConfigData.ts             # Config schema and validation
│
├── [Tabs] — Primary Views
│   ├── Overview/                # Fleet status, recent activity, metrics
│   ├── Releases/                # Release records, promotion workflows
│   ├── PRs/                      # Pull request CI/CD status
│   ├── Pipelines/               # Tekton pipeline execution
│   └── Config/                  # Cluster config inspection
│
├── [Components] — Shared UI
│   ├── PipelineFlow.tsx         # DAG-based pipeline visualization
│   ├── ReleaseRecordDetail.tsx  # Release record view with promotion
│   ├── ArgoCD*.tsx              # ArgoCD integration components
│   ├── EnvPicker.tsx            # Environment selector
│   └── ...
│
├── [Utilities]
│   ├── schemaValidate.ts        # YAML schema validation
│   ├── YamlBlockEditor.tsx      # YAML editing UI
│   ├── PodLogsView.tsx          # Pod log streaming
│   └── nicknameCache.ts         # Cache for Tekton task names
└── [Hooks]
    ├── useSlos.ts              # SLO tracking
    ├── useReleaseRecordPersistence.ts  # Release persistence
    └── useConfigData.ts        # Config queries
```

## Data Flow

### Release Records

```
Backstage backend /api/glidepath/release-* (GitHub, release-tracking ConfigMaps)
  ↓
useReleaseRecords.ts, releaseFlow.ts (draft, mode, sign-off, planned), useReleaseNames.ts
  ↓
ReleaseRecordPanel: mode bar, Next release card + draft editor, record list, Compare, Changelog
  ↓
ReleaseRecordDetail: masthead, sign-off, outcome, evidence, after-release notes (saved as a PR)
```

The backend owns every write and two scheduled tasks (sign-off poll every 2 minutes, record poll hourly) that open
record and outcome PRs, set sign-off statuses and publish opted-in GitHub Releases. See
[Release records](release-records/index.md#where-it-lives-and-what-runs-on-its-own).

### Cluster State

```
Kubernetes API
  ↓
useFleetEnvironments.tsx (cache environments, watch events)
  ↓
Overview / Config tabs
  ↓
Live status, SLO metrics, activity feeds
```

### CI/CD Pipelines

```
Backstage backend /api/glidepath/live-stream (live runs, pushed: a snapshot then each change; /live-runs polled
  every 6 s when the stream can't open)  +  /api/glidepath/pipeline-history (archived runs)
  ↓  (both answered by glidepath-api)
PipelineRunList (list runs; History range Live / 24h / 7d / 30d)
  ↓
PipelineDag (render DAG)
  ↓
TaskRunLogConsole (live: /live-log, the step's pod log; archived: /pipeline-history/log, Tekton Results logs)
```

Every CI/CD answer comes from glidepath-api, which the backend calls through the control-plane cluster's API server
(`packages/backend/src/glidepathApi.ts` in the backstage repo); an API error or timeout goes back to the person, with
no fallback. Live runs are glidepath-api's `listLiveRuns` (the app's `-cicd` PipelineRuns and TaskRuns now) and
`getLiveLog`; the Ops Wall's fleet views use `/fleet/live`, `/fleet/live/taskruns` and `/fleet/history`, and the Ops
Wall and the drift view read the fleet's release records and their `ReleaseStalled`/`ReleaseDrift` Events from
`/fleet/releases` and `/fleet/release-events`. Until 2026-10-30 the browser read all of these from the cluster through
the Kubernetes proxy itself.

Tekton deletes a finished run from the cluster about an hour after it completes. Older runs come from Tekton Results
(30-day retention) through glidepath-api's `listRuns`, `getRun` and `getRunLog`; until P6 (2026-10-30) the backend
queried and cached Results itself. The Release Record's "What was built" and the cloud deployments view read the same
endpoint. History never reaches back past the creation of the app's `app-<app>-cicd` namespace: Results keys runs by
namespace, so an app deleted and created again under the same name would otherwise show the old app's runs, and its
cloud environments the old app's deploys (smoke-ecs, 2026-10-17).

## Key Design Decisions

### Reads in the browser, writes in the backend

Tower reads clusters through Backstage's Kubernetes proxy (read only), Argo CD through the backend, and CI/CD (runs,
logs, release state, image evidence, tests) from glidepath-api through the backend. Everything that changes something
(Argo CD actions, release PRs, config PRs, release records, Tekton re-runs) goes through routes in Backstage's backend
(`packages/backend/src` in the backstage repo), which check Tower's permissions and audit the write. Tekton writes
(Re-run, Cancel, Flight promote and rollback runs) are then glidepath-api's: the backend asks it, and it creates the
run. The browser never holds a cluster, Argo CD or GitHub credential. See [Security model](security.md).

### Release Records as Git State

Release records (what changed, what was built, sign-offs, notes, outcome) are persisted as files in git, through PRs,
not in a database; the next release's draft and the release modes are files too. This ensures:
- Auditability (full git history)
- No additional persistence layer
- GitOps alignment with infrastructure management

### Context + Hooks over Redux

State management uses React Context (for release data) and custom hooks (for cluster state), not Redux. Justification:
- Simpler onboarding
- Avoids action/reducer boilerplate
- Still supports derived state and memoization

## Integration Points

### ArgoCD

- Fetch Application status, sync state, last sync time
- Refresh and hard refresh; Sync, which follows the Application's own prune policy (environment Applications
  auto-prune); Force sync, confirmed with the out-of-sync resources it replaces (Ground owners, Flight admins);
  Terminate a running sync (owners). The backend's `/argo/capabilities` says which the user may run; the write
  routes decide either way.
- An environment with nothing live still has its Application (`<app>-<env>`), so these stay available after its
  workload is turned off.
- Application-to-namespace mapping for environment visibility

### Tekton (through glidepath-api)

- List TaskRuns and PipelineRuns, live and archived
- Read a running step's pod log for live task debugging
- Render pipeline DAG from Run status
- Re-run and cancel, which glidepath-api performs

### External Secrets Operator

- Show secret sync status, last fetch time
- Detect stale credentials

### Crossplane

- Show composed resources per application
- Track readiness, synced condition
- Alert on composition errors

## Performance Considerations

### Caching Strategy

- Environments cached with 30-second TTL
- Release records cached during session
- Watch connections for live updates where available

### Pagination

- Release records paginated (default 20 per page)
- Pipeline runs use cursor pagination

### Lazy Loading

- Tabs load data on-demand, not all at once
- Pod logs loaded on-request
- Config inspection deferred until user navigates to tab
