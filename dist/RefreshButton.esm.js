import { jsxs, jsx } from 'react/jsx-runtime';
import RefreshIcon from '@material-ui/icons/Refresh';
import { Button } from './ui/index.esm.js';

function RefreshButton({ onClick, label = "Refresh" }) {
  return /* @__PURE__ */ jsxs(Button, { small: true, onClick, title: "Re-fetch PR, deploy-history, and image data", children: [
    /* @__PURE__ */ jsx(RefreshIcon, { style: { fontSize: 14 }, "aria-hidden": true }),
    label
  ] });
}

export { RefreshButton };
//# sourceMappingURL=RefreshButton.esm.js.map
