<div align="center">
  <img src="brand/tower-tile.svg" width="72" height="72" alt="Tower mark" />
</div>

# Tower

Release orchestration and operational intelligence for Backstage.

Tower is a Backstage plugin that brings visibility and control to cloud-native platforms built on Crossplane, ArgoCD, and Tekton. It provides release orchestration, promotion workflows, and operational dashboards for managing infrastructure-as-code deployments.

Part of the [Hangar](https://github.com/jfillman/hangar) Internal Developer Platform ecosystem.

## Highlights

- **It tells you what is wrong, in plain language.** Each environment's Deployments view opens with one sentence:
  *the canary failed and why*, *the image cannot be pulled*, *a container ran out of memory*, *canary in progress,
  step 2 of 4, 50% traffic*, each with what to try first. It reads live Argo CD, Argo Rollouts, pod and event
  signals, worst first, so a real failure is never hidden behind "in progress". See
  [Deployments](deployments.md#plain-language-troubleshooting).
- **Every action explains itself.** A "Which one?" guide for the Argo CD actions, a one-line explanation on every
  Rollout action, confirmations that name what will happen (Force sync lists what it will recreate), and buttons
  you may not use say why.
- **Safe by design.** Tower holds no Kubernetes write permissions. Changes are pull requests; Argo CD and Rollout
  actions are delegated through one narrowly scoped Argo CD account; owners act on their own apps and Flight
  (upper) environments need an admin for anything that bypasses review; every write is audited. See
  [Security model](security.md).
- **Roll back without guesswork.** Abort a bad canary, then roll back to one of the environment's last five healthy
  releases as an ordinary, gated release PR.

## Features

Tabs, in the order of a change's lifecycle: **Overview**, **Pull Requests**, **Pipelines**, **Deployments**,
**Releases**, **Topology**, **Images**, **SLOs**, **Notifications**, **App Configuration**, **Glidepath**. Plus a
fleet-wide dashboard.

- **Release Records**: structured release history, persisted as git commits, with compare and export
- **Release matrix**: which release is live in which environment, along the app's real promotion order
- **Deployments ("Ground Control")**: plain-language troubleshooting, the six-step delivery path per environment, Argo CD Refresh, Sync, Force sync and Terminate, Rollout controls (resume, pause, abort, retry, restart, promote), Roll back
- **Pull requests and checks**: the PRs in flight and their gates
- **App Configuration and Glidepath**: edit an app's environment values and `cicd.yaml` through a real GitOps PR, never a direct commit
- **SLOs, topology, images**: burn rate, live objects, artifact catalog
- **Fleet dashboards**: Fleet Grid and Ops Wall

## Quick Links

- [Deployments](deployments.md) — the troubleshooting banner, the delivery path, and every control explained
- [Security model](security.md) — who may do what, and the guardrails behind each action
- [Installation Guide](installation.md) — Getting Tower running in your Backstage instance
- [Architecture](architecture.md) — How Tower is structured and designed
- [Components Reference](components.md) — Details on each major component
- [Brand](brand/README.md) — the mark and its files

## Related Projects

- [Hangar](https://github.com/jfillman/hangar) — IDP core platform
- [Glidepath](https://github.com/jfillman/glidepath) — CI/CD engine (Tekton, PaC, cosign)
- [Airframe](https://github.com/jfillman/airframe) — Crossplane XRDs and Compositions
- [Autopilot](https://github.com/jfillman/autopilot) — runs AI agent workloads with bounded authority; a Tower Agent tab is planned
