# Design decisions

Why break-glass is built the way it is. Each decision names the alternative that was rejected and the reason, so a
future change can tell what it would undo.

## The starting point

Tower's write actions are delegated (Argo CD does the work) and reviewed (changes are PRs). Pod exec was rejected as a
standing Tower feature: it is neither. It was left for "break-glass only, its own initiative, with session recording,
approval and time-boxing". This is that initiative. It is for an owner mid-incident who needs to look inside a running
pod. It is not for changing a pod as a fix (that is a release, a rollback or a config PR), and not for routine poking at
Ground.

## A debug container, never exec

| | exec | ephemeral debug container |
|---|---|---|
| Admission control | `CONNECT pods/exec`: allow or deny the whole thing | `UPDATE pods/ephemeralcontainers`: the policy sees the full container spec |
| What runs | the app image's tools as the app's user | an approved, pinned image as a fixed non-root user |
| Writes | land in the app container | impossible (read-only root, read-only mounts) |
| Minimal images | often no shell at all | always works |
| Trace in the pod | none | the container stays in the pod spec |

A debug container is safer **for these reasons, not inherently**: run as the app's UID with a shared process namespace,
it reaches the same secrets as exec. So process access is a separate, explicit, recorded option. **Decision:** never
offer exec; offer two debug modes, the lower-risk one (a copy) first. On Flight the cluster refuses exec outright
(`tower-breakglass-no-exec`), making it a cluster fact.

## Just-in-time permission, to itself

**Rejected:** a standing debug role for Backstage, or minting a credential for the user.
**Chosen:** Backstage holds only the right to create RoleBindings to two debug roles. Per session it binds one to
**itself**, in one namespace, with an expiry label, and deletes it at the end. The browser never holds a Kubernetes
credential, and no credential is minted or stored (the platform's never-persisted-credentials preference). The
admission policy keeps the binder right from widening.

The subject is Backstage's real identity on each cluster, learned with a `SelfSubjectReview`, because it differs by
cluster (`backstage-system/…` on kiac-dev, `backstage/…` on kind-prod) and a constant would quietly grant nothing.

## The spike (2026-10-10)

Two unknowns were proved before building:

- **A WebSocket in a Backstage backend plugin: yes**, by subscribing to the Node server's `upgrade` event as Backstage's
  Signals backend does, with the token in `Sec-WebSocket-Protocol`.
- **Ephemeral container + attach from Node: yes**, with `@kubernetes/client-node` 1.4, on kiac-dev. The session was
  recorded as asciicast v2.

What it taught: the hardened securityContext held (writes refused); **same UID + `targetContainerName` reads the
target's filesystem** through `/proc/1/root` (hence process access is opt-in); busybox ran as group 0 by default (hence
the policy requires a non-zero `runAsGroup`); an exited ephemeral container stays in the pod spec (hence live mode
recycles the pod).

## Admission: VAP on Flight, Kyverno-compiled VAP on Ground

The original plan put every rule in Kyverno, for signature checks, TTL cleanup and reports. On kiac-dev the fail-closed
Kyverno webhooks made break-glass unavailable each time Kyverno lost its lease on a saturated node, which on Flight
would be during the incident itself. One unguarded match condition also refused every pod create for ten minutes.
**Decision (2026-10-11):**

- **Flight:** built-in ValidatingAdmissionPolicy for every validation. It runs in the API server, so it is never down on
  its own. A slim Kyverno (admission and cleanup controllers) is planned only for the TTL backstop and the image
  signature check.
- **Ground:** the same rules as Kyverno `ValidatingPolicy` compiled to native VAPs (no webhook), which also moves off
  `ClusterPolicy`, deprecated in Kyverno 1.19.
- Everywhere: every match condition scoped to break-glass objects, every optional field `has()`-guarded.

## Two people on Flight

- **Approvers:** any member of the app's owning team other than the requester, or an admin. The permission framework
  cannot express "someone other than the requester", so the route enforces it, and on Flight the cluster enforces it
  again (the grant's approver must differ from its requester).
- **Nothing before Start.** An approved request touches nothing in the cluster until the requester starts it, within
  10 minutes; the session's clock starts then. A request expires after 30 minutes.
- **Last ready pod:** never recycled on Flight; the same rule as Tower's *Restart pod*.

## Time

- **15, 30 or 60 minutes**, 60 the maximum (the spec's open question, answered 2026-10-11).
- **One free extension of 15 minutes**, no second approval (user decision, 2026-10-11). The cleanup TTL is set to the
  length **plus 15** at creation, so the extension never outlives the cluster's backstop, and the TTL never has to be
  edited mid-session.
- Idle 10 minutes, disconnected 2 minutes: a forgotten tab ends the session.

## Which environments are Ground

- **PR previews are Ground** (user decision, 2026-10-11): throwaway environments on the dev cluster, the same call as
  for Argo CD actions. Known by the namespace's label, read from the cluster.
- **Infra services** (no `cicd.yaml`, such as skyport-auth) take their **cluster's** tier (2026-10-11, after a user
  report). The dev cluster is Ground; anything else, including a cluster not yet listed, is Flight: the safe default.

## Volume access

Asked for by users who needed the app's files and found the debug container's own filesystem empty (2026-10-11).
**Decision:** an explicit opt-in, shown on the record like process access; mounts are **read-only** (and the policy
requires it); never the ServiceAccount token or a `hostPath`; under `/pod-volumes/` so a volume can never shadow the
image's `/bin` or `/etc`. An ephemeral container cannot use `subPath`, so volumes are mounted whole; the record lists the
app's paths to make that visible.

## The copy pod's token

Kubernetes' ServiceAccount admission mounts the app's token into **every** container of a new pod, so a copy-mode shell
could call the Kubernetes API as the app (found 2026-10-11). It skips a container that already mounts something at the
token path, so the debug container gets an empty, read-only volume there. An ephemeral container is never given one.

## Recycling a pod Argo CD does not manage

An attached component (Redis installed by Helm outside the app's Application) is not deletable through Argo CD.
**Options considered:** leave it with the debug container; or delete it directly. **Chosen (user, "option 1",
2026-10-11):** delete directly under the session's grant, with `tower-breakglass-pod-delete` limiting that to pods
carrying a debug container or copy pods, so the grant cannot delete anything else.

## The debug image

Busybox lacked the tools people need (`dig`, `curl`, `jq`, database clients). **Chosen:** an Alpine image built in
jfillman/tower, multi-arch (kind-prod amd64, kiac-dev arm64), signed keylessly with cosign through GitHub OIDC, pinned
by digest in the backend and both clusters' policies. Tools needing capabilities (`ping`, `tcpdump`, `strace`) are left
out on purpose: allowing them would be a policy decision, not an image one.

## Recordings

- **Off the Flight cluster**: MinIO on kiac-dev, so a recording does not live only on the cluster it records.
- **Kept 365 days**, with a SHA-256 on the record.
- **Put and get only** for Backstage's key: it can write and read back, never list or delete.
- **A session never starts without recordings configured.**
- **The player is built on xterm.js** (phase 4), which Tower already ships for the live terminal, rather than the
  asciinema player, which would add a SolidJS runtime to a security feature. The browser checks the hash.

## Glass broken and reviews (phase 4)

The spec asked whether "glass broken" should exist at all in a small lab, since it is the weakest link. It exists, made
as loud as possible:

- grant-only (admins), Flight only;
- **announced to everyone before anything is tried**, so a failed attempt is heard too;
- audited critical; marked on the grant itself, where the cluster checks it;
- **review-due from the moment it opens**, so a session that fails or whose backend dies is still reviewed;
- **reviewers are the people who could have approved it**: an owner other than the requester, or an admin. The review
  needs a note and happens once.

## Build history

| Phase | What | Shipped |
|---|---|---|
| 1 | Spike: WebSocket transport, ephemeral container attach, asciicast | 2026-10-10 |
| 2 | Ground: panel, copy and live modes, recordings, audit; Kyverno policies on kiac-dev | backstage#107, Tower v0.52.0 |
| 2+ | Volume access; exit/reconnect fix; unmanaged-pod recycle | 2026-10-11 |
| 3 | Flight: approvals, SelfSubjectReview subject, VAP on kind-prod, exec deny | backstage#113, Tower v0.54.0, kind-prod#263 |
| 3+ | One extension, previews, infra services, the Tower debug image | backstage#115, Tower v0.55.0, kind-prod#266/#268 |
| 4 | Glass broken, reviews, recording player, retention | backstage#116, Tower#71, kind-prod#270 |

## Still open

Tracked in the platform's break-glass gaps spec:

- an environment-level break-glass view and a cross-app queue for approvals and reviews (today they hang off a pod's
  Debug panel, and an admin's *End* on someone else's session is API-only);
- refusing to start when the recordings store is unreachable;
- object-locked recordings with a transparency-log anchor;
- restricted access to recordings of sessions that could read Secrets;
- review reminders and escalation;
- shorter checkpoints;
- the Flight TTL backstop and image-signature admission (slim Kyverno on kind-prod).
