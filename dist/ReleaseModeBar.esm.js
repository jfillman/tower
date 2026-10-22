import { jsxs, jsx } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { useHangarTokens } from './brand/tokens.esm.js';
import { RELEASE_MODE_LABEL, RELEASE_MODE_HELP, RELEASE_MODES } from './releaseFlow.esm.js';
import { StatusChip, TextLink, Button, Callout } from './ui/index.esm.js';
import { PrReceipt, OPENING_PR } from './ui/PrRef.esm.js';
import { Tooltip } from './ui/Tooltip.esm.js';

const useStyles = makeStyles(() => ({
  bar: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 12 },
  caption: { color: ({ t }) => t.textLo },
  help: { color: ({ t }) => t.textLo, flex: "1 1 320px", minWidth: 0 },
  choices: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, width: "100%" },
  full: { width: "100%" }
}));
const TONE = { "hand-flown": "warn", assisted: "info", autoland: "ok" };
function ReleaseModeBar({
  info,
  submitting,
  error,
  prUrl,
  alreadyOpen,
  waitingForMerge,
  onChange
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [choosing, setChoosing] = useState(false);
  const [pressed, setPressed] = useState();
  const where = `${info.file.repo}/${info.file.path}`;
  const modeLabel = (m, available) => {
    if (submitting && pressed === m) return OPENING_PR;
    return available ? `Set ${RELEASE_MODE_LABEL[m]}` : `${RELEASE_MODE_LABEL[m]} (not available yet)`;
  };
  return /* @__PURE__ */ jsxs("div", { className: classes.bar, children: [
    /* @__PURE__ */ jsx("span", { className: classes.caption, children: "Release mode" }),
    /* @__PURE__ */ jsx(StatusChip, { tone: TONE[info.mode], dot: true, children: RELEASE_MODE_LABEL[info.mode] }),
    /* @__PURE__ */ jsxs("span", { className: classes.help, children: [
      RELEASE_MODE_HELP[info.mode],
      info.mode === "hand-flown" && info.signoffEnv && ` Sign-off goes on the ${info.signoffEnv} release PR.`,
      info.source !== "app" && " (the platform default)"
    ] }),
    info.canSetMode && /* @__PURE__ */ jsx(TextLink, { expanded: choosing, onClick: () => setChoosing((v) => !v), children: "Change" }),
    choosing && /* @__PURE__ */ jsxs("div", { className: classes.choices, children: [
      RELEASE_MODES.filter((m) => m !== info.mode).map((m) => {
        const available = info.settable.includes(m);
        return /* @__PURE__ */ jsx(Tooltip, { title: RELEASE_MODE_HELP[m], children: /* @__PURE__ */ jsx(
          Button,
          {
            small: true,
            disabled: !available || submitting,
            onClick: () => {
              setPressed(m);
              onChange(m);
            },
            children: modeLabel(m, available)
          }
        ) }, m);
      }),
      /* @__PURE__ */ jsxs("span", { className: classes.caption, children: [
        "Opens a PR to ",
        where,
        "; it takes effect when it merges."
      ] })
    ] }),
    prUrl && /* @__PURE__ */ jsx(
      PrReceipt,
      {
        className: classes.full,
        prUrl,
        alreadyOpen,
        next: waitingForMerge === false ? "the mode has updated." : "merge it. The mode updates here once it lands."
      }
    ),
    error && /* @__PURE__ */ jsx(Callout, { tone: "bad", className: classes.full, children: error })
  ] });
}

export { ReleaseModeBar };
//# sourceMappingURL=ReleaseModeBar.esm.js.map
