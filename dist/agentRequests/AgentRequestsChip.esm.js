import { jsx } from 'react/jsx-runtime';
import { useRef, useEffect } from 'react';
import { useApi, alertApiRef } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import { StatusChip } from '../ui/index.esm.js';
import { useAgentRequests } from './useAgentRequests.esm.js';

const useStyles = makeStyles(() => ({
  corner: { position: "absolute", top: 12, right: 16, zIndex: 2 }
}));
function AgentRequestsChip({ onOpen }) {
  const c = useStyles();
  const alertApi = useApi(alertApiRef);
  const { data } = useAgentRequests();
  const seen = useRef(void 0);
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.map((r) => r.id));
    if (seen.current) {
      const fresh = data.filter((r) => !seen.current.has(r.id));
      for (const r of fresh) {
        alertApi.post({ message: `${r.agent} asks: ${r.question.length > 140 ? `${r.question.slice(0, 139)}\u2026` : r.question}`, severity: "info", display: "transient" });
      }
    }
    seen.current = ids;
  }, [data, alertApi]);
  const n = data?.length ?? 0;
  if (n === 0) return null;
  return /* @__PURE__ */ jsx("div", { className: c.corner, children: /* @__PURE__ */ jsx(StatusChip, { tone: "warn", dot: true, onClick: onOpen, title: "Questions Hangar agents asked that you may answer", children: n === 1 ? "1 agent request" : `${n} agent requests` }) });
}

export { AgentRequestsChip };
//# sourceMappingURL=AgentRequestsChip.esm.js.map
