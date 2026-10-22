import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogActions from '@material-ui/core/DialogActions';
import Link from '@material-ui/core/Link';
import { fontMono, useHangarTokens } from './brand/tokens.esm.js';
import { imageTag } from './types.esm.js';
import { Button, TextLink } from './ui/index.esm.js';
import { useDialogSkin } from './ui/dialog.esm.js';
import { PrReceipt } from './ui/PrRef.esm.js';

const useStyles = makeStyles(() => ({
  lead: { color: ({ t }) => t.textHi, marginBottom: 6 },
  text: { color: ({ t }) => t.textLo },
  error: { color: ({ t }) => t.bad, marginBottom: 6 },
  details: { color: ({ t }) => t.textFaint, fontSize: 12, "& summary": { cursor: "pointer" } },
  detailsBody: { fontFamily: fontMono, fontSize: 11, marginTop: 6, maxHeight: 160, overflow: "auto", overflowWrap: "anywhere" },
  link: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.sky }
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
  const d = useDialogSkin();
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
  let confirmLabel = targetIsLower ? "Commit and deploy" : "Start release";
  if (promote.loading) confirmLabel = targetIsLower ? "Deploying\u2026" : "Starting release\u2026";
  return /* @__PURE__ */ jsx(
    Dialog,
    {
      open: Boolean(target),
      onClose: () => promote.loading ? void 0 : onClose(),
      PaperProps: { className: d.paper },
      children: target && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(DialogTitle, { className: d.title, children: source ? `Promote ${appName} to ${target.target.env}?` : `Deploy ${appName} to ${target.target.env}?` }),
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
              targetIsLower ? `${target.target.env} is a Ground environment, so there's no PR to review.` : `${target.target.env} changes only when you merge the PR. This closes once the release run starts; the Releases tab follows it to the PR.`,
              !targetIsLower && !releaseName && names ? ` Once it's healthy there, this build becomes the release ${names.next}.` : ""
            ] })
          ] }),
          promote.error && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(DialogContentText, { className: classes.error, children: targetIsLower ? "Couldn't deploy." : "Couldn't start the release." }),
            /* @__PURE__ */ jsxs("details", { className: classes.details, children: [
              /* @__PURE__ */ jsx("summary", { children: "Details" }),
              /* @__PURE__ */ jsx("div", { className: classes.detailsBody, children: promote.error })
            ] })
          ] }),
          promote.result?.mode === "pr" && promote.result.prUrl && /* @__PURE__ */ jsx(
            PrReceipt,
            {
              prUrl: promote.result.prUrl,
              alreadyOpen: promote.result.alreadyOpen,
              next: "merge it to release; checks and any sign-off show on the PR."
            }
          ),
          promote.result?.mode === "direct-commit" && /* @__PURE__ */ jsxs(DialogContentText, { className: classes.text, children: [
            "Committed - ArgoCD will sync it shortly:",
            " ",
            /* @__PURE__ */ jsx(Link, { className: classes.link, href: promote.result.commitUrl, target: "_blank", rel: "noopener noreferrer", children: promote.result.commitUrl })
          ] })
        ] }),
        /* @__PURE__ */ jsx(DialogActions, { children: !promote.result ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Button, { onClick: onClose, disabled: promote.loading, children: "Cancel" }),
          /* @__PURE__ */ jsx(Button, { variant: "primary", disabled: promote.loading, onClick: onConfirm, children: confirmLabel })
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
