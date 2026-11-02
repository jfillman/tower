import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import type { Notification } from '@backstage/plugin-notifications-common';
import { fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { formatDateTime, relativeTime } from '../shared/format';
import { isRecentNotification } from '../useAppNotifications';
import { Callout, Card, EmptyNote, FilterBar, FilterChips, PageHeader, StatusChip, TextLink, Tile, type StatusTone } from '../ui';
import { shortRef, useAgentRequests, type AgentRequest } from '../agentRequests/useAgentRequests';
import { requestIdOf, useAgentRequestStatuses, type RequestStatus } from '../agentRequests/useAgentRequestStatuses';
import { isRead, usePersonalNotifications } from './usePersonalNotifications';

// The For you page (?view=for-you): what was sent to you personally, across every app: agents' questions, break-glass
// requests to decide and reviews due, release approvals. Broadcasts (pipeline results) stay on each app's
// Notifications tab. Questions still waiting on you are summarised first, since those are the ones an agent is
// waiting on; the list below is history, newest first, the last hour marked new (as Tower's other notifications).
//
// A notification is unread until you open it or mark it read (Backstage's own read state, so its notifications page
// agrees). Unread ones come first; read ones are faded below them, and the Unread filter hides them. An agent's
// question that was answered or has expired says so instead of linking to a question that is gone, and counts as read.

const SEVERITY: Record<string, { tone: StatusTone; label: string }> = {
  critical: { tone: 'bad', label: 'critical' },
  high: { tone: 'warn', label: 'high' },
  normal: { tone: 'info', label: 'normal' },
  low: { tone: 'neutral', label: 'low' },
};

/** The longest a question can stay open: it expires with its session, and a session lives at most 1440 minutes. */
export const REQUEST_MAX_AGE_MS = 24 * 3600_000;

type Show = 'unread' | 'all';

/** What became of an agent question's notification, when it is no longer open. */
export type Resolution = { label: string; title?: string };

/**
 * An agent-requests notification whose question is no longer open, or undefined while it is (or for any other
 * notification). By the backend's status when it has one; else by the pending list: a question with an id that is no
 * longer listed is gone, and an older notification without an id is gone once it is older than any question lives.
 */
export function resolutionOf(
  n: Notification,
  pending: AgentRequest[] | undefined,
  statuses: Record<string, RequestStatus> | undefined,
  now: number,
): Resolution | undefined {
  if (n.payload.topic !== 'agent-requests') return undefined;
  const id = requestIdOf(n);
  if (!id) {
    return now - new Date(n.created).getTime() > REQUEST_MAX_AGE_MS ? { label: 'no longer open' } : undefined;
  }
  const s = statuses?.[id];
  if (s?.status === 'answered') {
    const by = s.answered_by ? ` by ${shortRef(s.answered_by)}` : '';
    const at = s.answered_at ? ` · ${relativeTime(s.answered_at)}` : '';
    return { label: `answered${by}${at}`, title: s.answered_at ? formatDateTime(s.answered_at) : undefined };
  }
  if (s?.status === 'expired') return { label: 'expired', title: formatDateTime(s.expires_at) };
  if (s?.status === 'pending') return undefined;
  if (pending && !pending.some(r => r.id === id)) return { label: 'no longer open' };
  return undefined;
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  root: { padding: '20px 24px 40px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1040 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  layout: { display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr) auto', gap: 12, alignItems: 'baseline' },
  read: { opacity: 0.6 },
  desc: { margin: '2px 0 0', fontSize: 12, color: ({ t }) => t.textFaint },
  meta: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'baseline' },
  fresh: { color: ({ t }) => t.amberInk, fontWeight: 600 },
  resolved: { color: ({ t }) => t.textLo },
}));

function Row({ n, read, resolution, onRead }: { n: Notification; read: boolean; resolution?: Resolution; onRead: () => void }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const navigate = useNavigate();
  const sev = SEVERITY[n.payload.severity ?? 'normal'] ?? SEVERITY.normal;
  const link = resolution ? undefined : n.payload.link;
  const internal = !!link && link.startsWith('/');
  const open = () => {
    if (!read) onRead();
    if (link) navigate(link);
  };
  return (
    <Tile className={read ? `${c.layout} ${c.read}` : c.layout} aria-label={`${read ? 'Read' : 'Unread'}: ${n.payload.title}`}>
      <StatusChip tone={sev.tone}>{sev.label}</StatusChip>
      <div>
        <strong>{n.payload.title}</strong>
        {n.payload.description && <p className={c.desc}>{n.payload.description}</p>}
      </div>
      <span className={c.meta}>
        {!read && isRecentNotification(n) && <span className={c.fresh}>new</span>}
        {n.payload.topic && <span>{n.payload.topic}</span>}
        <span title={formatDateTime(String(n.created))}>{relativeTime(n.created)}</span>
        {resolution && <span className={c.resolved} title={resolution.title}>{resolution.label}</span>}
        {!read && !resolution && <TextLink onClick={onRead}>Mark read</TextLink>}
        {link && (internal
          ? <TextLink onClick={open}>Open →</TextLink>
          : <span onClickCapture={() => { if (!read) onRead(); }}><TextLink href={link}>Open ↗</TextLink></span>)}
      </span>
    </Tile>
  );
}

export function ForYouPage({ onBack, onOpenAgentRequests }: { onBack: () => void; onOpenAgentRequests: () => void }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const personal = usePersonalNotifications();
  const requests = useAgentRequests();
  const waiting = requests.data?.length ?? 0;
  const items = useMemo(() => personal.data ?? [], [personal.data]);
  const ids = useMemo(() => items.map(requestIdOf).filter((x): x is string => !!x), [items]);
  const statuses = useAgentRequestStatuses(ids);
  const [show, setShow] = useState<Show>('unread');
  // Marked read here since the last poll: the list shows it at once rather than at the next poll.
  const [readHere, setReadHere] = useState<Set<string>>(() => new Set());
  const [markError, setMarkError] = useState<string>();
  const asked = useRef(new Set<string>());

  const now = personal.updatedAt ?? Date.now();
  const rows = useMemo(() => {
    const out = items.map(n => {
      const resolution = resolutionOf(n, requests.data, statuses.data, now);
      return { n, resolution, read: isRead(n) || readHere.has(n.id) || Boolean(resolution) };
    });
    // Unread first; each part keeps the list's newest-first order.
    return [...out.filter(r => !r.read), ...out.filter(r => r.read)];
  }, [items, requests.data, statuses.data, now, readHere]);

  const markRead = (toMark: string[]) => {
    const fresh = toMark.filter(id => !asked.current.has(id));
    if (fresh.length === 0) return;
    fresh.forEach(id => asked.current.add(id));
    setReadHere(prev => new Set([...prev, ...fresh]));
    personal.markRead(fresh).catch(e => {
      fresh.forEach(id => asked.current.delete(id));
      setMarkError(e instanceof Error ? e.message : String(e));
    });
  };

  // A question that was answered or expired is read: tell the notifications backend once, so the count agrees.
  const resolvedUnread = rows.filter(r => r.resolution && !isRead(r.n)).map(r => r.n.id).join(',');
  useEffect(() => {
    if (resolvedUnread) markRead(resolvedUnread.split(','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedUnread]);

  const unread = rows.filter(r => !r.read).length;
  const shown = show === 'unread' ? rows.filter(r => !r.read) : rows;
  return (
    <div className={c.root}>
      <TextLink onClick={onBack}>← All services</TextLink>
      <PageHeader title="For you" subtitle="What was sent to you personally, across every app. Pipeline results for everyone stay on each app's Notifications tab." />
      {waiting > 0 && (
        <Callout tone="warn" title={`${waiting} agent ${waiting === 1 ? 'question is' : 'questions are'} waiting on you`}
          actions={<TextLink onClick={onOpenAgentRequests}>Agent requests →</TextLink>} />
      )}
      {personal.error && !personal.data && (
        <Callout tone="bad" title="Your notifications could not be loaded">{personal.error}</Callout>
      )}
      {markError && <Callout tone="bad" title="Could not mark read">{markError}</Callout>}
      <Card title="Sent to you">
        {personal.loading && !personal.data && <EmptyNote>Loading…</EmptyNote>}
        {personal.data && items.length === 0 && <EmptyNote>Nothing has been sent to you personally yet.</EmptyNote>}
        {personal.data && items.length > 0 && (
          <FilterBar>
            <FilterChips<Show>
              label="Show"
              hideLabel
              value={show}
              onChange={setShow}
              options={[{ id: 'unread', label: 'Unread', count: unread }, { id: 'all', label: 'All', count: rows.length }]}
            />
          </FilterBar>
        )}
        {personal.data && items.length > 0 && shown.length === 0 && (
          <EmptyNote>Nothing unread. <TextLink onClick={() => setShow('all')}>Show all</TextLink></EmptyNote>
        )}
        <div className={c.list}>
          {shown.map(r => (
            <Row key={r.n.id} n={r.n} read={r.read} resolution={r.resolution} onRead={() => markRead([r.n.id])} />
          ))}
        </div>
      </Card>
    </div>
  );
}
