import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContentText from '@material-ui/core/DialogContentText';
import Checkbox from '@material-ui/core/Checkbox';
import Radio from '@material-ui/core/Radio';
import RadioGroup from '@material-ui/core/RadioGroup';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Link from '@material-ui/core/Link';
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';
import { applyStaged, validateEnvironments, validateAddedFlight } from '../../environments/stagedChanges.esm.js';
import { Field, Button } from '../../ui/index.esm.js';
import { useUi } from '../../ui/styles.esm.js';
import { MAIN_FIELD } from './shared.esm.js';

const useStyles = makeStyles(() => ({
  paper: { backgroundColor: ({ t }) => t.panel, backgroundImage: "none", border: ({ t }) => `1px solid ${t.line}`, borderRadius: 6, minWidth: 440 },
  stack: { display: "flex", flexDirection: "column", gap: 12 },
  mono: { fontFamily: fontMono, fontSize: 12 },
  note: { fontSize: 12.5, color: ({ t }) => t.textLo, marginTop: 8 },
  problem: { fontSize: 12.5, color: ({ t }) => t.bad, marginTop: 10 }
}));
function useDialogStyles() {
  const t = useHangarTokens();
  return { t, c: useStyles({ t }), ui: useUi({ t }) };
}
function AddEnvironmentDialog({
  open,
  onClose,
  current,
  problems,
  targetId,
  targetLabel,
  cloudBlock,
  duplicateOf,
  onStage
}) {
  const { c } = useDialogStyles();
  const [name, setName] = useState("");
  const [tier, setTier] = useState(duplicateOf?.tier ?? "ground");
  const [cluster, setCluster] = useState(duplicateOf?.cluster ?? "");
  const [override, setOverride] = useState("");
  const [releaseStep, setReleaseStep] = useState(true);
  const [copyValues, setCopyValues] = useState(true);
  const mainField = cloudBlock ? MAIN_FIELD[cloudBlock] : void 0;
  const knownClusters = [...new Set(current.filter((e) => e.tier === "flight" && e.cluster).map((e) => e.cluster))];
  const candidate = { name: name.trim(), tier };
  if (tier === "flight" && !cloudBlock && cluster.trim()) candidate.cluster = cluster.trim();
  if (cloudBlock && mainField && override.trim()) candidate[cloudBlock] = { [mainField]: override.trim() };
  if (duplicateOf && cloudBlock && duplicateOf[cloudBlock]) {
    const { [mainField]: _own, ...rest } = duplicateOf[cloudBlock];
    candidate[cloudBlock] = { ...rest, ...candidate[cloudBlock] ?? {} };
    if (Object.keys(candidate[cloudBlock]).length === 0) delete candidate[cloudBlock];
  }
  const withCandidate = applyStaged(current, [{ kind: "add", env: candidate }]);
  const fresh = name.trim() ? [...validateEnvironments(withCandidate, targetId), ...validateAddedFlight(current, withCandidate, targetId)].filter(
    (p) => !problems.includes(p)
  ) : [];
  const ok = Boolean(name.trim()) && fresh.length === 0;
  const reset = () => {
    setName("");
    setTier("ground");
    setCluster("");
    setOverride("");
    setReleaseStep(true);
    setCopyValues(true);
  };
  const close = () => {
    reset();
    onClose();
  };
  return /* @__PURE__ */ jsxs(Dialog, { open, onClose: close, PaperProps: { className: c.paper }, children: [
    /* @__PURE__ */ jsx(DialogTitle, { children: duplicateOf ? `Duplicate ${duplicateOf.name}` : "Add environment" }),
    /* @__PURE__ */ jsx(DialogContent, { children: /* @__PURE__ */ jsxs("div", { className: c.stack, children: [
      /* @__PURE__ */ jsx(Field, { id: "add-env-name", label: "Name", children: (p) => /* @__PURE__ */ jsx("input", { ...p, autoFocus: true, value: name, onChange: (e) => setName(e.target.value) }) }),
      /* @__PURE__ */ jsx("div", { className: c.note, style: { marginTop: -6 }, children: "Lowercase letters, digits and '-', for example qa." }),
      /* @__PURE__ */ jsxs(RadioGroup, { "aria-label": "Tier", value: tier, onChange: (e) => setTier(e.target.value), children: [
        /* @__PURE__ */ jsx(FormControlLabel, { value: "ground", disabled: Boolean(duplicateOf), control: /* @__PURE__ */ jsx(Radio, { size: "small" }), label: "Ground: deploys on every push" }),
        /* @__PURE__ */ jsx(
          FormControlLabel,
          {
            value: "flight",
            disabled: Boolean(duplicateOf),
            control: /* @__PURE__ */ jsx(Radio, { size: "small" }),
            label: "Flight: deploys only through an approved release"
          }
        )
      ] }),
      tier === "flight" && cloudBlock && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("div", { className: c.note, children: "Each release to it opens a pull request on this repo that changes its release pin (glidepath/releases/<name>.yaml). Merging the pull request deploys exactly that image." }),
        /* @__PURE__ */ jsx(
          FormControlLabel,
          {
            control: /* @__PURE__ */ jsx(Checkbox, { size: "small", checked: releaseStep, onChange: (e) => setReleaseStep(e.target.checked) }),
            label: "Also add a release step for it to the pipeline"
          }
        )
      ] }),
      tier === "flight" && !cloudBlock && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Field, { id: "add-env-cluster", label: "Cluster", children: (p) => /* @__PURE__ */ jsx("input", { ...p, list: "flight-clusters", value: cluster, onChange: (e) => setCluster(e.target.value) }) }),
        /* @__PURE__ */ jsx("datalist", { id: "flight-clusters", children: knownClusters.map((k) => /* @__PURE__ */ jsx("option", { value: k }, k)) }),
        /* @__PURE__ */ jsx("div", { className: c.note, style: { marginTop: -6 }, children: "The registered upper cluster it runs on, for example kind-prod." }),
        /* @__PURE__ */ jsx("div", { className: c.note, children: "Creating a Flight environment opens two pull requests: an ApplicationEnvironment request on the tenants repo, then the cicd.yaml change. Merge the request first." }),
        /* @__PURE__ */ jsx(
          FormControlLabel,
          {
            control: /* @__PURE__ */ jsx(Checkbox, { size: "small", checked: releaseStep, onChange: (e) => setReleaseStep(e.target.checked) }),
            label: "Also add a release step for it to the pipeline"
          }
        ),
        /* @__PURE__ */ jsx("div", { className: c.note, style: { marginTop: -6 }, children: "Without a release step nothing in CI releases to this environment. It goes right after the step for the environment before it. Untick to edit the pipeline yourself in the Glidepath tab." })
      ] }),
      cloudBlock && mainField && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Field, { id: "add-env-override", label: `${targetLabel} ${mainField} (optional)`, children: (p) => /* @__PURE__ */ jsx("input", { ...p, value: override, onChange: (e) => setOverride(e.target.value) }) }),
        /* @__PURE__ */ jsx("div", { className: c.note, style: { marginTop: -6 }, children: "Leave empty to use the app-level value." })
      ] }),
      duplicateOf && !cloudBlock && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(
          FormControlLabel,
          {
            control: /* @__PURE__ */ jsx(Checkbox, { size: "small", checked: copyValues, onChange: (e) => setCopyValues(e.target.checked) }),
            label: `Copy the values of ${duplicateOf.name}`
          }
        ),
        /* @__PURE__ */ jsx("div", { className: c.note, style: { marginTop: -6 }, children: tier === "ground" ? `The new environment's values file is created in the same pull request, with the values of ${duplicateOf.name} (its own image excluded).` : `A Flight environment's values file is written by Crossplane after its request merges. When it exists, use "Copy values from" in its Values tab.` })
      ] }),
      duplicateOf && cloudBlock && mainField && /* @__PURE__ */ jsxs("div", { className: c.note, children: [
        "Settings are copied except ",
        mainField,
        ": give it its own above, or both environments will deploy to the same resource."
      ] }),
      fresh.map((p) => /* @__PURE__ */ jsx("div", { className: c.problem, style: { marginTop: 0 }, children: p }, p))
    ] }) }),
    /* @__PURE__ */ jsxs(DialogActions, { children: [
      /* @__PURE__ */ jsx(Button, { onClick: close, children: "Cancel" }),
      /* @__PURE__ */ jsx(
        Button,
        {
          variant: "primary",
          disabled: !ok,
          onClick: () => {
            onStage(candidate, tier === "flight" && releaseStep, duplicateOf && !cloudBlock && copyValues ? duplicateOf.name : void 0);
            reset();
          },
          children: duplicateOf ? "Stage duplicate" : "Stage environment"
        }
      )
    ] })
  ] });
}
function RemoveEnvironmentDialog({
  name,
  appName,
  cloud,
  files,
  blockedBy,
  onCancel,
  onConfirm
}) {
  const { c } = useDialogStyles();
  const [typed, setTyped] = useState("");
  const blocked = blockedBy.length > 0;
  return /* @__PURE__ */ jsxs(Dialog, { open: true, onClose: onCancel, PaperProps: { className: c.paper }, children: [
    /* @__PURE__ */ jsxs(DialogTitle, { children: [
      "Remove ",
      name
    ] }),
    /* @__PURE__ */ jsx(DialogContent, { children: blocked ? /* @__PURE__ */ jsxs(DialogContentText, { className: c.problem, style: { marginTop: 0 }, children: [
      blockedBy.map((p) => `Pipeline "${p}"`).join(", "),
      " still ",
      blockedBy.length > 1 ? "have" : "has",
      " a step for ",
      name,
      ". Remove the step in the Glidepath tab first, then come back."
    ] }) : /* @__PURE__ */ jsxs("div", { className: c.stack, children: [
      /* @__PURE__ */ jsxs(DialogContentText, { component: "div", children: [
        "Staging this removes ",
        name,
        " from cicd.yaml. Nothing happens until you open the pull request and merge it.",
        cloud ? /* @__PURE__ */ jsx("div", { className: c.note, children: "The cloud resource this environment deployed to is not deleted. Remove it in your cloud account." }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("div", { className: c.note, children: "The same pull request deletes, where they exist:" }),
          /* @__PURE__ */ jsx("ul", { className: c.mono, children: files.map((f) => /* @__PURE__ */ jsx("li", { children: f }, f)) }),
          /* @__PURE__ */ jsxs("div", { className: c.note, children: [
            "After it merges, Argo CD prunes the Application",
            " ",
            /* @__PURE__ */ jsxs("span", { className: c.mono, children: [
              appName,
              "-",
              name
            ] }),
            " ",
            "and the namespace",
            " ",
            /* @__PURE__ */ jsxs("span", { className: c.mono, children: [
              "app-",
              appName,
              "-",
              name
            ] }),
            ", deleting everything running in it."
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx(Field, { id: "remove-env-confirm", label: `Type ${name} to confirm`, children: (p) => /* @__PURE__ */ jsx("input", { ...p, autoFocus: true, value: typed, onChange: (e) => setTyped(e.target.value) }) })
    ] }) }),
    /* @__PURE__ */ jsxs(DialogActions, { children: [
      /* @__PURE__ */ jsx(Button, { onClick: onCancel, children: "Cancel" }),
      /* @__PURE__ */ jsx(Button, { variant: "danger", disabled: blocked || typed !== name, onClick: onConfirm, children: "Stage removal" })
    ] })
  ] });
}
function ChangeResultDialog({
  requests,
  cicdPrUrl,
  error,
  onClose
}) {
  const { c } = useDialogStyles();
  return /* @__PURE__ */ jsxs(Dialog, { open: true, onClose, PaperProps: { className: c.paper }, children: [
    /* @__PURE__ */ jsx(DialogTitle, { children: error ? "Something needs attention" : "Pull requests opened" }),
    /* @__PURE__ */ jsxs(DialogContent, { children: [
      error && /* @__PURE__ */ jsx(DialogContentText, { className: c.problem, style: { marginTop: 0 }, children: error }),
      requests.length > 0 && /* @__PURE__ */ jsx(DialogContentText, { component: "div", children: requests.map((r, i) => /* @__PURE__ */ jsxs("div", { children: [
        i + 1,
        ". ApplicationEnvironment request for ",
        r.env,
        ":",
        " ",
        /* @__PURE__ */ jsx(Link, { href: r.url, target: "_blank", rel: "noopener noreferrer", children: r.url })
      ] }, r.env)) }),
      cicdPrUrl && /* @__PURE__ */ jsxs(DialogContentText, { component: "div", children: [
        requests.length > 0 ? `${requests.length + 1}. ` : "",
        "cicd.yaml change:",
        " ",
        /* @__PURE__ */ jsx(Link, { href: cicdPrUrl, target: "_blank", rel: "noopener noreferrer", children: cicdPrUrl })
      ] }),
      requests.length > 0 && cicdPrUrl && /* @__PURE__ */ jsx(DialogContentText, { children: "Merge the ApplicationEnvironment request first, then the cicd.yaml change." }),
      error && requests.length > 0 && !cicdPrUrl && /* @__PURE__ */ jsx(DialogContentText, { children: "The request(s) above are already open and will not be opened again if you try again." })
    ] }),
    /* @__PURE__ */ jsx(DialogActions, { children: /* @__PURE__ */ jsx(Button, { onClick: onClose, children: "Close" }) })
  ] });
}

export { AddEnvironmentDialog, ChangeResultDialog, RemoveEnvironmentDialog };
//# sourceMappingURL=dialogs.esm.js.map
