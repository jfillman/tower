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

Cluster configuration inspection:
- Current cluster context and API endpoint
- Active environments and their namespaces
- ArgoCD application mappings
- Tekton pipeline triggers and secrets
- Raw YAML viewer for cluster resources

**Key exports:** `ConfigTab`

### Deployments ("Ground Control")
The CI/CD view of one environment: an env picker grouped Ground and Flight, an always-visible ArgoCD command
panel (sync and health, Refresh and Sync), a notification banner, and the pipeline DAG. Clicking a DAG node drives
the stage detail below it. The Rollout starts/completes steps carry real timestamps, and a rollout topology DAG shows
the Rollout's objects. Tier 1 write actions live here: Tekton **Re-run** and **Cancel**, ArgoCD Refresh and plain
Sync (no prune, no force). Verified against real failed and running PipelineRuns on 2026-09-27.

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
Manages the app's own `cicd.yaml` and its `platform/` folder (`pr-env.yaml`, `platform/envs/<env>.yaml`) with a curated
form plus a raw-YAML fallback. Never commits directly: it opens a GitOps PR, like the Config tab.

### Fleet dashboards
A top-level `/tower` dashboard with two views: a **Fleet Grid** and an **Ops Wall**.

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

Live log console for task execution.

**Props:**
```typescript
{
  taskRun: TaskRun;
  onClose: () => void;
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
