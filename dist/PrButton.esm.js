import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import CheckIcon from '@material-ui/icons/Check';
import { fontMono, useHangarTokens } from './brand/tokens.esm.js';
import { parseGitopsPrTitle } from './useReleaseContext.esm.js';
import { StatusChip } from './ui/index.esm.js';

const TITLE_TRUNCATE = 40;
const useStyles = makeStyles(() => ({
  btn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    maxWidth: "100%",
    fontFamily: fontMono,
    fontSize: 12,
    padding: "7px 12px",
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textHi,
    textDecoration: "none",
    cursor: "pointer"
  },
  merged: { color: ({ t }) => t.textFaint },
  num: { color: ({ t }) => t.sky, flexShrink: 0 },
  numMerged: {
    color: ({ t }) => t.good,
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0
  },
  title: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  ciDot: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 }
}));
const CI_DOT_COLOR = {
  success: "good",
  failure: "bad",
  pending: "amber",
  unknown: "textFaint"
};
function PrButton({
  pr,
  merged = pr.state === "merged",
  showTarget = false,
  className
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const target = showTarget && pr.repo === "gitops" ? parseGitopsPrTitle(pr.title)?.targetEnv : void 0;
  const title = pr.title.length > TITLE_TRUNCATE ? `${pr.title.slice(0, TITLE_TRUNCATE)}\u2026` : pr.title;
  return /* @__PURE__ */ jsxs(
    "a",
    {
      className: [classes.btn, merged ? classes.merged : "", className ?? ""].join(" ").trim(),
      href: pr.url,
      target: "_blank",
      rel: "noopener noreferrer",
      children: [
        merged ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("span", { className: classes.numMerged, children: /* @__PURE__ */ jsx(CheckIcon, { style: { fontSize: 13 } }) }),
          "PR #",
          pr.number,
          " merged"
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("span", { className: classes.num, children: [
            "PR #",
            pr.number
          ] }),
          /* @__PURE__ */ jsxs("span", { className: classes.title, children: [
            title,
            target ? ` \u2192 ${target}` : ""
          ] })
        ] }),
        pr.draft && /* @__PURE__ */ jsx(StatusChip, { tone: "neutral", children: "draft" }),
        !merged && pr.review && pr.review.state !== "pending" && /* @__PURE__ */ jsx(StatusChip, { tone: pr.review.state === "approved" ? "ok" : "bad", children: pr.review.state === "approved" ? "approved" : "changes requested" }),
        !merged && pr.ci && /* @__PURE__ */ jsx(
          "span",
          {
            className: classes.ciDot,
            style: { backgroundColor: t[CI_DOT_COLOR[pr.ci.state]] },
            title: `CI: ${pr.ci.passedChecks}/${pr.ci.totalChecks} checks passed (${pr.ci.state})`
          }
        )
      ]
    }
  );
}

export { PrButton };
//# sourceMappingURL=PrButton.esm.js.map
