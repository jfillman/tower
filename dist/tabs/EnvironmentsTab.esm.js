import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogActions from '@material-ui/core/DialogActions';
import Button from '@material-ui/core/Button';
import Checkbox from '@material-ui/core/Checkbox';
import Radio from '@material-ui/core/Radio';
import RadioGroup from '@material-ui/core/RadioGroup';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import DialogContentText from '@material-ui/core/DialogContentText';
import Link from '@material-ui/core/Link';
import TextField from '@material-ui/core/TextField';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontMono, fontDisplay, useHangarTokens } from '../brand/tokens.esm.js';
import { buildEnvironmentRows } from '../environmentRows.esm.js';
import { useLaunchApplicationEnvironment } from '../environments/applicationEnvironment.esm.js';
import { readEnvironments, applyStaged, describeChanges, addedFlightEnvs, validateEnvironments, validateAddedFlight, validateRemovals, planReleaseSteps, releaseStepEnvs, followUps, deleteFilesFor, pipelinesNamingEnv, envFilePaths, buildDeploy, stageSetBlock } from '../environments/stagedChanges.esm.js';
import { DEPLOY_TARGETS } from '../serviceClass.esm.js';
import { PlatformFileEditor } from '../PlatformFileEditor.esm.js';
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
  const [searchParams] = useSearchParams();
  const [nonce, setNonce] = useState(0);
  const cicd = useCicdConfig(owner && appName ? { owner, appName } : void 0, nonce);
  const submit = useSubmitCicdConfigChange();
  const launcher = useLaunchApplicationEnvironment();
  const [phase, setPhase] = useState("idle");
  const [launched, setLaunched] = useState({});
  const [failure, setFailure] = useState();
  const [staged, setStaged] = useState([]);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState();
  const [removing, setRemoving] = useState();
  const liveRows = useMemo(
    () => buildEnvironmentRows(environments, { lower: pipelineOrder.lower, upper: pipelineOrder.upper }),
    [environments, pipelineOrder.lower, pipelineOrder.upper]
  );
  const deploy = cicd.data?.values.deploy;
  const pipelines = cicd.data?.values?.pipelines;
  const canEdit = Boolean(cicd.data && owner && appName);
  const targetId = typeof deploy?.target === "string" && deploy.target || "k8s-rollout";
  const cloudBlock = TARGET_BLOCK[targetId];
  const targetLabel = DEPLOY_TARGETS[targetId]?.label ?? targetId;
  const { shape, envs: before } = useMemo(() => readEnvironments(deploy), [deploy]);
  const after = useMemo(() => applyStaged(before, staged), [before, staged]);
  const envChanges = useMemo(() => describeChanges(before, after, shape), [before, after, shape]);
  const flightAdds = useMemo(() => addedFlightEnvs(before, after), [before, after]);
  const problems = useMemo(
    () => [
      ...validateEnvironments(after, targetId),
      ...validateAddedFlight(before, after, targetId),
      ...validateRemovals(before, after, pipelines)
    ],
    [before, after, targetId, pipelines]
  );
  const releasePlan = useMemo(
    () => planReleaseSteps(pipelines, after, releaseStepEnvs(staged, after)),
    [pipelines, after, staged]
  );
  const releaseLines = useMemo(
    () => [
      ...releasePlan.added.map((a) => ({
        kind: "edit",
        title: `Add a release step for ${a.env}`,
        detail: `pipeline ${a.pipeline}${a.after ? `, after the step for ${a.after}` : ", at the end"}`
      }))
    ],
    [releasePlan]
  );
  const changes = useMemo(() => [...envChanges, ...releaseLines], [envChanges, releaseLines]);
  const notes = useMemo(
    () => [
      ...followUps(before, after, targetId, appName),
      ...releasePlan.skipped.map((k) => `No release step added for ${k.env}: ${k.reason}.`)
    ],
    [before, after, targetId, appName, releasePlan]
  );
  const deleteFiles = useMemo(() => deleteFilesFor(before, after, targetId), [before, after, targetId]);
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
  const stageRemove = (name) => {
    if (before.some((e) => e.name === name)) setStaged((s) => [...s, { kind: "remove", name }]);
    else setStaged((s) => s.filter((x) => !("env" in x && x.env.name === name) && !("name" in x && x.name === name)));
    setRemoving(void 0);
    setOpen(void 0);
  };
  const setField = (env, block, field, value) => {
    const current = { ...env[block] ?? {} };
    if (value.trim()) current[field] = value;
    else delete current[field];
    setStaged((s) => stageSetBlock(s, env.name, block, current));
  };
  const openPr = async () => {
    if (!owner || !appName) return;
    setFailure(void 0);
    const done = { ...launched };
    for (const e of flightAdds) {
      if (done[e.name]) continue;
      setPhase("launching");
      const r = await launcher.launch({ appName, env: e.name, cluster: e.cluster });
      if (r.status !== "done") {
        setLaunched(done);
        setPhase("idle");
        setFailure(
          `Creating ${e.name} failed: ${r.status === "failed" ? r.error : "the request did not finish"}. Nothing was changed in cicd.yaml.`
        );
        return;
      }
      done[e.name] = r.prUrl;
    }
    setLaunched(done);
    setPhase("submitting");
    await submit.submit({
      owner,
      appName,
      patch: { deploy: buildDeploy(deploy, after), ...releasePlan.added.length > 0 ? { pipelines: releasePlan.pipelines } : {} },
      summary: changes.map((c) => c.title),
      ...deleteFiles.length > 0 ? { deleteFiles } : {}
    });
    setPhase("idle");
  };
  const closeResult = () => {
    const succeeded = Boolean(submit.result);
    submit.reset();
    setFailure(void 0);
    if (succeeded) {
      setStaged([]);
      setLaunched({});
      setNonce((n) => n + 1);
    }
  };
  const valuesPanel = (r) => {
    if (cloudBlock) {
      return /* @__PURE__ */ jsxs(Fragment, { children: [
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
      ] });
    }
    if (r.def.tier === "ground" && r.state === "new") {
      return /* @__PURE__ */ jsxs("div", { className: classes.dialogNote, children: [
        "Its values file, ",
        /* @__PURE__ */ jsxs("span", { className: classes.mono, children: [
          "platform/envs/",
          r.name,
          ".yaml"
        ] }),
        ", is created by a second pull request after the cicd.yaml change merges. Edit its values here once that is merged."
      ] });
    }
    if (r.def.tier === "ground") {
      return /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: classes.label, children: [
          "Values: platform/envs/",
          r.name,
          ".yaml"
        ] }),
        /* @__PURE__ */ jsx("div", { className: classes.dialogNote, style: { marginBottom: 8 }, children: "The same chart values as App Configuration, minus rollout.image (set by deploy automation). This file has its own pull request: it is not part of the pending changes." }),
        /* @__PURE__ */ jsx(PlatformFileEditor, { owner, appName, selector: { kind: "env", env: r.name } })
      ] });
    }
    return /* @__PURE__ */ jsxs("div", { className: classes.dialogNote, children: [
      "This Flight environment's values live in",
      " ",
      /* @__PURE__ */ jsxs("span", { className: classes.mono, children: [
        "gitops-",
        appName,
        "/",
        r.def.cluster ?? "<cluster>",
        "/",
        r.name,
        "/values.yaml"
      ] }),
      ".",
      " ",
      /* @__PURE__ */ jsx(Link, { href: `?${new URLSearchParams({ entity: searchParams.get("entity") ?? "", tab: "config", env: r.name })}`, children: "Edit them in App Configuration" }),
      ", which keeps its own pull-request flow and prod warnings."
    ] });
  };
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Environments" }),
        /* @__PURE__ */ jsx("div", { className: classes.sub, children: "Every environment of this service, in promotion order." })
      ] }),
      canEdit && /* @__PURE__ */ jsx(Button, { variant: "outlined", size: "small", onMouseDown: preventFocusScroll, onClick: () => setAdding(true), children: "Add environment" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: classes.note, children: canEdit ? "Changes here are staged: nothing is submitted until you open the pull request from the Pending changes panel. Removing a Ground environment is staged the same way. Removing a Flight environment is still done by hand. The values of a Ground environment are edited in its row, with their own pull request." : "Read-only: this service has no cicd.yaml Tower can edit. Change the list and its order in the Glidepath tab; Flight environment values are in App Configuration." }),
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
                  canEdit && /* @__PURE__ */ jsxs("td", { className: classes.td, onClick: (e) => e.stopPropagation(), children: [
                    editable && r.def?.tier === "ground" && /* @__PURE__ */ jsxs(Fragment, { children: [
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
                    ] }),
                    editable && r.def?.tier === "ground" && /* @__PURE__ */ jsx(
                      "button",
                      {
                        type: "button",
                        className: classes.rowBtn,
                        "aria-label": `Remove ${r.name}`,
                        onMouseDown: preventFocusScroll,
                        onClick: () => setRemoving(r.name),
                        children: "\u2715"
                      }
                    )
                  ] })
                ]
              },
              r.name
            ),
            isOpen && r.def && /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsxs("td", { colSpan: 8, className: classes.expanded, children: [
              valuesPanel(r),
              r.def.tier === "flight" && /* @__PURE__ */ jsxs("div", { className: classes.problem, style: { marginTop: 14 }, children: [
                /* @__PURE__ */ jsx("div", { className: classes.label, children: "Danger zone: removing a Flight environment" }),
                /* @__PURE__ */ jsxs("div", { className: classes.dialogNote, children: [
                  "Tower does not remove Flight environments. Deleting the ApplicationEnvironment does not delete the files it wrote, so a partial removal would leave an Application still deploying. By hand, in this order:",
                  /* @__PURE__ */ jsxs("ol", { children: [
                    /* @__PURE__ */ jsxs("li", { children: [
                      "Remove the pipeline step that releases to ",
                      r.name,
                      " (Glidepath tab)."
                    ] }),
                    /* @__PURE__ */ jsxs("li", { children: [
                      "In the tenants repo, delete ",
                      /* @__PURE__ */ jsxs("span", { className: classes.mono, children: [
                        "tenants/",
                        appName,
                        "/",
                        r.name,
                        "/"
                      ] }),
                      " so the Application is no longer generated."
                    ] }),
                    /* @__PURE__ */ jsxs("li", { children: [
                      "In ",
                      /* @__PURE__ */ jsxs("span", { className: classes.mono, children: [
                        "gitops-",
                        appName
                      ] }),
                      ", delete ",
                      /* @__PURE__ */ jsxs("span", { className: classes.mono, children: [
                        r.def.cluster ?? "<cluster>",
                        "/",
                        r.name,
                        "/"
                      ] }),
                      "."
                    ] }),
                    /* @__PURE__ */ jsxs("li", { children: [
                      "Delete the ApplicationEnvironment request, then remove ",
                      r.name,
                      " from cicd.yaml."
                    ] })
                  ] })
                ] })
              ] })
            ] }) }, `${r.name}-edit`)
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
          /* @__PURE__ */ jsx("div", { className: classes.label, style: { marginTop: 12 }, children: flightAdds.length > 0 ? "Pull requests this opens, in this order" : "Pull request this opens" }),
          flightAdds.map((e) => /* @__PURE__ */ jsxs("div", { className: classes.lineDetail, style: { marginTop: 4 }, children: [
            "1. tenants repo: ApplicationEnvironment request for ",
            e.name,
            launched[e.name] ? " (already opened)" : ""
          ] }, e.name)),
          /* @__PURE__ */ jsxs("div", { className: classes.lineDetail, style: { marginTop: 4 }, children: [
            flightAdds.length > 0 ? "2. " : "",
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
                disabled: problems.length > 0 || phase !== "idle",
                onMouseDown: preventFocusScroll,
                onClick: openPr,
                children: phase === "launching" ? "Requesting environment\u2026" : phase === "submitting" ? "Opening\u2026" : flightAdds.length > 0 ? "Open pull requests" : "Open pull request"
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
        onStage: (env, releaseStep) => {
          setStaged((s) => [...s, { kind: "add", env, releaseStep }]);
          setAdding(false);
        },
        classes
      }
    ),
    removing && /* @__PURE__ */ jsx(
      RemoveEnvironmentDialog,
      {
        name: removing,
        appName,
        cloud: Boolean(cloudBlock),
        files: envFilePaths(removing),
        blockedBy: pipelinesNamingEnv(pipelines, removing),
        onCancel: () => setRemoving(void 0),
        onConfirm: () => stageRemove(removing),
        classes
      }
    ),
    (submit.result || submit.error || failure) && /* @__PURE__ */ jsx(
      ChangeResultDialog,
      {
        requests: flightAdds.filter((e) => launched[e.name]).map((e) => ({ env: e.name, url: launched[e.name] })),
        cicdPrUrl: submit.result?.prUrl,
        error: failure ?? submit.error,
        onClose: closeResult,
        classes
      }
    )
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
  const [tier, setTier] = useState("ground");
  const [cluster, setCluster] = useState("");
  const [override, setOverride] = useState("");
  const [releaseStep, setReleaseStep] = useState(true);
  const mainField = cloudBlock ? MAIN_FIELD[cloudBlock] : void 0;
  const flightAllowed = !cloudBlock;
  const knownClusters = [...new Set(current.filter((e) => e.tier === "flight" && e.cluster).map((e) => e.cluster))];
  const candidate = { name: name.trim(), tier };
  if (tier === "flight" && cluster.trim()) candidate.cluster = cluster.trim();
  if (tier === "ground" && cloudBlock && mainField && override.trim()) candidate[cloudBlock] = { [mainField]: override.trim() };
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
  };
  const close = () => {
    reset();
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
      /* @__PURE__ */ jsxs(
        RadioGroup,
        {
          "aria-label": "Tier",
          value: tier,
          onChange: (e) => setTier(e.target.value),
          style: { marginTop: 10 },
          children: [
            /* @__PURE__ */ jsx(FormControlLabel, { value: "ground", control: /* @__PURE__ */ jsx(Radio, { size: "small" }), label: "Ground: deploys on every push" }),
            /* @__PURE__ */ jsx(
              FormControlLabel,
              {
                value: "flight",
                disabled: !flightAllowed,
                control: /* @__PURE__ */ jsx(Radio, { size: "small" }),
                label: "Flight: deploys only through an approved release"
              }
            )
          ]
        }
      ),
      !flightAllowed && /* @__PURE__ */ jsxs("div", { className: classes.dialogNote, children: [
        "Flight environments are not available for ",
        targetLabel,
        " yet: a cloud target has no approval path for them."
      ] }),
      tier === "flight" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(
          TextField,
          {
            id: "add-env-cluster",
            fullWidth: true,
            size: "small",
            style: { marginTop: 12 },
            label: "Cluster",
            value: cluster,
            onChange: (e) => setCluster(e.target.value),
            inputProps: { list: "flight-clusters" },
            helperText: "The registered upper cluster it runs on, for example kind-prod.",
            InputLabelProps: { shrink: true }
          }
        ),
        /* @__PURE__ */ jsx("datalist", { id: "flight-clusters", children: knownClusters.map((c) => /* @__PURE__ */ jsx("option", { value: c }, c)) }),
        /* @__PURE__ */ jsx("div", { className: classes.dialogNote, children: "Creating a Flight environment opens two pull requests: an ApplicationEnvironment request on the tenants repo, then the cicd.yaml change. Merge the request first." }),
        /* @__PURE__ */ jsx(
          FormControlLabel,
          {
            control: /* @__PURE__ */ jsx(Checkbox, { size: "small", checked: releaseStep, onChange: (e) => setReleaseStep(e.target.checked) }),
            label: "Also add a release step for it to the pipeline"
          }
        ),
        /* @__PURE__ */ jsx("div", { className: classes.dialogNote, children: "Without a release step nothing in CI releases to this environment. It goes right after the step for the environment before it. Untick to edit the pipeline yourself in the Glidepath tab." })
      ] }),
      tier === "ground" && cloudBlock && mainField && /* @__PURE__ */ jsx(
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
      /* @__PURE__ */ jsx(
        Button,
        {
          disabled: !ok,
          onClick: () => {
            onStage(candidate, tier === "flight" && releaseStep);
            reset();
          },
          children: "Stage environment"
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
  onConfirm,
  classes
}) {
  const [typed, setTyped] = useState("");
  const blocked = blockedBy.length > 0;
  return /* @__PURE__ */ jsxs(Dialog, { open: true, onClose: onCancel, PaperProps: { className: classes.dialogPaper }, children: [
    /* @__PURE__ */ jsxs(DialogTitle, { children: [
      "Remove ",
      name
    ] }),
    /* @__PURE__ */ jsx(DialogContent, { children: blocked ? /* @__PURE__ */ jsxs(DialogContentText, { className: classes.problem, children: [
      blockedBy.map((p) => `Pipeline "${p}"`).join(", "),
      " still ",
      blockedBy.length > 1 ? "have" : "has",
      " a step for ",
      name,
      ". Remove the step in the Glidepath tab first, then come back."
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs(DialogContentText, { component: "div", children: [
        "Staging this removes ",
        name,
        " from cicd.yaml. Nothing happens until you open the pull request and merge it.",
        cloud ? /* @__PURE__ */ jsx("div", { className: classes.dialogNote, children: "The cloud resource this environment deployed to is not deleted. Remove it in your cloud account." }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("div", { className: classes.dialogNote, children: "The same pull request deletes, where they exist:" }),
          /* @__PURE__ */ jsx("ul", { className: classes.mono, children: files.map((f) => /* @__PURE__ */ jsx("li", { children: f }, f)) }),
          /* @__PURE__ */ jsxs("div", { className: classes.dialogNote, children: [
            "After it merges, Argo CD prunes the Application ",
            /* @__PURE__ */ jsxs("span", { className: classes.mono, children: [
              appName,
              "-",
              name
            ] }),
            " and the namespace ",
            /* @__PURE__ */ jsxs("span", { className: classes.mono, children: [
              "app-",
              appName,
              "-",
              name
            ] }),
            ", deleting everything running in it."
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx(
        TextField,
        {
          id: "remove-env-confirm",
          autoFocus: true,
          fullWidth: true,
          size: "small",
          style: { marginTop: 14 },
          label: `Type ${name} to confirm`,
          value: typed,
          onChange: (e) => setTyped(e.target.value),
          InputLabelProps: { shrink: true }
        }
      )
    ] }) }),
    /* @__PURE__ */ jsxs(DialogActions, { children: [
      /* @__PURE__ */ jsx(Button, { onClick: onCancel, children: "Cancel" }),
      /* @__PURE__ */ jsx(Button, { disabled: blocked || typed !== name, onClick: onConfirm, children: "Stage removal" })
    ] })
  ] });
}
function ChangeResultDialog({
  requests,
  cicdPrUrl,
  error,
  onClose,
  classes
}) {
  return /* @__PURE__ */ jsxs(Dialog, { open: true, onClose, PaperProps: { className: classes.dialogPaper }, children: [
    /* @__PURE__ */ jsx(DialogTitle, { children: error ? "Something needs attention" : "Pull requests opened" }),
    /* @__PURE__ */ jsxs(DialogContent, { children: [
      error && /* @__PURE__ */ jsx(DialogContentText, { className: classes.problem, children: error }),
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

export { EnvironmentsTab };
//# sourceMappingURL=EnvironmentsTab.esm.js.map
