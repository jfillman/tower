# Choosing a mode and options

Every option widens what the session can see, and every one of them is written on the session record, shown to the
approver, and kept in the audit log. Choose the least you need.

## Copy of the pod, or the live pod?

| | **Copy of the pod** (recommended) | **The live pod** |
|---|---|---|
| What Tower creates | a **new pod** from this pod's spec, plus the debug container | a debug container **added to the running pod** (an ephemeral container) |
| Traffic | none: the copy carries none of the labels a Service selects | the pod keeps serving traffic while you look |
| Risk to the app | none to the live pods | the debug container shares the pod's resources and network |
| Network view | the copy's own network namespace (same namespace, its own IP) | the live pod's network namespace: its connections, its `localhost` |
| Files | the app's volumes if you tick volume access (emptyDirs start empty: they are the copy's own) | the app's volumes if you tick volume access, including its live emptyDirs |
| Processes | not the live app's | the app container's, if you tick process access |
| At the end | the copy is deleted | the pod is **restarted** (the debug container cannot be removed from a pod) |
| Use it for | DNS, TLS, reaching a dependency, reading config, trying a client (`psql`, `redis-cli`) with the app's settings | a hung connection, a stuck process, state held in memory, what *this* pod is doing right now |

Things to know about the copy:

- **It runs the app too.** The copy is the whole pod: the app's containers start in it as well, they just get no
  traffic. If the app does background work on its own (consumes a queue, runs a scheduler), the copy does that work
  for as long as it lives. Prefer a short duration for such apps, or the live pod.
- **It is not the same pod to the network.** It has its own IP and only the `hangar.io/app` and `hangar.io/env` labels.
  The platform's own NetworkPolicy selects every pod in the namespace, so the copy gets the same ingress rules as the
  app; a custom policy that selects the app's other labels would not cover it.
- It holds the app's ServiceAccount, but **the debug container does not get its token**: Tower mounts an empty volume
  over the token path in the debug container.

## Process access (live pod only)

Ticking **Process access to *container*** shares the app container's process namespace with the debug container. You
see its processes, their command lines and their resource use with `ps` and `top`.

Everything deeper (its open files under `/proc/<pid>/fd`, its filesystem under `/proc/<pid>/root`, its environment under
`/proc/<pid>/environ`) is readable **only if the app runs as the same non-root user as the debug container, UID
65532**. The kernel refuses another user, and the debug container is never root.

**On this platform that is the default.** Airframe runs every Rollout as 65532 (since v0.3.141), so for those apps
process access **does** show the app's files and its environment, including secrets passed as environment variables.
Ask for it only when the reason needs it, and expect the approver to ask why. An app that opts out
(`rollout.podSecurityContext: null`) runs as its image's user and keeps its files and environment to itself, as does
any app running as root. Run `ps -o pid,user,args` first to see which case you are in.

## Volume access (either mode)

Ticking **Volume access to *container*** mounts the volumes the app container mounts, **read-only**, one directory per
volume under `/pod-volumes/<volume>`:

- ConfigMaps, **Secrets**, projected volumes, emptyDirs, persistent volume claims, and other volume types;
- **never** the ServiceAccount token, and **never** a `hostPath`.

Each volume is mounted **whole**. A Kubernetes ephemeral container cannot use `subPath`, so if the app mounts a single
file from a ConfigMap or Secret, you see the whole ConfigMap or Secret. When the session opens, the panel lists every
mounted volume, its kind, where it is in the debug container and where the app sees it:

```text
/pod-volumes/config   configMap, read-only · in the app: /etc/app/config.yaml (config.yaml)
/pod-volumes/db-creds secret, read-only    · in the app: /var/run/secrets/db
```

That list is stored on the session record. Because Secrets are mounted whole, a volume-access session can read every
key of every Secret the container mounts: say so in your reason when that is the point.

## Duration and the extension

- **15, 30 or 60 minutes.** 60 is the maximum. Pick the shortest that will do; the session ends early anyway if you go
  10 minutes without input or output.
- **One free extension: +15 minutes**, for the requester, once per session, on any tier. No approval; it is audited.
  After that, request a new session.
- On Flight the clock starts when you press Start, not when the request is approved.

## Restart a last ready pod (Ground, live pod only)

Live mode restarts the pod at the end. If it is the **only ready pod** of its Deployment or Rollout, restarting it
means a moment with nothing serving, so Tower leaves it alone and notifies you, unless you ticked **Restart the pod at
the end even if it is the only ready one**. On Flight that box does not exist: the last ready pod is never restarted for
you.

## Why never `kubectl exec`?

Tower never offers exec, and on Flight the cluster refuses it to everyone but platform operators.

| | `kubectl exec` into the app container | A break-glass debug container |
|---|---|---|
| Tools | only what the app image ships; a minimal or distroless image has no shell at all | the debug image's tools, whatever the app image is |
| Runs as | the app's user, filesystem and capabilities; writes land in the app container | its own user (65532), read-only, no capabilities, enforced by the cluster |
| Sees | everything the app sees, including environment secrets and mounted Secret files | its own filesystem, plus only what you opted into |
| Controllable at admission | no: exec is all-or-nothing | yes: the cluster checks the image, the user and every security setting |
| Leaves a trace | nothing in the pod | the debug container in the pod spec (live mode, hence the restart), plus the recording |

A debug container is safer for these specific reasons, not by nature: run as the app's own user with its process
namespace shared, it would reach the same secrets as exec. That is why process access is an explicit, recorded opt-in.
