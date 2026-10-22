import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogActions from '@material-ui/core/DialogActions';
import { Progress } from '@backstage/core-components';
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';
import { imageTag } from '../../types.esm.js';
import { useSubmitPin } from '../../environments/releasePins.esm.js';
import { Button } from '../../ui/index.esm.js';
import { useDialogSkin } from '../../ui/dialog.esm.js';
import { PrReceipt, OPENING_PR } from '../../ui/PrRef.esm.js';

const useStyles = makeStyles(() => ({
  text: { color: ({ t }) => t.textLo, lineHeight: 1.6 },
  mono: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textHi },
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
  const d = useDialogSkin();
  const submit = useSubmitPin();
  const close = () => {
    if (submit.loading) return;
    submit.reset();
    onClose();
  };
  const path = target ? `glidepath/releases/${target.env}.yaml` : "";
  return /* @__PURE__ */ jsx(Dialog, { open: target !== null, onClose: close, maxWidth: "sm", fullWidth: true, PaperProps: { className: d.paper }, children: target && /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(DialogTitle, { className: d.title, children: target.flight ? `Promote ${appName} to ${target.env}?` : `${target.env} deploys on push` }),
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
      submit.result?.unchanged && /* @__PURE__ */ jsxs(DialogContentText, { className: c.text, children: [
        target.env,
        " is already pinned to ",
        /* @__PURE__ */ jsx("span", { className: c.mono, children: imageTag(target.image) }),
        ": nothing to do."
      ] }),
      submit.result && !submit.result.unchanged && submit.result.prUrl && /* @__PURE__ */ jsx(
        PrReceipt,
        {
          prUrl: submit.result.prUrl,
          alreadyOpen: submit.result.alreadyOpen,
          updated: submit.result.alreadyOpen,
          next: "merge it to deploy."
        }
      ),
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
          variant: "primary",
          disabled: submit.loading || !owner || !appName,
          onClick: async () => {
            const r = await submit.submit({ owner, appName, env: target.env, image: target.image, promotedFrom: target.from });
            if (r) onDone();
          },
          children: submit.loading ? OPENING_PR : "Open pin PR"
        }
      )
    ] })
  ] }) });
}

export { CloudPromoteDialog };
//# sourceMappingURL=CloudPromoteDialog.esm.js.map
