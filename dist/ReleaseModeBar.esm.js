import { jsxs, jsx } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { useHangarTokens } from './brand/tokens.esm.js';
import { RELEASE_MODE_LABEL, RELEASE_MODE_HELP, RELEASE_MODES } from './releaseFlow.esm.js';
import { StatusChip, TextLink, Button } from './ui/index.esm.js';

const useStyles = makeStyles(() => ({
  bar: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 12.5 },
  caption: { color: ({ t }) => t.textLo },
  help: { color: ({ t }) => t.textLo, flex: "1 1 320px", minWidth: 0 },
  choices: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, width: "100%" },
  error: { color: ({ t }) => t.bad }
}));
const TONE = { "hand-flown": "warn", assisted: "info", autoland: "ok" };
function ReleaseModeBar({
  info,
  submitting,
  error,
  prUrl,
  onChange
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [choosing, setChoosing] = useState(false);
  const where = `${info.file.repo}/${info.file.path}`;
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
        return /* @__PURE__ */ jsx(
          Button,
          {
            small: true,
            disabled: !available || submitting,
            title: RELEASE_MODE_HELP[m],
            onClick: () => onChange(m),
            children: available ? `Set ${RELEASE_MODE_LABEL[m]}` : `${RELEASE_MODE_LABEL[m]} (not available yet)`
          },
          m
        );
      }),
      /* @__PURE__ */ jsxs("span", { className: classes.caption, children: [
        "Opens a PR to ",
        where,
        "; it takes effect when it merges."
      ] })
    ] }),
    prUrl && /* @__PURE__ */ jsxs("span", { className: classes.caption, children: [
      "Mode change PR opened \xB7 ",
      /* @__PURE__ */ jsx(TextLink, { href: prUrl, children: "review \u2197" })
    ] }),
    error && /* @__PURE__ */ jsx("span", { className: classes.error, children: error })
  ] });
}

export { ReleaseModeBar };
//# sourceMappingURL=ReleaseModeBar.esm.js.map
