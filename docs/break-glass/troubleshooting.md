# Troubleshooting

The messages Tower shows, what they mean, and what to do. Messages are quoted as Tower shows them; `<…>` stands for a
name.

## Starting a session or a request

| Message | Meaning | What to do |
|---|---|---|
| *<you> is not allowed tower.breakglass.request on component:default/<app>* | You are not an owner of this app. | Ask an owner, or get added to the owning team. |
| *you already have a break-glass request or session open; end or withdraw it first* | One open request or session per person, across all apps. | The panel says where it is. End it, or withdraw the request. |
| *break-glass recordings are not configured (TOWER_BREAKGLASS_MINIO_\*), so no session can start* | The backend has no recordings store. A session that cannot be recorded never starts. | Tell an admin ([admin setup](admin/setup.md#4-the-recordings-store)). |
| *namespace <ns> is not <app>'s <env> environment* | The namespace's own labels (`hangar.io/app`, `hangar.io/env`) do not name this app and environment. | Usually a Tower display problem with an unusual service. Report it with the namespace's labels. |
| *pod <pod> is Pending* (or another phase) | Only a running pod can be debugged. | Pick a running pod, or wait. |
| *pod <pod> has no container <c>* | The container you picked is gone (the pod was replaced). | Reload the pod list. |
| *debug container <name> cannot start: ErrImagePull* (or *ImagePullBackOff*) | The node cannot pull the debug image. | Tell an admin. Nothing was left behind. |
| *debug container <name> did not start within 120s* | The node was slow to start it. | Try again; if it repeats, tell an admin. |
| *… is forbidden: ValidatingAdmissionPolicy '<policy>' … denied request: <rule>* | The cluster's admission policy refused what Backstage tried to create. This should not happen in normal use; the rule's message says which check failed. | Tell an admin, with the message. The session ended and nothing was left behind. |
| *the cluster's policy engine (Kyverno) is not answering, so break-glass is unavailable until it is back (it fails closed)* | A policy webhook is down; the cluster refuses rather than allowing an unchecked session. | Wait, or tell an admin. |

## Approvals (Flight)

| Message | Meaning |
|---|---|
| *a break-glass request needs a second person: you cannot decide your own* | You asked for it, so someone else must approve or deny it. |
| *<you> is not allowed tower.breakglass.approve on …* | Only the app's owners and admins can approve. |
| *this request was decided by someone else a moment ago* | Another approver got there first. Reload the panel. |
| *this request is ended, not awaiting a decision* | It was withdrawn, denied or expired. |
| *this request has expired* | Nobody decided within 30 minutes. The requester asks again. |
| *only the requester can start an approved session* | An approval is for the person who asked. |
| *the approval was not used within 10 minutes; request again* | The start window passed. |

## During the session

| Message | Meaning | What to do |
|---|---|---|
| *Disconnected from the session. Reopen it within 2 minutes or it ends.* | The terminal's connection dropped. | **Reconnect**, or **Reopen terminal** on the pod's Debug panel or the environment's Break-glass card. |
| *the stream to the pod closed; reconnect to continue* | The connection to the pod dropped, but the shell is still running. | **Reconnect**. |
| *opened in another tab* | You opened the same session elsewhere; the terminal moved there. | Use the other tab. |
| *Session ended: shell exited* | You typed `exit` (or the shell died). A debug container cannot restart, so the session is over. | Start a new one if you need more time. |
| *Session ended: pod is gone* | The pod was deleted (a rollout, a scale-down). | Start a new session on a current pod. |
| *only the requester can extend a session* | Extensions are for the person who asked. | |
| *this session has already used its one extension; request a new session* | One extension per session. | End it and request a new one. |

## After the session: notes on the record

| Note | Meaning |
|---|---|
| *recycle skipped: <pod> is the last ready pod of <owner>; restart it from Tower when you can* | Live mode, last ready pod: it still has the debug container. Restart it from Tower (*Restart pods* on the Rollout) when that is safe. You were also notified. |
| *restarted directly, not through Argo CD (…)* | The pod is not managed by the app's Argo CD Application (for example an attached Redis), so it was deleted directly; its controller recreated it. |
| *recycle failed: …* | The pod still has the debug container. Restart it from Tower, or ask an admin. You were notified. |
| *no debug container was added, so the pod was left alone* | The session ended before the debug container was added. |
| *pod was already gone* | Nothing to restart. |
| *copy pod not deleted (Kyverno TTL will): …* | The copy pod could not be deleted at the end; its expiry label removes it within 15 minutes after the session's planned end (Ground). Tell an admin on Flight. |
| *RoleBinding not deleted (Kyverno TTL will): …* | Same, for the grant. |
| *nothing was recorded: no terminal was opened* | The session started but no terminal attached. |

## Reviews and recordings

| Message | Meaning |
|---|---|
| *someone other than the person who broke the glass reviews it* | You broke the glass; another owner or admin reviews it. |
| *review the session once it has ended* | A live session cannot be reviewed. |
| *already reviewed by <user>* | Reviewed once already; the record shows the note. |
| *a review note is required: what the recording shows and whether it was justified* | Write a note. |
| *the recording was deleted on <date>, after the 365-day retention* | The recording is past its retention. The record remains. |
| *the recording is missing from the bucket* | The recording should exist but does not. Tell an admin. |
| *this session has no recording* | It never opened a terminal, or the upload failed (see the session's notes). |

## Questions

**I downloaded a recording and got a `.cast` file. What is it?** A plain-text asciicast recording. Play it in Tower with
**play**, or with `asciinema play`. See [Recordings](recordings.md#downloading).

**Why can't I `ping`?** `ping` needs a capability every debug container drops. Use `nc -zv host port` or `curl`.

**Why can't I write a file, even in `/tmp`?** The whole filesystem is read-only, by policy.

**Can my approver watch my session?** Not live. They can end it, and they can play the recording afterwards.

**Can I debug an infra service, such as skyport-auth?** Yes, from its Topology. An environment with no `cicd.yaml` takes
its cluster's tier: Ground on the dev cluster, Flight anywhere else.

**Can I debug a PR preview?** Yes; previews are Ground.

**Why did my live pod restart?** An ephemeral debug container cannot be removed from a pod, so live mode restarts the
pod at the end. Use copy mode to leave the live pods alone.
