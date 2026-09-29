<div align="center">
  <img src="brand/marks/tower-tile.svg" width="88" height="88" alt="Tower mark" />
  <h1>Tower</h1>
  <p><i>Release orchestration and operational intelligence for Backstage.</i></p>
</div>

Tower is a Backstage plugin that brings visibility and control to cloud-native platforms built on Crossplane, ArgoCD, and Tekton. It provides release orchestration, promotion workflows, and operational dashboards for managing infrastructure-as-code deployments.

Part of the [Hangar](https://github.com/jfillman/hangar) platform. Brand files: [docs/brand/](docs/brand/README.md).

## Features

Tabs, in the order of a change's lifecycle: Overview, Pull Requests, Pipelines, Deployments, Releases, Topology,
Images, SLOs, Notifications, App Configuration, Glidepath. Plus fleet dashboards (Fleet Grid, Ops Wall).

- **Release Records**: structured release history, persisted as git commits, with compare and export
- **Release matrix**: which release is live in which environment, along the app's real promotion order
- **Deployments ("Ground Control")**: pipeline DAG per environment, rollout topology, ArgoCD Refresh and Sync, Tekton Re-run and Cancel
- **App Configuration and Glidepath**: edit environment values and `cicd.yaml` through a real GitOps PR, never a direct commit
- **SLOs, topology, images, notifications**: burn rate, live objects, artifact catalog, a time-sliced event feed

## Installation

### Prerequisites

- Backstage 1.17+, using the **new frontend system** (`@backstage/frontend-defaults`'s
  `createApp({ features: [...] })` — Tower's own `index.ts` exports a `createFrontendPlugin`
  instance, not a legacy `<Route>`/plugin-router pair)
- Access to a Kubernetes cluster running:
  - ArgoCD (for sync/promotion controls)
  - Tekton Pipelines (for CI/CD visibility)
  - External Secrets Operator (optional, for secret visibility)
  - Crossplane (optional, for resource composition visibility)

### Install Tower into Backstage

Tower is a real, independently-versioned package, not a source folder to copy in. There's no npm
registry - install it straight from a tagged commit on this repo (see `RELEASING.md` for how tags
get cut):

```bash
yarn workspace app add "@jfillman/tower@jfillman/tower#v0.1.0"
```

Then register it as a feature in `packages/app/src/App.tsx`:

```typescript
import { towerPlugin } from '@jfillman/tower';

export default createApp({
  features: [
    // ...your other features
    towerPlugin,
  ],
});
```

That's it - `towerPlugin` declares its own route (`/tower`), sidebar icon, and title; there's no
separate nav-wiring step.

### Configuration

Tower reads cluster configuration from:
- Kubernetes API access (assumes in-cluster or configured kubeconfig)
- ArgoCD API endpoint (configurable via env or backstage.io labels)
- Tekton dashboard URL (auto-discovered or configured)

Example environment variables:

```bash
ARGOCD_API=https://argocd.example.com
TEKTON_DASHBOARD=https://tekton.example.com
CLUSTER_NAME=prod
```

## Development

### Working on Tower itself

This repo builds and tests standalone - it has its own `yarn.lock` and doesn't need a Backstage
app checked out to develop against:

```bash
yarn install
yarn tsc      # type-check
yarn lint
yarn test
yarn build    # produces dist/, same output shape backstage-cli's package build gives any plugin
```

### Seeing changes in a real Backstage app

There's no live-link/watch mode against a consumer app today - iterate here, then cut a release
(`RELEASING.md`) and bump the pin in the consuming app's `package.json` to try it live.

## Architecture

Tower is a Backstage **frontend plugin** (new frontend system - `createFrontendPlugin` +
`PageBlueprint`, see `src/plugin.tsx`) and consists of:

- **Core Tabs** — Overview, Pull Requests, Pipelines, Deployments, Releases, Topology, Images,
  SLOs, Notifications, App Configuration, Glidepath
- **Components** — Release Record UI, pipeline flow visualization, ArgoCD sync controls
- **Hooks** — Data fetching (Kubernetes API, ArgoCD, Tekton), release persistence, environment
  caching
- **Utilities** — YAML editing, log parsing, schema validation
- **Brand** (`src/brand/`) and **shared/pullRequests** — small, self-contained pieces this plugin
  owns outright rather than depending on host-app internals, so it builds and versions on its own

See `docs/` for detailed architecture and implementation notes.

## Related Repos

- [Hangar](https://github.com/jfillman/hangar) — IDP core platform
- [Glidepath](https://github.com/jfillman/glidepath) — CI/CD engine (Tekton, PaC, cosign)
- [Airframe](https://github.com/jfillman/airframe) — Crossplane XRDs and Compositions
- [Backstage](https://github.com/jfillman/backstage) — Backstage base app (Tower is built as a module within)

## License

Same as Hangar — see [LICENSE](../hangar/LICENSE) for details.
