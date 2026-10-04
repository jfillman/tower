import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState, useMemo } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogActions from '@material-ui/core/DialogActions';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontMono, fontDisplay, useHangarTokens } from '../brand/tokens.esm.js';
import { buildEnvironmentRows } from '../environmentRows.esm.js';
import { readEnvironments, applyStaged, describeChanges, validateEnvironments, followUps, stageSetBlock, buildDeploy } from '../environments/stagedChanges.esm.js';
import { DEPLOY_TARGETS } from '../serviceClass.esm.js';
import { PrResultDialog } from '../PrResultDialog.esm.js';
import { preventFocusScroll } from '../preventFocusScroll.esm.js';
import { relativeTime, formatDateTime } from '../shared/format.esm.js';
import { useCicdConfig, useSubmitCicdConfigChange } from '../useConfigData.esm.js';
import { useReleaseContext } from '../useReleaseContext.esm.js';

const HEALTH_LABEL = {
  healthy: "Healthy",
  progressing: "Progressing",
  paused: "Paused",
  degraded: "Degraded",
  unknown: "Unknown"
};
const BLOCK_FIELDS = {
  lambda: ["functionName", "region"],
  ecs: ["cluster", "service", "containerName", "region", "taskDefinitionFamily"],
  azureContainerApps: ["resourceGroup", "appName"]
};
const MAIN_FIELD = { lambda: "functionName", ecs: "service", azureContainerApps: "appName" };
const TARGET_BLOCK = {
  "aws-ecs": "ecs",
  "aws-lambda": "lambda",
  "azure-container-apps": "azureContainerApps"
};
const useStyles = makeStyles(() => ({
  wrap: { padding: "20px 24px 40px", maxWidth: 1380 },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 20, color: ({ t }) => t.textHi },
  sub: { fontSize: 13, color: ({ t }) => t.textLo, marginTop: 2, marginBottom: 12 },
  note: {
    fontSize: 12.5,
    color: ({ t }) => t.textLo,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    borderRadius: 6,
    padding: "9px 12px",
    marginBottom: 14
  },
  layout: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 18, alignItems: "start" },
  empty: {
    border: ({ t }) => `1px dashed ${t.line}`,
    borderRadius: 6,
    padding: 24,
    color: ({ t }) => t.textLo,
    textAlign: "center"
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
  th: {
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: ({ t }) => t.textFaint,
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: ({ t }) => `1px solid ${t.line}`
  },
  td: {
    padding: "11px 10px",
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    color: ({ t }) => t.textHi,
    verticalAlign: "middle"
  },
  name: { fontFamily: fontDisplay, fontWeight: 600, fontSize: 15 },
  mono: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo },
  muted: { color: ({ t }) => t.textFaint },
  chip: {
    display: "inline-block",
    fontFamily: fontMono,
    fontSize: 11,
    padding: "3px 7px",
    borderRadius: 4,
    border: "1px solid"
  },
  ground: { color: ({ t }) => t.sky, borderColor: ({ t }) => t.skyLine },
  flight: { color: ({ t }) => t.amber, borderColor: ({ t }) => t.amberLine },
  staged: { color: ({ t }) => t.good, borderColor: ({ t }) => t.good, marginLeft: 8 },
  health: { display: "inline-flex", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, display: "inline-block" },
  rowBtn: {
    border: ({ t }) => `1px solid ${t.line}`,
    background: "transparent",
    color: ({ t }) => t.textLo,
    borderRadius: 4,
    width: 26,
    height: 26,
    cursor: "pointer",
    fontFamily: fontMono,
    marginLeft: 4,
    "&:disabled": { opacity: 0.35, cursor: "default" }
  },
  clickable: { cursor: "pointer", "&:hover": { background: ({ t }) => t.panelAlt } },
  expanded: {
    background: ({ t }) => t.panelAlt,
    padding: "14px 16px 16px 24px",
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`
  },
  fields: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, maxWidth: 640 },
  panel: {
    border: ({ t }) => `1px solid ${t.amberLine}`,
    borderRadius: 6,
    padding: 16,
    background: ({ t }) => t.panel
  },
  panelHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  label: {
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: ({ t }) => t.textFaint
  },
  line: { marginBottom: 10 },
  lineTitle: { fontSize: 13, fontWeight: 600, color: ({ t }) => t.textHi },
  lineDetail: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textLo },
  problem: { fontSize: 12.5, color: ({ t }) => t.bad, marginBottom: 6 },
  followUp: { fontSize: 12.5, color: ({ t }) => t.textLo, marginTop: 8 },
  buttons: { display: "flex", gap: 8, marginTop: 14 },
  primary: { flex: 1, backgroundColor: ({ t }) => t.amber, color: ({ t }) => t.amberInk, "&:hover": { backgroundColor: ({ t }) => t.amber } },
  dialogPaper: { backgroundColor: ({ t }) => t.panel, backgroundImage: "none", border: ({ t }) => `1px solid ${t.line}`, minWidth: 440 },
  dialogNote: { fontSize: 12.5, color: ({ t }) => t.textLo, marginTop: 8 }
}));
function dotColor(h, t) {
  switch (h) {
    case "healthy":
      return t.good;
    case "degraded":
      return t.bad;
    case "progressing":
      return t.sky;
    case "paused":
      return t.amber;
    default:
      return t.textFaint;
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function EnvironmentsTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { environments, pipelineOrder, loading, error, owner, appName } = useReleaseContext();
  const [nonce, setNonce] = useState(0);
  const cicd = useCicdConfig(owner && appName ? { owner, appName } : void 0, nonce);
  const submit = useSubmitCicdConfigChange();
  const [staged, setStaged] = useState([]);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState();
  const liveRows = useMemo(
    () => buildEnvironmentRows(environments, { lower: pipelineOrder.lower, upper: pipelineOrder.upper }),
    [environments, pipelineOrder.lower, pipelineOrder.upper]
  );
  const deploy = cicd.data?.values.deploy;
  const canEdit = Boolean(cicd.data && owner && appName);
  const targetId = typeof deploy?.target === "string" && deploy.target || "k8s-rollout";
  const cloudBlock = TARGET_BLOCK[targetId];
  const targetLabel = DEPLOY_TARGETS[targetId]?.label ?? targetId;
  const { shape, envs: before } = useMemo(() => readEnvironments(deploy), [deploy]);
  const after = useMemo(() => applyStaged(before, staged), [before, staged]);
  const changes = useMemo(() => describeChanges(before, after, shape), [before, after, shape]);
  const problems = useMemo(() => validateEnvironments(after, targetId), [after, targetId]);
  const notes = useMemo(() => followUps(before, after, targetId), [before, after, targetId]);
  const rows = useMemo(() => {
    const live = new Map(liveRows.map((r) => [r.name, r]));
    if (!canEdit) return liveRows.map((r) => ({ ...r }));
    const beforeBy = new Map(before.map((e) => [e.name, e]));
    const out = after.map((def) => {
      const l = live.get(def.name);
      const prior = beforeBy.get(def.name);
      const state = !prior ? "new" : same(prior, def) ? void 0 : "edited";
      return {
        name: def.name,
        tier: def.tier,
        target: l?.target ?? targetLabel,
        where: l?.where ?? "\u2014",
        health: l?.health ?? "unknown",
        deployed: l?.deployed ?? false,
        image: l?.image,
        deployedAt: l?.deployedAt,
        def,
        state
      };
    });
    for (const r of liveRows) if (!after.some((e) => e.name === r.name)) out.push({ ...r });
    return out;
  }, [canEdit, liveRows, before, after, targetLabel]);
  if (loading && rows.length === 0) return /* @__PURE__ */ jsx(Progress, {});
  if (error && rows.length === 0) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(String(error)) });
  const move = (name, direction) => setStaged((s) => [...s, { kind: "move", name, direction }]);
  const canMove = (name, direction) => {
    const i = after.findIndex((e) => e.name === name);
    const j = i + (direction === "up" ? -1 : 1);
    return i !== -1 && Boolean(after[j]) && after[j].tier === after[i].tier;
  };
  const setField = (env, block, field, value) => {
    const current = { ...env[block] ?? {} };
    if (value.trim()) current[field] = value;
    else delete current[field];
    setStaged((s) => stageSetBlock(s, env.name, block, current));
  };
  const openPr = () => {
    if (!owner || !appName) return;
    submit.submit({ owner, appName, patch: { deploy: buildDeploy(deploy, after) }, summary: changes.map((c) => c.title) });
  };
  const closeResult = () => {
    submit.reset();
    setStaged([]);
    setNonce((n) => n + 1);
  };
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Environments" }),
        /* @__PURE__ */ jsx("div", { className: classes.sub, children: "Every environment of this service, in promotion order." })
      ] }),
      canEdit && /* @__PURE__ */ jsx(Button, { variant: "outlined", size: "small", onMouseDown: preventFocusScroll, onClick: () => setAdding(true), children: "Add environment" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: classes.note, children: canEdit ? "Changes here are staged: nothing is submitted until you open the pull request from the Pending changes panel. Flight environments, deleting, and the values of a Kubernetes environment are still done elsewhere." : "Read-only: this service has no cicd.yaml Tower can edit. Change the list and its order in the Glidepath tab; Flight environment values are in App Configuration." }),
    /* @__PURE__ */ jsxs("div", { className: canEdit ? classes.layout : void 0, children: [
      /* @__PURE__ */ jsx("div", { children: rows.length === 0 ? /* @__PURE__ */ jsx("div", { className: classes.empty, children: "No environments yet. They appear here once the service declares or deploys to one." }) : /* @__PURE__ */ jsxs("table", { className: classes.table, children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", { children: ["Environment", "Tier", "Target", "Where", "Health", "Live image", "Deployed", canEdit ? "Order" : ""].map((h) => /* @__PURE__ */ jsx("th", { className: classes.th, children: h }, h || "x")) }) }),
        /* @__PURE__ */ jsx("tbody", { children: rows.map((r) => {
          const editable = canEdit && Boolean(r.def);
          const isOpen = open === r.name;
          return [
            /* @__PURE__ */ jsxs(
              "tr",
              {
                className: editable ? classes.clickable : void 0,
                onClick: editable ? () => setOpen(isOpen ? void 0 : r.name) : void 0,
                children: [
                  /* @__PURE__ */ jsxs("td", { className: `${classes.td} ${classes.name}`, children: [
                    r.name,
                    r.state && /* @__PURE__ */ jsxs("span", { className: `${classes.chip} ${classes.staged}`, children: [
                      "staged: ",
                      r.state
                    ] })
                  ] }),
                  /* @__PURE__ */ jsx("td", { className: classes.td, children: /* @__PURE__ */ jsx("span", { className: `${classes.chip} ${r.tier === "flight" ? classes.flight : classes.ground}`, children: r.tier === "flight" ? "Flight" : "Ground" }) }),
                  /* @__PURE__ */ jsx("td", { className: classes.td, children: r.target }),
                  /* @__PURE__ */ jsx("td", { className: `${classes.td} ${classes.mono}`, children: r.where }),
                  /* @__PURE__ */ jsx("td", { className: classes.td, children: /* @__PURE__ */ jsxs("span", { className: classes.health, children: [
                    /* @__PURE__ */ jsx("i", { className: classes.dot, style: { backgroundColor: dotColor(r.health, t) }, "aria-hidden": "true" }),
                    HEALTH_LABEL[r.health]
                  ] }) }),
                  /* @__PURE__ */ jsx("td", { className: `${classes.td} ${classes.mono}`, children: r.deployed ? r.image : /* @__PURE__ */ jsx("span", { className: classes.muted, children: "not deployed yet" }) }),
                  /* @__PURE__ */ jsx("td", { className: classes.td, title: r.deployedAt ? formatDateTime(r.deployedAt) : void 0, children: r.deployedAt ? relativeTime(r.deployedAt) : /* @__PURE__ */ jsx("span", { className: classes.muted, children: "\u2014" }) }),
                  canEdit && /* @__PURE__ */ jsx("td", { className: classes.td, onClick: (e) => e.stopPropagation(), children: editable && r.def?.tier === "ground" && /* @__PURE__ */ jsxs(Fragment, { children: [
                    /* @__PURE__ */ jsx(
                      "button",
                      {
                        type: "button",
                        className: classes.rowBtn,
                        "aria-label": `Move ${r.name} earlier`,
                        disabled: !canMove(r.name, "up"),
                        onMouseDown: preventFocusScroll,
                        onClick: () => move(r.name, "up"),
                        children: "\u2191"
                      }
                    ),
                    /* @__PURE__ */ jsx(
                      "button",
                      {
                        type: "button",
                        className: classes.rowBtn,
                        "aria-label": `Move ${r.name} later`,
                        disabled: !canMove(r.name, "down"),
                        onMouseDown: preventFocusScroll,
                        onClick: () => move(r.name, "down"),
                        children: "\u2193"
                      }
                    )
                  ] }) })
                ]
              },
              r.name
            ),
            isOpen && r.def && /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 8, className: classes.expanded, children: cloudBlock ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsxs("div", { className: classes.label, children: [
                "This environment's ",
                targetLabel,
                " resource"
              ] }),
              /* @__PURE__ */ jsx("div", { className: classes.dialogNote, children: "Leave a field empty to use the app-level value shown as its hint." }),
              /* @__PURE__ */ jsx("div", { className: classes.fields, style: { marginTop: 10 }, children: BLOCK_FIELDS[cloudBlock].map((f) => /* @__PURE__ */ jsx(
                TextField,
                {
                  id: `env-${r.name}-${f}`,
                  size: "small",
                  label: f,
                  value: String(r.def?.[cloudBlock]?.[f] ?? ""),
                  placeholder: String(deploy?.[cloudBlock]?.[f] ?? ""),
                  InputLabelProps: { shrink: true },
                  onChange: (e) => setField(r.def, cloudBlock, f, e.target.value)
                },
                f
              )) })
            ] }) : /* @__PURE__ */ jsxs("div", { className: classes.dialogNote, children: [
              "This environment's values live in ",
              /* @__PURE__ */ jsxs("span", { className: classes.mono, children: [
                "platform/envs/",
                r.name,
                ".yaml"
              ] }),
              " (Ground) or the gitops repo (Flight). Edit them in the Glidepath tab or App Configuration for now."
            ] }) }) }, `${r.name}-edit`)
          ];
        }) })
      ] }) }),
      canEdit && /* @__PURE__ */ jsxs("div", { className: classes.panel, "aria-label": "Pending changes", children: [
        /* @__PURE__ */ jsxs("div", { className: classes.panelHead, children: [
          /* @__PURE__ */ jsx("span", { className: classes.label, children: "Pending changes" }),
          /* @__PURE__ */ jsxs("span", { className: `${classes.chip} ${classes.flight}`, children: [
            changes.length,
            " staged"
          ] })
        ] }),
        changes.length === 0 ? /* @__PURE__ */ jsx("div", { className: classes.dialogNote, children: "Nothing staged. Add an environment, reorder, or set a cloud environment's resource, then review here." }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          changes.map((c, i) => /* @__PURE__ */ jsxs("div", { className: classes.line, children: [
            /* @__PURE__ */ jsx("div", { className: classes.lineTitle, children: c.title }),
            c.detail && /* @__PURE__ */ jsx("div", { className: classes.lineDetail, children: c.detail })
          ] }, `${c.kind}-${c.title}-${i}`)),
          problems.map((p) => /* @__PURE__ */ jsx("div", { className: classes.problem, children: p }, p)),
          /* @__PURE__ */ jsx("div", { className: classes.label, style: { marginTop: 12 }, children: "Pull request this opens" }),
          /* @__PURE__ */ jsxs("div", { className: classes.lineDetail, style: { marginTop: 4 }, children: [
            owner,
            "/",
            appName,
            ": cicd.yaml"
          ] }),
          notes.map((n) => /* @__PURE__ */ jsx("div", { className: classes.followUp, children: n }, n)),
          /* @__PURE__ */ jsxs("div", { className: classes.buttons, children: [
            /* @__PURE__ */ jsx(Button, { size: "small", variant: "outlined", onMouseDown: preventFocusScroll, onClick: () => setStaged([]), children: "Discard all" }),
            /* @__PURE__ */ jsx(
              Button,
              {
                size: "small",
                variant: "contained",
                className: classes.primary,
                disabled: problems.length > 0 || submit.loading,
                onMouseDown: preventFocusScroll,
                onClick: openPr,
                children: submit.loading ? "Opening\u2026" : "Open pull request"
              }
            )
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(
      AddEnvironmentDialog,
      {
        open: adding,
        onClose: () => setAdding(false),
        current: after,
        problems,
        targetId,
        targetLabel,
        cloudBlock,
        onStage: (env) => {
          setStaged((s) => [...s, { kind: "add", env }]);
          setAdding(false);
        },
        classes
      }
    ),
    (submit.result || submit.error) && /* @__PURE__ */ jsx(PrResultDialog, { result: submit.result, error: submit.error, onClose: closeResult })
  ] });
}
function AddEnvironmentDialog({
  open,
  onClose,
  current,
  problems,
  targetId,
  targetLabel,
  cloudBlock,
  onStage,
  classes
}) {
  const [name, setName] = useState("");
  const [override, setOverride] = useState("");
  const mainField = cloudBlock ? MAIN_FIELD[cloudBlock] : void 0;
  const candidate = { name: name.trim(), tier: "ground" };
  if (cloudBlock && mainField && override.trim()) candidate[cloudBlock] = { [mainField]: override.trim() };
  const fresh = name.trim() ? validateEnvironments(applyStaged(current, [{ kind: "add", env: candidate }]), targetId).filter((p) => !problems.includes(p)) : [];
  const ok = Boolean(name.trim()) && fresh.length === 0;
  const close = () => {
    setName("");
    setOverride("");
    onClose();
  };
  return /* @__PURE__ */ jsxs(Dialog, { open, onClose: close, PaperProps: { className: classes.dialogPaper }, children: [
    /* @__PURE__ */ jsx(DialogTitle, { children: "Add environment" }),
    /* @__PURE__ */ jsxs(DialogContent, { children: [
      /* @__PURE__ */ jsx(
        TextField,
        {
          id: "add-env-name",
          autoFocus: true,
          fullWidth: true,
          size: "small",
          label: "Name",
          value: name,
          onChange: (e) => setName(e.target.value),
          helperText: "Lowercase letters, digits and '-', for example qa."
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: classes.dialogNote, children: [
        /* @__PURE__ */ jsx("b", { children: "Ground" }),
        ": deploys on every push. Flight environments (deployed through an approved release) are created another way for now and arrive here in a later release."
      ] }),
      cloudBlock && mainField && /* @__PURE__ */ jsx(
        TextField,
        {
          id: "add-env-override",
          fullWidth: true,
          size: "small",
          style: { marginTop: 14 },
          label: `${targetLabel} ${mainField} (optional)`,
          value: override,
          onChange: (e) => setOverride(e.target.value),
          helperText: "Leave empty to use the app-level value.",
          InputLabelProps: { shrink: true }
        }
      ),
      fresh.map((p) => /* @__PURE__ */ jsx("div", { className: classes.problem, style: { marginTop: 10 }, children: p }, p))
    ] }),
    /* @__PURE__ */ jsxs(DialogActions, { children: [
      /* @__PURE__ */ jsx(Button, { onClick: close, children: "Cancel" }),
      /* @__PURE__ */ jsx(Button, { disabled: !ok, onClick: () => {
        onStage(candidate);
        setName("");
        setOverride("");
      }, children: "Stage environment" })
    ] })
  ] });
}

export { EnvironmentsTab };
//# sourceMappingURL=EnvironmentsTab.esm.js.map
