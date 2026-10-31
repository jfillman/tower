import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { useTowerMounts } from '../mounts.esm.js';
import { PageHeader } from '../ui/index.esm.js';

function ClearanceTab() {
  const { clearance } = useTowerMounts();
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(PageHeader, { title: "Clearance", subtitle: "The agents that may act on this app and what they did to it, as Clearance recorded it." }),
    clearance?.element ?? null
  ] });
}

export { ClearanceTab };
//# sourceMappingURL=ClearanceTab.esm.js.map
