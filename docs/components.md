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
The releases lead the page. The header carries the release mode and three numbers (releases this week, open source
PRs, pending promotions; `ReleaseStats` in `CommandDeck.tsx`). Below it, `CommandDeck` lists only what is wrong (a
degraded environment, drift, a pending promotion that isn't the next release's own), and then three cards
(`ReleaseHeroes.tsx`, choices in `releaseCards.ts`):

- **Next release**: its name, the suggested version, where it is (the highest Ground environment running it, then each
  Flight environment: live, release PR open, blocked by failing checks, or not yet), readiness, scope and notes. **Open**
  shows the draft below.
- **Live in production**: the release live in the sign-off environment, its bake progress, readiness score, counted
  sign-offs and how many Flight environments run it.
- **Last outcome**: the newest release with a final outcome, and how it ended.

Sub-tabs: **Releases** (first), Matrix, Log, Lead time, Preview and Changelog. Releases (`src/ReleaseRecordPanel.tsx`)
is the release history and the release being put together, with a row of release chips (the draft and the five
newest records) above it; a card's **Open** selects its release there. See [Release records](release-records/index.md):

- **Mode bar** (`ReleaseModeBar.tsx`): the app's release mode, the sign-off environment, **Change** for admins, and
  **Autoland eligibility** (`AutolandEligibility.tsx`, display only).
- **Next release** (`NextReleaseCard.tsx`, model in `nextRelease.ts`): scope, incoming PRs, linked issues (GitHub, and
  Jira when configured), planned milestone issues, candidates, suggested version, readiness, Promote. The draft editor
  (`ReleaseDraftEditor.tsx`) saves notes, owner, risk, target date, milestone and the GitHub Release opt-in.
- **Record list** (`ReleaseRecordList.tsx`): one row per record, with its tree name (`releaseNames.ts`), Flight ladder,
  readiness score and outcome chip; Compare; **Changelog** (`ReleaseChangelog.tsx`).
- **Record detail** (`ReleaseRecordDetail.tsx`): masthead, **Release notes and sign-off** (`ReleaseSignoffPanel.tsx`),
  **Outcome** (`ReleaseOutcome.tsx`), what changed, what was built, what happened, After release, export.

**Key components:** `ReleasesTab`, `ReleaseRecordPanel`, `ReleaseRecordDetail`

### Pull Requests

GitHub PR integration:
- PR list with linked Tekton pipeline runs
- CI status (checks, reviews, approvals)
- Built artifacts and image tags
- Direct links to runs in Tekton dashboard

**Key exports:** `PRsTab`, `PrButton` (a `PrRef` card; see `src/ui/PrRef.tsx` for `PrRef`/`PrReceipt`)

### Pipelines

Tekton pipeline execution visibility:
- Pipeline run list with status and duration
- Task DAG visualization with live execution state
- Pod log streaming for individual tasks
- Re-run and cancellation controls
- A **Tests** view (Show: Pipeline runs | Tests, or `?view=tests`): every test run Glidepath started for the app as
  Testkube recorded it, newest first. Each row names the workflow and its role (the shared **check ride** the qa
  release gate reads, the team's own test, or an action), the environment, image tag and commit it ran against,
  what each step did, and a **Download JUnit report** link. A run Testkube marked *aborted* although every step
  passed (a known agent race) is shown as passed with a note. A failed run lists its **failed tests** from the
  JUnit report: each case, its failure message, the first stack line in the team's own code, and the full output
  on request. The newest run opens by itself when it failed; any other opens from its *failed tests* link. A
  failed run with no report says so, and points at the end of the test stage's log, where Glidepath's
  `run-testworkflow` prints the failing step's last output. Read through the backend's `/tests` and
  `/tests/report` routes, which glidepath-api answers (`listTests`, `getTestReport`); until P6 (2026-10-30) the
  backend could read the Testkube API server itself. The download names the app (`/tests/report?id=…&app=…`), which
  the route requires: glidepath-api authorizes per app.

**Key exports:** `PipelinesTab`, `PipelineFlow`, `PipelineRunList`

### Config (Configure › Shared values; was "App Configuration")

The config an app shares across its environments, as sub-tabs that each use the values form and its Pending changes panel:
- **Ground shared values**: `glidepath/base.yaml`, the values every Ground environment starts from (PR on the app's repo)
- **Flight shared values**, one per cluster the app has Flight environments on: `gitops-<app>/<cluster>/base.yaml`,
  layered under each Flight environment's `values.yaml` on that cluster (PR on the gitops repo, checked by the values
  gate like a release). A separate file on purpose: a source-repo change never reaches a Flight environment without a
  reviewed gitops PR.
- An **InfraService** has one repo, `gitops-infra-<name>`, for both: its `glidepath/` folder and its `<cluster>/base.yaml`
  files (the backend resolves the repo from the catalog's `kind:infraservice` tag, `appRepos.ts`).
- **Preview environments**: `glidepath/pr-env.yaml`, the template of each pull request preview

An app whose environments render their own chart (`deploy.chart`) gets the raw YAML editor for its shared values, as
its environment rows do; previews render the default chart, so their template keeps the form. An environment's own
values are edited in its row in Configure › Environments.

**Key exports:** `ConfigTab`

### Deployments ("Ground Control")

Every tab that lists environments reads them from the app's Rollouts, else its Deployments. An **InfraService** has
neither: its environment is the StatefulSet its component's operator makes (`skyport-broker-server` for a RabbitMQ
broker), so for a `kind:infraservice` entity Tower also takes a StatefulSet labelled with the service's `hangar.io/app`
and `hangar.io/env`. The environment's Argo CD app is `<hangar.io/app>-<env>`. An app's own attached components run
StatefulSets too, so this applies only to an InfraService.
The CI/CD view of one environment: an env picker grouped Ground and Flight, an always-visible ArgoCD command
panel (sync and health, Refresh and Sync), a notification banner, and the pipeline DAG. Clicking a DAG node drives
the stage detail below it. The Rollout starts/completes steps carry real timestamps, and a rollout topology DAG shows
the Rollout's objects. Tier 1 write actions live here: Tekton **Re-run** and **Cancel**, ArgoCD Refresh and plain
Sync (no prune, no force). Verified against real failed and running PipelineRuns on 2026-09-27. Re-run and Cancel
go through the backend's `/tekton/rerun` and `/tekton/cancel`, which need the app's owning team (or admins), and then
through glidepath-api (`rerunRun`, `cancelRun`), which creates or patches the run; Tower holds no Tekton write access.

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
The artifact catalog: the app's images and versions from the registry, with supply-chain chips. Each image's panel shows its signature, provenance, SBOM and attested test runs (the check ride and the team's tests, with counts and a download of each test attestation). What the steps and colours mean: [Supply chain](supply-chain.md).

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
  plumbing such as notifications and onboarding re-syncs is off by default). History comes from Tekton Results
  for the whole fleet in one call, through glidepath-api (the backend's `/fleet/history`,
  `src/fleet/useFleetPipelineHistory.ts`).
- **Deployments**: Glidepath release records for upper environments, deploy pipelines for ground and cloud targets,
  Rollouts with nothing behind them; releases waiting for approval; what landed in the window.
- **DORA** (see [installation](installation.md#dora-metrics-source-ops-wall)) and the notifications feed.
- **Release calendar**: every app's next release by tree name, its target date (late ones marked), owner, note
  count, what is on its way to production, and how its last release ended. From the backend's `/release-calendar`
  (`useReleaseCalendar` in `src/releaseFlow.ts`).

URL parameters: `owner`, `window` (`24h`, `7d`), `pipelines` (comma list of `build,deploy,guardrail,platform`), `dora`
(`7`, `30`, `90`). Links open in a new tab so the wall stays put. The layout uses three, two or one column from the
page's own width; in fullscreen it fits the screen exactly and each panel scrolls inside itself (Activity gives up
height first, DORA never). It makes no GitHub calls from the browser; the Release calendar's come from the
backend, cached for five minutes.

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

One release record: masthead, sign-off, outcome, evidence, after-release notes, export.

**Props:**
```typescript
{
  record: ReleaseRecord;
  otherRecords: ReleaseRecord[];
  onCompare: (id: string) => void;
  onBack: () => void;
  appName?: string;
  owner?: string;
  gitopsPrs?: PullRequestSummary[];
  name?: string;                    // the release's tree name
  signoffEnv?: string;              // the environment whose release PR carries the sign-off
  allNames?: Map<string, string>;   // every release's name by image tag
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

Log console for one TaskRun, every step in one window. Live runs read each step's log from the TaskRun's pod through
glidepath-api (`/api/glidepath/live-log`, every 3 s while a step runs; a run outside an app has none); archived runs
(`archive` set) read the step logs Tekton Results stored, through `/api/glidepath/pipeline-history/log`.

**Props:**
```typescript
{
  app?: string;
  taskRun: string;
  steps: TaskStepSummary[];
  archive?: { app: string; result: string; taskRun: string };
  fallback?: { app: string; runName: string; taskRun: string };
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

### Release record hooks

- `useReleaseRecords` (`src/useReleaseRecords.ts`): builds each record from PRs, pipeline runs, deployments and the
  committed record; `withRecordedEvidence` and `displayScore` give one readiness score everywhere.
- `useReleaseNames` (`src/useReleaseNames.ts`): tree names from the committed records' order.
- `src/releaseFlow.ts`: `useReleaseDraft` / `useSaveReleaseDraft`, `useReleaseMode` / `useSubmitReleaseMode`,
  `useReleaseSignoff`, `useReleasePlanned`, `useReleaseCalendar`, each one route on the backend.

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
