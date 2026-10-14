import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogActions from '@material-ui/core/DialogActions';
import Link from '@material-ui/core/Link';
import { Progress } from '@backstage/core-components';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { imageTag } from './types.esm.js';
import { Button, TextLink } from './ui/index.esm.js';

const useStyles = makeStyles(() => ({
  paper: {
    backgroundColor: ({ t }) => t.panel,
    backgroundImage: "none",
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6
  },
  title: {
    fontFamily: fontDisplay,
    fontWeight: 700,
    color: ({ t }) => t.textHi,
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`
  },
  lead: { color: ({ t }) => t.textHi, marginBottom: 6 },
  text: { color: ({ t }) => t.textLo },
  error: { color: ({ t }) => t.bad, marginBottom: 6 },
  details: { color: ({ t }) => t.textFaint, fontSize: 12, "& summary": { cursor: "pointer" } },
  detailsBody: { fontFamily: fontMono, fontSize: 11.5, marginTop: 6, maxHeight: 160, overflow: "auto", overflowWrap: "anywhere" },
  link: { fontFamily: fontMono, fontSize: 12.5, color: ({ t }) => t.sky }
}));
const mono = { fontFamily: fontMono };
function PromoteDialog({
  target,
  onClose,
  promote,
  targetIsLower,
  onConfirm,
  names
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [, setSearchParams] = useSearchParams();
  const source = target && "env" in target.source ? target.source : void 0;
  const sourceImage = target && !source ? target.source.image : void 0;
  const appName = source?.appName ?? target?.target.appName ?? "this app";
  const tag = imageTag(source ? source.image : sourceImage ?? "");
  const releaseName = names?.byTag.get(tag);
  const goToDeployment = () => {
    if (!target) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", "deployments");
      next.set("env", target.target.env);
      return next;
    });
    onClose();
  };
  const goToRun = () => {
    const run = promote.result?.pipelineRun;
    if (!run) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", "pipelines");
      next.set("run", run);
      return next;
    });
    onClose();
  };
  return /* @__PURE__ */ jsx(
    Dialog,
    {
      open: Boolean(target),
      onClose: () => promote.loading ? void 0 : onClose(),
      PaperProps: { className: classes.paper },
      children: target && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(DialogTitle, { className: classes.title, children: source ? `Promote ${appName} to ${target.target.env}?` : `Deploy ${appName} to ${target.target.env}?` }),
        /* @__PURE__ */ jsxs(DialogContent, { children: [
          !promote.result && !promote.error && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsxs(DialogContentText, { className: classes.lead, children: [
              targetIsLower ? "Deploys " : "Opens a release PR for ",
              releaseName && /* @__PURE__ */ jsx("b", { children: `${releaseName} ` }),
              /* @__PURE__ */ jsx("span", { style: mono, children: tag }),
              source ? `, now in ${source.env}` : ", its first deploy",
              targetIsLower ? `, to ${target.target.env} straight away.` : "."
            ] }),
            /* @__PURE__ */ jsxs(DialogContentText, { className: classes.text, children: [
              targetIsLower ? `${target.target.env} is a Ground environment, so there's no PR to review.` : `${target.target.env} changes only when you merge the PR. It takes about a minute to appear.`,
              !targetIsLower && !releaseName && names ? ` Once it's healthy there, this build becomes the release ${names.next}.` : ""
            ] })
          ] }),
          promote.loading && /* @__PURE__ */ jsx(Progress, {}),
          promote.error && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(DialogContentText, { className: classes.error, children: targetIsLower ? "Couldn't deploy." : "Couldn't start the release." }),
            /* @__PURE__ */ jsxs("details", { className: classes.details, children: [
              /* @__PURE__ */ jsx("summary", { children: "Details" }),
              /* @__PURE__ */ jsx("div", { className: classes.detailsBody, children: promote.error })
            ] })
          ] }),
          promote.result?.mode === "pr" && /* @__PURE__ */ jsxs(DialogContentText, { className: classes.text, children: [
            promote.result.alreadyOpen ? "A release PR for this promotion is already open:" : "Release PR opened:",
            " ",
            /* @__PURE__ */ jsx(Link, { className: classes.link, href: promote.result.prUrl, target: "_blank", rel: "noopener noreferrer", children: promote.result.prUrl })
          ] }),
          promote.result?.pipelineRun && /* @__PURE__ */ jsxs(DialogContentText, { className: classes.text, children: [
            promote.result.mode === "pipeline" ? "The release pipeline is still running; its PR will appear in the Pull requests tab when it opens. " : "",
            "Release run:",
            " ",
            /* @__PURE__ */ jsx(Link, { className: classes.link, component: "button", onMouseDown: (e) => e.preventDefault(), onClick: goToRun, children: promote.result.pipelineRun })
          ] }),
          promote.result?.mode === "direct-commit" && /* @__PURE__ */ jsxs(DialogContentText, { className: classes.text, children: [
            "Committed - ArgoCD will sync it shortly:",
            " ",
            /* @__PURE__ */ jsx(Link, { className: classes.link, href: promote.result.commitUrl, target: "_blank", rel: "noopener noreferrer", children: promote.result.commitUrl })
          ] })
        ] }),
        /* @__PURE__ */ jsx(DialogActions, { children: !promote.result ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Button, { onClick: onClose, disabled: promote.loading, children: "Cancel" }),
          /* @__PURE__ */ jsx(Button, { variant: "primary", disabled: promote.loading, onClick: onConfirm, children: targetIsLower ? "Commit and deploy" : "Start release" })
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(TextLink, { onClick: goToDeployment, children: "View deployment \u2192" }),
          /* @__PURE__ */ jsx(Button, { onClick: onClose, children: "Close" })
        ] }) })
      ] })
    }
  );
}

export { PromoteDialog };
//# sourceMappingURL=PromoteDialog.esm.js.map
