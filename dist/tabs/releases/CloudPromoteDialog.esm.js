import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogActions from '@material-ui/core/DialogActions';
import Button from '@material-ui/core/Button';
import Link from '@material-ui/core/Link';
import { Progress } from '@backstage/core-components';
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';
import { imageTag } from '../../types.esm.js';
import { useSubmitPin } from '../../environments/releasePins.esm.js';

const useStyles = makeStyles(() => ({
  text: { color: ({ t }) => t.textLo, lineHeight: 1.6 },
  mono: { fontFamily: fontMono, fontSize: 12.5, color: ({ t }) => t.textHi },
  bad: { color: ({ t }) => t.bad }
}));
function CloudPromoteDialog({
  owner,
  appName,
  target,
  onClose,
  onDone
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const submit = useSubmitPin();
  const close = () => {
    if (submit.loading) return;
    submit.reset();
    onClose();
  };
  const path = target ? `glidepath/releases/${target.env}.yaml` : "";
  return /* @__PURE__ */ jsx(Dialog, { open: target !== null, onClose: close, maxWidth: "sm", fullWidth: true, children: target && /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(DialogTitle, { children: target.flight ? `Promote ${appName} to ${target.env}?` : `${target.env} deploys on push` }),
    /* @__PURE__ */ jsxs(DialogContent, { children: [
      !target.flight && /* @__PURE__ */ jsxs(DialogContentText, { className: c.text, children: [
        target.env,
        " is a Ground environment of a cloud service: the pipeline's deploy stage updates it on every push, so there is nothing to promote. Only Flight environments take a pinned image."
      ] }),
      target.flight && !submit.result && !submit.error && /* @__PURE__ */ jsxs(DialogContentText, { className: c.text, children: [
        "Opens a pull request on ",
        /* @__PURE__ */ jsxs("span", { className: c.mono, children: [
          owner,
          "/",
          appName
        ] }),
        " pinning",
        " ",
        /* @__PURE__ */ jsx("span", { className: c.mono, children: path }),
        " to ",
        /* @__PURE__ */ jsx("span", { className: c.mono, children: imageTag(target.image) }),
        target.from ? /* @__PURE__ */ jsxs(Fragment, { children: [
          " (from ",
          target.from,
          ")"
        ] }) : null,
        ". Merging it is the approval; Glidepath then deploys exactly that image's digest."
      ] }),
      submit.loading && /* @__PURE__ */ jsx(Progress, {}),
      submit.result && /* @__PURE__ */ jsx(DialogContentText, { className: c.text, children: submit.result.unchanged ? /* @__PURE__ */ jsxs(Fragment, { children: [
        target.env,
        " is already pinned to ",
        /* @__PURE__ */ jsx("span", { className: c.mono, children: imageTag(target.image) }),
        ": nothing to do."
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        submit.result.alreadyOpen ? "The pin PR was already open; it now pins this image: " : "Pull request opened: ",
        /* @__PURE__ */ jsx(Link, { href: submit.result.prUrl, target: "_blank", rel: "noopener noreferrer", className: c.mono, children: submit.result.prUrl })
      ] }) }),
      submit.error && /* @__PURE__ */ jsxs(DialogContentText, { className: c.bad, children: [
        "Couldn't promote: ",
        submit.error
      ] })
    ] }),
    /* @__PURE__ */ jsxs(DialogActions, { children: [
      /* @__PURE__ */ jsx(Button, { onClick: close, disabled: submit.loading, children: submit.result || !target.flight ? "Close" : "Cancel" }),
      target.flight && !submit.result && /* @__PURE__ */ jsx(
        Button,
        {
          color: "primary",
          variant: "contained",
          disabled: submit.loading || !owner || !appName,
          onClick: async () => {
            const r = await submit.submit({ owner, appName, env: target.env, image: target.image, promotedFrom: target.from });
            if (r) onDone();
          },
          children: "Open pin PR"
        }
      )
    ] })
  ] }) });
}

export { CloudPromoteDialog };
//# sourceMappingURL=CloudPromoteDialog.esm.js.map
