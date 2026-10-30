import { useNavigate } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import type { Notification } from '@backstage/plugin-notifications-common';
import { fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { formatDateTime, relativeTime } from '../shared/format';
import { isRecentNotification } from '../useAppNotifications';
import { Callout, Card, EmptyNote, PageHeader, StatusChip, TextLink, Tile, type StatusTone } from '../ui';
import { useAgentRequests } from '../agentRequests/useAgentRequests';
import { usePersonalNotifications } from './usePersonalNotifications';

// The For you page (?view=for-you): what was sent to you personally, across every app: agents' questions, break-glass
// requests to decide and reviews due, release approvals. Broadcasts (pipeline results) stay on each app's
// Notifications tab. Questions still waiting on you are summarised first, since those are the ones an agent is
// waiting on; the list below is history, newest first, the last hour marked new (as Tower's other notifications).

const SEVERITY: Record<string, { tone: StatusTone; label: string }> = {
  critical: { tone: 'bad', label: 'critical' },
  high: { tone: 'warn', label: 'high' },
  normal: { tone: 'info', label: 'normal' },
  low: { tone: 'neutral', label: 'low' },
};

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  root: { padding: '20px 24px 40px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1040 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  layout: { display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr) auto', gap: 12, alignItems: 'baseline' },
  desc: { margin: '2px 0 0', fontSize: 12, color: ({ t }) => t.textFaint },
  meta: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'baseline' },
  fresh: { color: ({ t }) => t.amberInk, fontWeight: 600 },
}));

function Row({ n }: { n: Notification }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const navigate = useNavigate();
  const sev = SEVERITY[n.payload.severity ?? 'normal'] ?? SEVERITY.normal;
  const link = n.payload.link;
  const internal = !!link && link.startsWith('/');
  return (
    <Tile className={c.layout}>
      <StatusChip tone={sev.tone}>{sev.label}</StatusChip>
      <div>
        <strong>{n.payload.title}</strong>
        {n.payload.description && <p className={c.desc}>{n.payload.description}</p>}
      </div>
      <span className={c.meta}>
        {isRecentNotification(n) && <span className={c.fresh}>new</span>}
        {n.payload.topic && <span>{n.payload.topic}</span>}
        <span title={formatDateTime(String(n.created))}>{relativeTime(n.created)}</span>
        {link && (internal ? <TextLink onClick={() => navigate(link)}>Open →</TextLink> : <TextLink href={link}>Open ↗</TextLink>)}
      </span>
    </Tile>
  );
}

export function ForYouPage({ onBack, onOpenAgentRequests }: { onBack: () => void; onOpenAgentRequests: () => void }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const personal = usePersonalNotifications();
  const waiting = useAgentRequests().data?.length ?? 0;
  const items = personal.data ?? [];
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
      <Card title="Sent to you">
        {personal.loading && !personal.data && <EmptyNote>Loading…</EmptyNote>}
        {personal.data && items.length === 0 && <EmptyNote>Nothing has been sent to you personally yet.</EmptyNote>}
        <div className={c.list}>
          {items.map(n => (
            <Row key={n.id} n={n} />
          ))}
        </div>
      </Card>
    </div>
  );
}
