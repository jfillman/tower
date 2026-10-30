import { jsx } from 'react/jsx-runtime';
import { TextLink } from '../ui/index.esm.js';
import { useAgentRequests } from './useAgentRequests.esm.js';

function AgentRequestsLink({ onOpen }) {
  const { data } = useAgentRequests();
  const n = data?.length ?? 0;
  return /* @__PURE__ */ jsx(TextLink, { onClick: onOpen, children: n > 0 ? `Agent requests (${n}) \u2192` : "Agent requests \u2192" });
}

export { AgentRequestsLink };
//# sourceMappingURL=AgentRequestsLink.esm.js.map
