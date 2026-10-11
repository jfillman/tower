# Recordings

Every break-glass session is recorded: every keystroke sent, everything printed, and every terminal resize, with
timestamps. A session cannot start if recordings are not configured.

## Who can see a recording

The app's **owners** and the **admins**. Every play and every download is audited, with who and which session.

## Playing a recording

In any pod's **Debug** panel of the environment, find the session in the list and press **play**. The recording opens
under the list:

![The recording player: the SHA-256 check, Replay, the seek bar, the clock, speed, the start time and retention, and the replayed terminal](screenshots/player.png)

| Control | What it does |
|---|---|
| **Play** / **Pause** / **Replay** | start, pause, or start again from the beginning |
| seek bar | jump to any point; the screen is redrawn exactly as it was then |
| speed | 0.5×, 1×, 2×, 4× or 8× |
| **Close** | close the player |

The replay runs in the same terminal as a live session, so it looks exactly as the session did, colours and all.

- **Pauses are shortened.** A gap of more than 2 seconds plays as 2 seconds, so someone reading a page of output does
  not make you wait. The line under the controls shows the real length (*Recorded 4:12*) next to the playback length.
- **Keystrokes are counted, not replayed.** The shell echoes what was typed, so it is already in the output. The line
  under the controls says how many keystroke events the recording holds.
- **The start time** and **how long the recording is kept** are shown under the controls.

## Is this the real recording?

When a session ends, Backstage stores the recording's **SHA-256** on the session record. The player downloads the
recording, hashes it in your browser, and compares:

| The player shows | Meaning |
|---|---|
| **SHA-256 matches the session record** | the recording is byte-for-byte the one stored when the session ended |
| **SHA-256 does not match the session record** | the file differs from what the session stored: treat it as tampered with, and tell an admin |
| **integrity not checked** | your browser could not hash it (Tower is not on `https` or `localhost`), or the session has no stored hash |

## Downloading

**download** saves the recording as `breakglass-<app>-<env>-<id>.cast`. A `.cast` file is a plain-text
[asciicast v2](https://docs.asciinema.org/manual/asciicast/v2/) file:

- the first line is a JSON header: terminal size, start time, and a title naming the mode, the app, the environment,
  the pod, the requester and the approver (or *glass broken*);
- every other line is one event: `[seconds, "o" | "i" | "r", data]` (output, input, resize).

To play it outside Tower, use [asciinema](https://asciinema.org/) (`asciinema play breakglass-….cast`). To check it
against the record, compare `shasum -a 256 breakglass-….cast` with the SHA-256 shown when you hover **download**.

## How long recordings are kept

**365 days** from the end of the session. Then the storage deletes the recording; the session record stays, with its
hash, its times and its end reason, but **play** and **download** answer *the recording was deleted on <date>, after
the 365-day retention*. Hover **download** to see the date for a session; the player shows it too.

## When a recording is incomplete

| The record says | Why |
|---|---|
| *nothing was recorded: no terminal was opened* | the session was started but nobody attached a terminal |
| *recording is the last checkpoint before the backend restarted* | Backstage restarted mid-session; up to a minute at the end is missing |
| *no recording: the backend restarted before the first checkpoint* | Backstage restarted in the session's first minute |
| *recording upload failed: …* | the storage was unreachable at the end; tell an admin |
