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
Backstage Context
  ↓
useReleaseContext.ts (fetch from API)
  ↓
Releases tab / ReleaseRecordDetail component
  ↓
PromoteDialog (environment promotion)
  ↓
useReleaseRecordPersistence (commit to git)
```

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
Tekton API
  ↓
PipelineRunList (list runs)
  ↓
PipelineFlow (render DAG)
  ↓
TaskRunLogConsole (stream logs)
```

## Key Design Decisions

### No Backend Services

Tower reads directly from:
- Kubernetes API (via `kubeconfig` or in-cluster credentials)
- ArgoCD API (direct HTTP calls)
- Tekton Dashboard or Tekton API

This eliminates the operational burden of a dedicated backend service — all queries go through standard APIs.

### Release Records as Git State

Release records (promotions, approvals, metadata) are persisted as git commits, not in a database. This ensures:
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
- Trigger manual sync, force sync
- Application-to-namespace mapping for environment visibility

### Tekton

- List TaskRuns and PipelineRuns
- Stream pod logs for live task debugging
- Render pipeline DAG from Run status

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
