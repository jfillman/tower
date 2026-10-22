import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
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
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';
import { useRegisteredClusters, flightClusterOptions, flightClusterProblem } from '../../environments/registeredClusters.esm.js';
import { applyStaged, validateEnvironments, validateAddedFlight } from '../../environments/stagedChanges.esm.js';
import { Field, Hint, Button, Callout } from '../../ui/index.esm.js';
import { PrRef, PrReceipt } from '../../ui/PrRef.esm.js';
import { useUi } from '../../ui/styles.esm.js';
import { useDialogSkin } from '../../ui/dialog.esm.js';
import { MAIN_FIELD } from './shared.esm.js';

const useStyles = makeStyles(() => ({
  paper: { backgroundColor: ({ t }) => t.panel, backgroundImage: "none", border: ({ t }) => `1px solid ${t.line}`, borderRadius: 6, minWidth: 440 },
  stack: { display: "flex", flexDirection: "column", gap: 12 },
  mono: { fontFamily: fontMono, fontSize: 12 },
  noteGap: { marginTop: 8 },
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
  const [pipelineStep, setPipelineStep] = useState(true);
  const [copyValues, setCopyValues] = useState(true);
  const mainField = cloudBlock ? MAIN_FIELD[cloudBlock] : void 0;
  const usedBy = {};
  for (const e of current) if (e.tier === "flight" && e.cluster) (usedBy[e.cluster] ??= []).push(e.name);
  const knownClusters = Object.keys(usedBy);
  const registry = useRegisteredClusters(open && !cloudBlock);
  const clusterChoices = registry.status === "ready" ? flightClusterOptions(registry.clusters, usedBy) : [];
  const clusterPicker = registry.status === "loading" || clusterChoices.length > 0;
  const onlyChoice = clusterChoices.length === 1 ? clusterChoices[0].value : "";
  useEffect(() => {
    if (onlyChoice && !cluster) setCluster(onlyChoice);
  }, [onlyChoice]);
  const candidate = { name: name.trim(), tier };
  if (tier === "flight" && !cloudBlock && cluster.trim()) candidate.cluster = cluster.trim();
  if (cloudBlock && mainField && override.trim()) candidate[cloudBlock] = { [mainField]: override.trim() };
  if (duplicateOf && cloudBlock && duplicateOf[cloudBlock]) {
    const { [mainField]: _own, ...rest } = duplicateOf[cloudBlock];
    candidate[cloudBlock] = { ...rest, ...candidate[cloudBlock] ?? {} };
    if (Object.keys(candidate[cloudBlock]).length === 0) delete candidate[cloudBlock];
  }
  const withCandidate = applyStaged(current, [{ kind: "add", env: candidate }]);
  const clusterProblem = tier === "flight" && !cloudBlock ? flightClusterProblem(registry, cluster.trim()) : void 0;
  const fresh = name.trim() ? [
    ...validateEnvironments(withCandidate, targetId),
    ...validateAddedFlight(current, withCandidate, targetId),
    ...clusterProblem ? [clusterProblem] : []
  ].filter((p) => !problems.includes(p)) : [];
  const ok = Boolean(name.trim()) && fresh.length === 0;
  const reset = () => {
    setName("");
    setTier("ground");
    setCluster("");
    setOverride("");
    setPipelineStep(true);
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
      /* @__PURE__ */ jsx(Hint, { className: c.noteGap, style: { marginTop: -6 }, children: "Lowercase letters, digits and '-', for example qa." }),
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
      tier === "ground" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(
          FormControlLabel,
          {
            control: /* @__PURE__ */ jsx(Checkbox, { size: "small", checked: pipelineStep, onChange: (e) => setPipelineStep(e.target.checked) }),
            label: "Also add a deploy step for it to the pipeline"
          }
        ),
        /* @__PURE__ */ jsx(Hint, { className: c.noteGap, style: { marginTop: -6 }, children: "Without a deploy step nothing in CI deploys to this environment: Argo CD creates its namespace and waits for an image that never comes. It goes right after the step for the environment before it. Untick to edit the pipeline yourself in the Glidepath tab." })
      ] }),
      tier === "flight" && cloudBlock && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Hint, { className: c.noteGap, children: "Each release to it opens a pull request on this repo that changes its release pin (glidepath/releases/<name>.yaml). Merging the pull request deploys exactly that image." }),
        /* @__PURE__ */ jsx(
          FormControlLabel,
          {
            control: /* @__PURE__ */ jsx(Checkbox, { size: "small", checked: pipelineStep, onChange: (e) => setPipelineStep(e.target.checked) }),
            label: "Also add a release step for it to the pipeline"
          }
        )
      ] }),
      tier === "flight" && !cloudBlock && /* @__PURE__ */ jsxs(Fragment, { children: [
        clusterPicker ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Field, { id: "add-env-cluster", label: "Cluster", children: (p) => /* @__PURE__ */ jsxs("select", { ...p, disabled: registry.status === "loading", value: cluster, onChange: (e) => setCluster(e.target.value), children: [
            /* @__PURE__ */ jsx("option", { value: "", disabled: true, children: registry.status === "loading" ? "Reading the cluster registry\u2026" : "Choose a cluster" }),
            cluster && !clusterChoices.some((o) => o.value === cluster) && /* @__PURE__ */ jsx("option", { value: cluster, children: cluster }),
            clusterChoices.map((o) => /* @__PURE__ */ jsx("option", { value: o.value, children: o.label }, o.value))
          ] }) }),
          /* @__PURE__ */ jsx(Hint, { className: c.noteGap, style: { marginTop: -6 }, children: "The registered upper clusters that can run a Flight environment, from the cluster registry." })
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Field, { id: "add-env-cluster", label: "Cluster", children: (p) => /* @__PURE__ */ jsx("input", { ...p, list: "flight-clusters", value: cluster, onChange: (e) => setCluster(e.target.value) }) }),
          /* @__PURE__ */ jsx("datalist", { id: "flight-clusters", children: knownClusters.map((k) => /* @__PURE__ */ jsx("option", { value: k }, k)) }),
          /* @__PURE__ */ jsx(Hint, { className: c.noteGap, style: { marginTop: -6 }, children: registry.status === "failed" ? "The cluster registry could not be read: type the registered upper cluster it runs on." : "The cluster registry lists no upper cluster that can run a Flight environment yet: type its registered name." })
        ] }),
        /* @__PURE__ */ jsx(Hint, { className: c.noteGap, children: "Creating a Flight environment opens two pull requests: an ApplicationEnvironment request on the tenants repo, then the cicd.yaml change. Merge the request first." }),
        /* @__PURE__ */ jsx(
          FormControlLabel,
          {
            control: /* @__PURE__ */ jsx(Checkbox, { size: "small", checked: pipelineStep, onChange: (e) => setPipelineStep(e.target.checked) }),
            label: "Also add a release step for it to the pipeline"
          }
        ),
        /* @__PURE__ */ jsx(Hint, { className: c.noteGap, style: { marginTop: -6 }, children: "Without a release step nothing in CI releases to this environment. It goes right after the step for the environment before it. Untick to edit the pipeline yourself in the Glidepath tab." })
      ] }),
      cloudBlock && mainField && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Field, { id: "add-env-override", label: `${targetLabel} ${mainField} (optional)`, children: (p) => /* @__PURE__ */ jsx("input", { ...p, value: override, onChange: (e) => setOverride(e.target.value) }) }),
        /* @__PURE__ */ jsx(Hint, { className: c.noteGap, style: { marginTop: -6 }, children: "Leave empty to use the app-level value." })
      ] }),
      duplicateOf && !cloudBlock && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(
          FormControlLabel,
          {
            control: /* @__PURE__ */ jsx(Checkbox, { size: "small", checked: copyValues, onChange: (e) => setCopyValues(e.target.checked) }),
            label: `Copy the values of ${duplicateOf.name}`
          }
        ),
        /* @__PURE__ */ jsx(Hint, { className: c.noteGap, style: { marginTop: -6 }, children: tier === "ground" ? `The new environment's values file is created in the same pull request, with the values of ${duplicateOf.name} (its own image excluded).` : `A Flight environment's values file is written by Crossplane after its request merges. When it exists, use "Copy values from" in its Values tab.` })
      ] }),
      duplicateOf && cloudBlock && mainField && /* @__PURE__ */ jsxs(Hint, { className: c.noteGap, children: [
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
            onStage(candidate, pipelineStep, duplicateOf && !cloudBlock && copyValues ? duplicateOf.name : void 0);
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
        cloud ? /* @__PURE__ */ jsxs(Fragment, { children: [
          files.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Hint, { className: c.noteGap, children: "The same pull request deletes its release pin and promote flow, so merging it starts no deploy:" }),
            /* @__PURE__ */ jsx("ul", { className: c.mono, children: files.map((f) => /* @__PURE__ */ jsx("li", { children: f }, f)) })
          ] }),
          /* @__PURE__ */ jsx(Hint, { className: c.noteGap, children: "The cloud resource this environment deployed to is not deleted. Remove it in your cloud account." })
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Hint, { className: c.noteGap, children: "The same pull request deletes, where they exist:" }),
          /* @__PURE__ */ jsx("ul", { className: c.mono, children: files.map((f) => /* @__PURE__ */ jsx("li", { children: f }, f)) }),
          /* @__PURE__ */ jsxs(Hint, { className: c.noteGap, children: [
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
  const d = useDialogSkin();
  const ordered = requests.some((r) => r.existing !== "merged") && Boolean(cicdPrUrl);
  return /* @__PURE__ */ jsxs(Dialog, { open: true, onClose, PaperProps: { className: c.paper }, children: [
    /* @__PURE__ */ jsx(DialogTitle, { className: d.title, children: error ? "Something needs attention" : "PRs opened" }),
    /* @__PURE__ */ jsxs(DialogContent, { className: c.stack, children: [
      error && /* @__PURE__ */ jsx(Callout, { tone: "bad", children: error }),
      requests.map(
        (r, i) => r.existing === "merged" ? /* @__PURE__ */ jsxs(DialogContentText, { component: "div", children: [
          i + 1,
          ". The ApplicationEnvironment request for ",
          r.env,
          " is already in the tenants repo, nothing new opened:",
          " ",
          /* @__PURE__ */ jsx(PrRef, { pr: { url: r.url, state: "merged" }, size: "inline" })
        ] }, r.env) : /* @__PURE__ */ jsx(
          PrReceipt,
          {
            prUrl: r.url,
            title: `${i + 1}. ApplicationEnvironment request for ${r.env}`,
            alreadyOpen: r.existing === "open",
            next: cicdPrUrl ? "merge this first, so the environment exists when cicd.yaml names it." : "merge it to create the environment."
          },
          r.env
        )
      ),
      cicdPrUrl && /* @__PURE__ */ jsx(
        PrReceipt,
        {
          prUrl: cicdPrUrl,
          title: `${requests.length > 0 ? `${requests.length + 1}. ` : ""}cicd.yaml change`,
          next: ordered ? "merge it after the ApplicationEnvironment request." : "merge it to apply the change."
        }
      ),
      error && requests.length > 0 && !cicdPrUrl && /* @__PURE__ */ jsx(DialogContentText, { children: "The request(s) above are already open and will not be opened again if you try again." })
    ] }),
    /* @__PURE__ */ jsx(DialogActions, { children: /* @__PURE__ */ jsx(Button, { onClick: onClose, children: "Close" }) })
  ] });
}

export { AddEnvironmentDialog, ChangeResultDialog, RemoveEnvironmentDialog };
//# sourceMappingURL=dialogs.esm.js.map
