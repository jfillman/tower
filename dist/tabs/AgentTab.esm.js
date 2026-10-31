import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { useTowerMounts } from '../mounts.esm.js';
import { PageHeader } from '../ui/index.esm.js';

function AgentTab() {
  const { agent } = useTowerMounts();
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(PageHeader, { title: "Agent", subtitle: "What this agent is doing and did: its runs, each call it made through Clearance, and the questions it is waiting on." }),
    agent?.element ?? null
  ] });
}

export { AgentTab };
//# sourceMappingURL=AgentTab.esm.js.map
