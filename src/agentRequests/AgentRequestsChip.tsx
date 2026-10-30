import { useEffect, useRef } from 'react';
import { alertApiRef, useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import { StatusChip } from '../ui';
import { useAgentRequests } from './useAgentRequests';

// Tower's agent-requests indicator, on every Tower view but the Agent requests page itself: a chip in the top-right
// corner while a question is waiting on you, and a toast when a new one arrives while Tower is open. Agent requests
// are personal and belong to no app, so no app's Notifications tab can show them; this does, from the page's own
// shared poll (AgentRequestsProvider), with no extra request.

const useStyles = makeStyles(() => ({
  corner: { position: 'absolute', top: 12, right: 16, zIndex: 2 },
}));

export function AgentRequestsChip({ onOpen }: { onOpen: () => void }) {
  const c = useStyles();
  const alertApi = useApi(alertApiRef);
  const { data } = useAgentRequests();
  const seen = useRef<Set<string> | undefined>(undefined);

  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.map(r => r.id));
    // The first answer only sets the baseline: questions already waiting when Tower opened are the chip's to show.
    if (seen.current) {
      const fresh = data.filter(r => !seen.current!.has(r.id));
      for (const r of fresh) {
        alertApi.post({ message: `${r.agent} asks: ${r.question.length > 140 ? `${r.question.slice(0, 139)}…` : r.question}`, severity: 'info', display: 'transient' });
      }
    }
    seen.current = ids;
  }, [data, alertApi]);

  const n = data?.length ?? 0;
  if (n === 0) return null;
  return (
    <div className={c.corner}>
      <StatusChip tone="warn" dot onClick={onOpen} title="Questions Hangar agents asked that you may answer">
        {n === 1 ? '1 agent request' : `${n} agent requests`}
      </StatusChip>
    </div>
  );
}
