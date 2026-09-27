<div align="center">
  <img src="brand/tower-tile.svg" width="72" height="72" alt="Tower mark" />
</div>

# Tower

Release orchestration and operational intelligence for Backstage.

Tower is a Backstage plugin that brings visibility and control to cloud-native platforms built on Crossplane, ArgoCD, and Tekton. It provides release orchestration, promotion workflows, and operational dashboards for managing infrastructure-as-code deployments.

Part of the [Hangar](https://github.com/jfillman/hangar) Internal Developer Platform ecosystem.

## Features

Tabs, in the order of a change's lifecycle: **Overview**, **Pull Requests**, **Pipelines**, **Deployments**,
**Releases**, **Topology**, **Images**, **SLOs**, **Notifications**, **App Configuration**, **Glidepath**. Plus a
fleet-wide dashboard.

- **Release Records**: structured release history, persisted as git commits, with compare and export
- **Release matrix**: which release is live in which environment, along the app's real promotion order
- **Deployments ("Ground Control")**: pipeline DAG per environment, rollout topology, ArgoCD Refresh and Sync, Tekton Re-run and Cancel
- **Pull requests and checks**: the PRs in flight and their gates
- **App Configuration and Glidepath**: edit an app's environment values and `cicd.yaml` through a real GitOps PR, never a direct commit
- **SLOs, topology, images**: burn rate, live objects, artifact catalog
- **Fleet dashboards**: Fleet Grid and Ops Wall

## Quick Links

- [Installation Guide](installation.md) — Getting Tower running in your Backstage instance
- [Architecture](architecture.md) — How Tower is structured and designed
- [Components Reference](components.md) — Details on each major component
- [Patches](patches.md) — Backstage customizations applied by Tower
- [Brand](brand/README.md) — the mark and its files

## Related Projects

- [Hangar](https://github.com/jfillman/hangar) — IDP core platform
- [Glidepath](https://github.com/jfillman/glidepath) — CI/CD engine (Tekton, PaC, cosign)
- [Airframe](https://github.com/jfillman/airframe) — Crossplane XRDs and Compositions
- [Autopilot](https://github.com/jfillman/autopilot) — runs AI agent workloads with bounded authority; a Tower Agent tab is planned
