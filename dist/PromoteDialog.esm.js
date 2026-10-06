import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogActions from '@material-ui/core/DialogActions';
import Button from '@material-ui/core/Button';
import Link from '@material-ui/core/Link';
import { Progress } from '@backstage/core-components';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { imageTag } from './types.esm.js';

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
  text: { color: ({ t }) => t.textLo },
  error: { color: ({ t }) => t.bad },
  link: { fontFamily: fontMono, fontSize: 12.5, color: ({ t }) => t.sky },
  cancelBtn: { color: ({ t }) => t.textLo },
  confirmBtn: {
    borderColor: ({ t }) => t.amberLine,
    color: ({ t }) => t.amberInk
  }
}));
const mono = { fontFamily: fontMono };
function PromoteDialog({
  target,
  onClose,
  promote,
  targetIsLower,
  onConfirm
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [, setSearchParams] = useSearchParams();
  const source = target && "env" in target.source ? target.source : void 0;
  const sourceImage = target && !source ? target.source.image : void 0;
  const appName = source?.appName ?? target?.target.appName ?? "this app";
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
  return /* @__PURE__ */ jsx(
    Dialog,
    {
      open: Boolean(target),
      onClose: () => promote.loading ? void 0 : onClose(),
      PaperProps: { className: classes.paper },
      children: target && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(DialogTitle, { className: classes.title, children: source ? `Promote ${appName} to ${target.target.env}?` : `Deploy ${appName} to ${target.target.env}?` }),
        /* @__PURE__ */ jsxs(DialogContent, { children: [
          !promote.result && !promote.error && /* @__PURE__ */ jsxs(DialogContentText, { className: classes.text, children: [
            targetIsLower ? /* @__PURE__ */ jsxs(Fragment, { children: [
              "Commits directly to",
              " ",
              /* @__PURE__ */ jsxs("span", { style: mono, children: [
                "envs/",
                target.target.env,
                ".yaml"
              ] }),
              " ",
              "in ",
              appName,
              "'s environments folder (platform/ or glidepath/)",
              " ",
              "- no PR, no review. ArgoCD syncs it as soon as this commit lands."
            ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              "Opens a real PR against",
              " ",
              /* @__PURE__ */ jsxs("span", { style: mono, children: [
                "gitops-",
                appName
              ] }),
              " bumping",
              " ",
              /* @__PURE__ */ jsxs("span", { style: mono, children: [
                target.target.cluster,
                "/",
                target.target.env,
                "/values.yaml"
              ] }),
              ". ArgoCD won't sync anything until that PR is reviewed and merged."
            ] }),
            " ",
            source ? /* @__PURE__ */ jsxs(Fragment, { children: [
              "Image: ",
              /* @__PURE__ */ jsx("span", { style: mono, children: imageTag(source.image) }),
              " - currently promoted to",
              " ",
              source.env,
              "."
            ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              "Image: ",
              /* @__PURE__ */ jsx("span", { style: mono, children: imageTag(sourceImage) }),
              " - not yet deployed anywhere. This is its first deploy."
            ] })
          ] }),
          promote.loading && /* @__PURE__ */ jsx(Progress, {}),
          promote.error && /* @__PURE__ */ jsxs(DialogContentText, { className: classes.error, style: { fontStyle: "italic" }, children: [
            "Couldn't promote: ",
            promote.error
          ] }),
          promote.result?.mode === "pr" && /* @__PURE__ */ jsxs(DialogContentText, { className: classes.text, children: [
            promote.result.alreadyOpen ? "A release PR for this promotion is already open:" : "Release PR opened:",
            " ",
            /* @__PURE__ */ jsx(Link, { className: classes.link, href: promote.result.prUrl, target: "_blank", rel: "noopener noreferrer", children: promote.result.prUrl })
          ] }),
          promote.result?.mode === "direct-commit" && /* @__PURE__ */ jsxs(DialogContentText, { className: classes.text, children: [
            "Committed - ArgoCD will sync it shortly:",
            " ",
            /* @__PURE__ */ jsx(Link, { className: classes.link, href: promote.result.commitUrl, target: "_blank", rel: "noopener noreferrer", children: promote.result.commitUrl })
          ] })
        ] }),
        /* @__PURE__ */ jsx(DialogActions, { children: !promote.result ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Button, { className: classes.cancelBtn, onClick: onClose, disabled: promote.loading, children: "Cancel" }),
          /* @__PURE__ */ jsx(
            Button,
            {
              variant: "outlined",
              className: classes.confirmBtn,
              disabled: promote.loading,
              onClick: onConfirm,
              children: targetIsLower ? "Commit and deploy" : "Open release PR"
            }
          )
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Button, { className: classes.cancelBtn, onClick: onClose, children: "Close" }),
          /* @__PURE__ */ jsx(Button, { variant: "outlined", className: classes.confirmBtn, onClick: goToDeployment, children: "View deployment \u2192" })
        ] }) })
      ] })
    }
  );
}

export { PromoteDialog };
//# sourceMappingURL=PromoteDialog.esm.js.map
