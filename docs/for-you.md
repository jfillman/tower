# For you

**Tower home → For you →** (`?view=for-you`) lists what was sent to you personally, across every app: an agent's
question, a break-glass request to decide, a review that is due, a release approval. Notifications sent to everyone
(pipeline results) are not here; they stay on each app's **Notifications** tab.

- Questions an agent is still waiting on come first, with a link to [Agent requests](agent-requests.md).
- Below, newest first: each notification's severity, title, description, topic and age. The last hour is marked
  **new**, as on the Notifications tab.
- **Unread / All.** A notification is unread until you open it or press **Mark read**. **Unread** (the default)
  shows only those; **All** adds the read ones, faded, below them. Read is Backstage's own read state, so its
  notifications page and the sidebar count agree.
- **Open →** follows the notification's link inside Tower; **Open ↗** opens an outside link in a new tab. Either
  marks it read.
- **An agent's question that is no longer open** says what became of it instead of linking to it: **answered by
  riley · 2h ago** (who, when the answer went through Tower; just **answered** when it was answered elsewhere),
  **expired**, or **no longer open** when Tower can't tell. It has no Open link and counts as read. A notification
  sent before questions were linked one by one has no question id; it shows as **no longer open** once it is older
  than any question can live (24 hours, the longest session).

It reads the same notifications backend as the Notifications tab, every 30 seconds while the page is open, and keeps
only the notifications addressed to you (a broadcast has no recipient).
