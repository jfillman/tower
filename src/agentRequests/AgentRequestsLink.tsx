import { TextLink } from '../ui';
import { useAgentRequests } from './useAgentRequests';

/** The home page's link to Agent requests, with how many questions are waiting on you (none: just the link). */
export function AgentRequestsLink({ onOpen }: { onOpen: () => void }) {
  const { data } = useAgentRequests();
  const n = data?.length ?? 0;
  return <TextLink onClick={onOpen}>{n > 0 ? `Agent requests (${n}) →` : 'Agent requests →'}</TextLink>;
}
