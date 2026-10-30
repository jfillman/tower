# Agent requests

Hangar agents sometimes need a person to decide something: roll back or not, which option to take. They ask through
Clearance (the `human.request` tool), and Tower shows you the questions you may answer.

## Where to find them

- **Tower home → Agent requests →.** The link shows how many questions are waiting on you.
- **A notification** arrives for each new question, linking to the same page.

## Who sees a question

Clearance decides, not Tower. You may answer a question when either is true:

- you own the agent's session (you started it), or
- you are in the agent's owning team (its definition's `owner`, a catalog group such as `team-platform`).

So a question from a run that no person started (an event-triggered agent) still reaches its team.

## Answering

- If the agent offered options, each one is a button. Otherwise write your answer and press **Send answer**.
- One answer per question: whoever answers first wins. A late answer says who already answered.
- A question expires with the agent's session; an expired one disappears from the list.
- Agents don't wait for you. Each reads your answer when it next checks (`human.request.get`).

Clearance records every answer (`human.answer`) with who gave it and that it came through Tower.

## For admins

The page and its notifications need the backstage backend's `agent-requests` plugin (`agentRequests.ts`) configured:

| Setting | Value |
|---|---|
| `tower.clearance.baseUrl` (`TOWER_CLEARANCE_URL`) | Clearance's routed people API, e.g. `http://clearance.hangar-dev.local`. Unset: the page says the feature is not configured and nothing polls |
| `tower.clearance.tokenFile` | default `/var/run/secrets/hangar/clearance/token`: a projected service-account token for audience `clearance`, read on every call |

Clearance must accept Tower as a delegate: its gateway's `TOWER_ISSUER`, `TOWER_SERVICE_ACCOUNTS` (Tower's service
account) and `CLEARANCE_DELEGATES` (apron `55-autopilot/clearance`). The backend polls every minute, asking Clearance
per catalog user, and notifies each person once per question (table `agent_request_notified`).
