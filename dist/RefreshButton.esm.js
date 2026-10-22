import { jsx, jsxs } from 'react/jsx-runtime';
import { useState, useRef, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import CheckIcon from '@material-ui/icons/Check';
import RefreshIcon from '@material-ui/icons/Refresh';
import { Button } from './ui/index.esm.js';
import { Tooltip } from './ui/Tooltip.esm.js';

const SPIN_MS = 900;
const DONE_MS = 1500;
const useStyles = makeStyles(() => ({
  "@keyframes refreshSpin": { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } },
  spin: { animation: "$refreshSpin 0.8s linear infinite" }
}));
function RefreshButton({ onClick, label = "Refresh", busy }) {
  const classes = useStyles();
  const [phase, setPhase] = useState("idle");
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);
  useEffect(() => {
    if (phase === "spinning" && !busy) {
      const id = window.setTimeout(() => {
        setPhase("done");
        timers.current.push(window.setTimeout(() => setPhase("idle"), DONE_MS));
      }, SPIN_MS);
      timers.current.push(id);
      return () => window.clearTimeout(id);
    }
    return void 0;
  }, [phase, busy]);
  const spinning = phase === "spinning" || Boolean(busy);
  let text = label;
  if (label && spinning) text = "Refreshing\u2026";
  else if (label && phase === "done") text = "Refreshed";
  return /* @__PURE__ */ jsx(Tooltip, { title: "Re-fetch PR, deploy-history, and image data", children: /* @__PURE__ */ jsxs(
    Button,
    {
      small: true,
      disabled: spinning,
      "aria-live": "polite",
      onClick: () => {
        setPhase("spinning");
        onClick();
      },
      children: [
        phase === "done" && !spinning ? /* @__PURE__ */ jsx(CheckIcon, { style: { fontSize: 14 }, "aria-hidden": true }) : /* @__PURE__ */ jsx(RefreshIcon, { style: { fontSize: 14 }, className: spinning ? classes.spin : void 0, "aria-hidden": true }),
        text
      ]
    }
  ) });
}

export { RefreshButton };
//# sourceMappingURL=RefreshButton.esm.js.map
