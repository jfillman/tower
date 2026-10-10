# Component Reference

## Tab Components

### Overview

Main entry point showing:
- Fleet status grid (per-environment deployment health)
- Recent activity feed (deployments, syncs, errors)
- SLO status across all environments
- Quick links to Releases and Pipelines

**Key exports:** `OverviewTab`

### Releases

Release record management and promotion workflows:
- Release list with search/filter
- Release detail view with full history
- Promotion dialog for tier-aware environment promotion
- Approval workflows per environment tier

**Key exports:** `ReleasesTab`, `ReleaseRecordDetail`, `PromoteDialog`

### Pull Requests

GitHub PR integration:
- PR list with linked Tekton pipeline runs
- CI status (checks, reviews, approvals)
- Built artifacts and image tags
- Direct links to runs in Tekton dashboard

**Key exports:** `PRsTab`, `PrButton`

### Pipelines

Tekton pipeline execution visibility:
- Pipeline run list with status and duration
- Task DAG visualization with live execution state
- Pod log streaming for individual tasks
- Re-run and cancellation controls

**Key exports:** `PipelinesTab`, `PipelineFlow`, `PipelineRunList`

### Config ("App Configuration")

The config an app shares across its environments, as sub-tabs that each use the values form and its Pending changes panel:
- **Ground shared values**: `glidepath/base.yaml`, the values every Ground environment starts from (PR on the app's repo)
- **Flight shared values**, one per cluster the app has Flight environments on: `gitops-<app>/<cluster>/base.yaml`,
  layered under each Flight environment's `values.yaml` on that cluster (PR on the gitops repo, checked by the values
  gate like a release). A separate file on purpose: a source-repo change never reaches a Flight environment without a
  reviewed gitops PR.
- **Preview environments**: `glidepath/pr-env.yaml`, the template of each pull request preview

An app whose environments render their own chart (`deploy.chart`) gets the raw YAML editor for its shared values, as
its environment rows do; previews render the default chart, so their template keeps the form. An environment's own
values are edited in its row on the Environments tab.

**Key exports:** `ConfigTab`

### Deployments ("Ground Control")
The CI/CD view of one environment: an env picker grouped Ground and Flight, an always-visible ArgoCD command
panel (sync and health, Refresh and Sync), a notification banner, and the pipeline DAG. Clicking a DAG node drives
the stage detail below it. The Rollout starts/completes steps carry real timestamps, and a rollout topology DAG shows
the Rollout's objects. Tier 1 write actions live here: Tekton **Re-run** and **Cancel**, ArgoCD Refresh and plain
Sync (no prune, no force). Verified against real failed and running PipelineRuns on 2026-09-27.

**Rollout controls** (glidepath ADR-0021 phase 4) sit in the "Rollout starts" and "Rollout completes" stage details:
Resume, Promote (skip the current step), Promote full, Pause, Abort, Retry and Restart pods. They are Argo CD's
built-in Rollout actions, run by the Backstage backend through Argo CD (`/argo/rollout-actions`,
`/argo/rollout-action`), so Tower holds no Kubernetes RBAC for them. A button is enabled only when Argo CD's own
discovery offers the action for the Rollout's current state and the signed-in user is in the app's owning team (or
admins). On a Flight environment, Promote and Promote full skip canary analysis: they are marked ⚠, confirmed with
that said, audited as critical and announced to everyone like a break-glass bypass. Abort, Promote, Promote full and
Restart pods always ask first.

**Roll back** (Flight environments, under the Rollout controls): pick one of the environment's earlier images
that ran healthy (the last five healthy releases, from the release records), give a reason, and Tower opens a
rollback release PR through the app's own release Pipeline (glidepath ADR-0021 phase 4). On that PR the content
checks report without blocking; integrity checks and approvals apply as always. Abort stops a bad canary now; the
rollback is what makes git stop asking for the bad image.

### Topology
One environment at a time (the same tiered picker as Deployments): the Kubernetes objects an environment runs and
how they relate.

### Images
The artifact catalog: the app's images and versions from the registry, with supply-chain chips.

### SLOs
Sloth-backed SLO burn rate, queried from Prometheus, for every environment of an app (Ground and Flight).

### Notifications
Time-based, not read/unread: "New" (last hour) and "Earlier". No dismissing; a notification ages between the two
on its own.

### Glidepath
Manages the app's own `cicd.yaml` and its `platform/` folder (`pr-env.yaml`, `glidepath/envs/<env>.yaml`) with a curated
form plus a raw-YAML fallback. Never commits directly: it opens a GitOps PR, like the Config tab.

### Fleet dashboards
A top-level `/tower` dashboard (`?view=dashboard`) with two views. **Ops Wall** is the default.

**Ops Wall** (`src/tabs/dashboard/OpsWallDashboard.tsx`, model in `src/fleet/`): what is happening across every
Tower service right now, and what needs a human.

- **Sources**: one dot per data source. Hover for what it reads, how often it refreshes and when it last answered. An
  age shows only when a source is behind schedule (three missed polls) and its panels then dim and say "stale since".
- **Headline numbers** (hover for a definition; click to jump to the panel).
- **Needs attention**: degraded environments, failed or stalled releases, release PRs waiting for merge, failed and
  slow pipelines, paused canaries, Argo CD drift, pods not ready, SLO budgets, stuck provisioning. Rules and
  thresholds in `src/fleet/opsWallModel.ts`.
- **Pipelines**: running now (task progress, elapsed vs typical), then the window's history (a strip of every finished
  run, oldest to newest, and the latest failures). Type filter: Build & test, Deploy, Guardrails, Platform (platform
  plumbing such as notifications and onboarding re-syncs is off by default). History comes from Tekton Results'
  Result summaries for the whole fleet in one call (`src/fleet/useFleetPipelineHistory.ts`).
- **Deployments**: Glidepath release records for upper environments, deploy pipelines for ground and cloud targets,
  Rollouts with nothing behind them; releases waiting for approval; what landed in the window.
- **DORA** (see [installation](installation.md#dora-metrics-source-ops-wall)) and the notifications feed.

URL parameters: `owner`, `window` (`24h`, `7d`), `pipelines` (comma list of `build,deploy,guardrail,platform`), `dora`
(`7`, `30`, `90`). Links open in a new tab so the wall stays put. The layout uses three, two or one column from the
page's own width; in fullscreen it fits the screen exactly and each panel scrolls inside itself (Activity gives up
height first, DORA never). It makes no GitHub calls.

**Fleet Grid**: the app × environment health matrix for the four application kinds.

## Shared Components

### PipelineFlow

DAG rendering for Tekton pipelines and task dependency visualization.

**Props:**
```typescript
{
  pipelineSpec: PipelineSpec;
  pipelineRunStatus?: PipelineRunStatus;
  onTaskClick?: (task: string) => void;
}
```

### ReleaseRecordDetail

Full release record view with promotion workflow.

**Props:**
```typescript
{
  releaseRecord: ReleaseRecord;
  onPromote: (env: string) => Promise<void>;
  onClose: () => void;
}
```

### EnvPicker

Environment selector dropdown.

**Props:**
```typescript
{
  environments: Environment[];
  value?: string;
  onChange: (env: string) => void;
}
```

### YamlBlockEditor

YAML editing UI with schema validation.

**Props:**
```typescript
{
  value: string;
  onChange: (value: string) => void;
  schema?: JSONSchema;
  readOnly?: boolean;
}
```

### PodLogsView

Pod log streaming and display.

**Props:**
```typescript
{
  namespace: string;
  podName: string;
  container?: string;
  tail?: number;  // Last N lines to show
}
```

### PipelineRunList

Paginated list of pipeline runs with filtering.

**Props:**
```typescript
{
  namespace: string;
  limit?: number;
  onSelect?: (run: PipelineRun) => void;
}
```

### TaskRunLogConsole

Log console for one TaskRun, every step in one window. Live runs stream from the pod; archived runs (`archive` set)
read the step logs Tekton Results stored, through `/api/glidepath/pipeline-history/log`.

**Props:**
```typescript
{
  cluster: string;
  namespace: string;
  podName: string;
  steps: TaskStepSummary[];
  archive?: { app: string; result: string; taskRun: string };
}
```

## Hooks

### useReleaseContext

Fetch and manage release records.

**Returns:**
```typescript
{
  releases: ReleaseRecord[];
  loading: boolean;
  error?: Error;
  promote: (releaseId: string, env: string) => Promise<void>;
  refresh: () => Promise<void>;
}
```

### useFleetEnvironments

Fetch and watch cluster environments.

**Returns:**
```typescript
{
  environments: Environment[];
  loading: boolean;
  error?: Error;
  selectedEnv: Environment | null;
  setSelectedEnv: (env: string) => void;
}
```

### useConfigData

Fetch cluster configuration and schema.

**Returns:**
```typescript
{
  config: ClusterConfig;
  schema: JSONSchema;
  loading: boolean;
  error?: Error;
}
```

### useSlos

Fetch SLO data and burn rates.

**Returns:**
```typescript
{
  slos: SLO[];
  burnRates: BurnRate[];
  loading: boolean;
  error?: Error;
}
```

### useReleaseRecordPersistence

Persist release records to git.

**Returns:**
```typescript
{
  save: (record: ReleaseRecord) => Promise<string>;  // Returns commit hash
  loading: boolean;
  error?: Error;
}
```

## Utilities

### schemaValidate.ts

YAML/JSON schema validation.

**Exports:**
- `validateAgainstSchema(data, schema): ValidationResult`
- `serializeYaml(obj): string`
- `parseYaml(text): object`

### notificationFormatting.tsx

Format Kubernetes events and status changes into human-readable messages.

**Exports:**
- `formatEvent(event: K8sEvent): string`
- `formatCondition(condition: Condition): string`
- `getEventIcon(event: K8sEvent): ReactNode`

### nicknameCache.ts

Cache and lookup Tekton task display names (shorter, more readable than task IDs).

**Exports:**
- `getNickname(taskId: string): string`
- `cacheNickname(taskId: string, nickname: string): void`

### activityIcons.tsx

Icons and visual representations for activity types.

**Exports:**
- `DeploymentIcon`
- `SyncIcon`
- `ErrorIcon`
- `SuccessIcon`
- `getPriorityColor(severity: string): string`

### activityRowRenderers.tsx

Render individual activity feed rows for different event types.

**Exports:**
- `renderDeploymentActivity(event): ReactNode`
- `renderSyncActivity(event): ReactNode`
- `renderErrorActivity(event): ReactNode`
