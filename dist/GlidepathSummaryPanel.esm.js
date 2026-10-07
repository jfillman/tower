import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { load } from 'js-yaml';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { HangarMark } from './brand/HangarMark.esm.js';
import { useCicdConfig, usePlatformEnvs, usePlatformFile } from './useConfigData.esm.js';
import { PipelineFlowPreview } from './PipelineFlowPreview.esm.js';
import { readEnvironments, pipelinesNamingEnv } from './environments/stagedChanges.esm.js';
import { DEPLOY_TARGETS } from './serviceClass.esm.js';
import { Button, TierChip, ColumnLabel } from './ui/index.esm.js';
import { ENVS_ROOT } from './types.esm.js';

const useStyles = makeStyles(() => ({
  panel: {
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6,
    padding: "14px 18px",
    marginBottom: 20,
    backgroundColor: ({ t }) => t.panel,
    display: "flex",
    flexDirection: "column",
    gap: 14
  },
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  headLeft: { display: "flex", alignItems: "center", gap: 8 },
  headRight: { display: "flex", gap: 8, alignItems: "center" },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14, color: ({ t }) => t.textHi },
  chain: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  chainItem: { display: "inline-flex", alignItems: "center", gap: 6 },
  chainName: { fontFamily: fontDisplay, fontWeight: 600, fontSize: 14, color: ({ t }) => t.textHi },
  arrow: { color: ({ t }) => t.textFaint, fontFamily: fontMono, fontSize: 12 },
  grid: { display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start" },
  col: { display: "flex", flexDirection: "column", gap: 6, minWidth: 200 },
  value: { fontSize: 12.5, color: ({ t }) => t.textHi },
  muted: { fontSize: 12, color: ({ t }) => t.textLo },
  envRows: { display: "flex", flexDirection: "column", gap: 6 },
  envRow: { display: "grid", gridTemplateColumns: "90px 70px 1fr", gap: 10, alignItems: "center", fontSize: 12.5 },
  mono: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo },
  pipelinesList: { display: "flex", flexDirection: "column", gap: 10 },
  strategyWarn: { fontSize: 11, fontStyle: "italic", color: ({ t }) => t.amberInk },
  // A visible stand-in for loading/error/no-data, replacing what used to be
  // a silent `return null` (2026-09-18 bug report: "the new glidepath panel
  // on the pipelines tab disappeared" - a transient cicd.yaml fetch hiccup
  // made the whole panel, including its own "Configure in Glidepath" escape
  // hatch, vanish with zero indication anything was wrong; it always came
  // back on the next successful fetch, but looked exactly like a
  // regression). fontStyle italic matches this platform's other "nothing to
  // show yet" captions (e.g. ArgoCommandPanel's `note`).
  statusNote: { fontSize: 11.5, fontStyle: "italic", color: ({ t }) => t.textFaint },
  statusNoteError: { fontSize: 11.5, fontStyle: "italic", color: ({ t }) => t.bad }
}));
function GlidepathSummaryPanel({ owner, appName }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [, setSearchParams] = useSearchParams();
  const [expanded, setExpanded] = useState(false);
  const cicd = useCicdConfig({ owner, appName });
  const envs = usePlatformEnvs({ owner, appName });
  const prEnv = usePlatformFile({ owner, appName, selector: { kind: "pr-env" } });
  const goToGlidepath = () => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set("tab", "glidepath");
    return next;
  });
  let statusNote;
  if (cicd.loading) statusNote = "loading\u2026";
  else if (cicd.error) statusNote = `couldn't load cicd.yaml: ${cicd.error}`;
  else if (!cicd.data) statusNote = "no cicd.yaml found yet for this app";
  const deploy = cicd.data?.values.deploy ?? {};
  const { envs: environments } = readEnvironments(deploy);
  const targetId = typeof deploy.target === "string" ? deploy.target : "k8s-rollout";
  const targetLabel = DEPLOY_TARGETS[targetId]?.label ?? targetId;
  const strategy = deploy.strategy === "rollout" ? "rollout" : "deployment";
  const configuredEnvs = new Set(envs.data?.envs ?? []);
  const pipelines = cicd.data?.values.pipelines ?? {};
  const pipelineEntries = Object.entries(pipelines);
  const eph = cicd.data?.values.ephemeralEnvironments ?? {};
  const ephBranch = eph.branch ?? {};
  const ephPr = eph.pullRequest ?? {};
  let previewPorts;
  if (prEnv.data?.raw) {
    try {
      const parsed = load(prEnv.data.raw);
      const rollout = parsed?.rollout ?? {};
      if (Array.isArray(rollout.ports)) {
        previewPorts = rollout.ports.map((p) => `${p.name ?? "port"} \u2192 ${p.containerPort ?? "?"}`).join(", ");
      }
    } catch {
    }
  }
  const whereOf = (e) => {
    if (e.tier === "flight") return `${e.cluster ?? "same cluster"} \xB7 gitops values`;
    if (targetId !== "k8s-rollout") return targetLabel;
    return configuredEnvs.has(e.name) ? `${ENVS_ROOT}/envs/${e.name}.yaml` : "chart defaults, no values file yet";
  };
  return /* @__PURE__ */ jsxs("div", { className: classes.panel, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.headLeft, children: [
        /* @__PURE__ */ jsx(HangarMark, { glyph: "glidepath", size: 18 }),
        /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Glidepath at a glance" }),
        statusNote && /* @__PURE__ */ jsx(Typography, { className: cicd.error ? classes.statusNoteError : classes.statusNote, children: statusNote })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.headRight, children: [
        !statusNote && /* @__PURE__ */ jsx(Button, { small: true, onClick: () => setExpanded((v) => !v), "aria-expanded": expanded, children: expanded ? "Hide details" : "Show details" }),
        /* @__PURE__ */ jsx(Button, { small: true, onClick: goToGlidepath, children: "Configure in Glidepath \u2192" })
      ] })
    ] }),
    !statusNote && cicd.data && /* @__PURE__ */ jsxs("div", { className: classes.chain, "aria-label": "Environments in promotion order", children: [
      environments.map((e, i) => /* @__PURE__ */ jsxs("span", { className: classes.chainItem, children: [
        i > 0 && /* @__PURE__ */ jsx("span", { className: classes.arrow, children: "\u2192" }),
        /* @__PURE__ */ jsx("span", { className: classes.chainName, children: e.name }),
        /* @__PURE__ */ jsx(TierChip, { tier: e.tier })
      ] }, e.name)),
      environments.length === 0 && /* @__PURE__ */ jsx("span", { className: classes.muted, children: "No environments declared." })
    ] }),
    expanded && !statusNote && cicd.data && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: classes.grid, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.col, children: [
          /* @__PURE__ */ jsx(ColumnLabel, { children: "Environments" }),
          /* @__PURE__ */ jsx("div", { className: classes.envRows, children: environments.map((e) => /* @__PURE__ */ jsxs("div", { className: classes.envRow, children: [
            /* @__PURE__ */ jsx("span", { className: classes.chainName, children: e.name }),
            /* @__PURE__ */ jsx(TierChip, { tier: e.tier }),
            /* @__PURE__ */ jsx("span", { className: classes.mono, children: whereOf(e) }),
            pipelinesNamingEnv(pipelines, e.name).length === 0 && pipelineEntries.length > 0 && /* @__PURE__ */ jsxs("span", { className: classes.strategyWarn, style: { gridColumn: "3 / -1", marginTop: -4 }, children: [
              "No pipeline step ",
              e.tier === "flight" ? "releases" : "deploys",
              " to ",
              e.name,
              "."
            ] })
          ] }, e.name)) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.col, children: [
          /* @__PURE__ */ jsx(ColumnLabel, { children: "Deploy strategy" }),
          /* @__PURE__ */ jsx("span", { className: classes.value, children: strategy }),
          strategy === "deployment" && /* @__PURE__ */ jsx("span", { className: classes.strategyWarn, children: "Every deploy actually provisions an Argo Rollout today, regardless of this setting." })
        ] }),
        previewPorts && /* @__PURE__ */ jsxs("div", { className: classes.col, children: [
          /* @__PURE__ */ jsx(ColumnLabel, { children: "Preview environments (template)" }),
          /* @__PURE__ */ jsxs("span", { className: classes.value, children: [
            "Ports: ",
            previewPorts
          ] }),
          /* @__PURE__ */ jsx("span", { className: classes.strategyWarn, children: "Image is stamped per-PR by the ArgoCD ApplicationSet, not shown here." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.col, children: [
          /* @__PURE__ */ jsx(ColumnLabel, { children: "Ephemeral environments" }),
          /* @__PURE__ */ jsxs("span", { className: classes.value, children: [
            "Branch-triggered: ",
            ephBranch.enabled ? "on" : "off",
            ephBranch.enabled && Array.isArray(ephBranch.patterns) && ephBranch.patterns.length > 0 ? ` (${ephBranch.patterns.join(", ")})` : ""
          ] }),
          /* @__PURE__ */ jsxs("span", { className: classes.value, children: [
            "PR-label-triggered: ",
            ephPr.enabled ? "on" : "off",
            ephPr.enabled && Array.isArray(ephPr.labels) && ephPr.labels.length > 0 ? ` (${ephPr.labels.join(", ")})` : ""
          ] }),
          /* @__PURE__ */ jsxs("span", { className: classes.value, children: [
            "TTL: ",
            typeof eph.ttl === "string" ? eph.ttl : "5d"
          ] })
        ] })
      ] }),
      pipelineEntries.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.pipelinesList, children: [
        /* @__PURE__ */ jsx(ColumnLabel, { children: "Configured pipelines" }),
        pipelineEntries.map(([name, pipeline]) => /* @__PURE__ */ jsx(PipelineFlowPreview, { name, pipeline }, name))
      ] })
    ] })
  ] });
}

export { GlidepathSummaryPanel };
//# sourceMappingURL=GlidepathSummaryPanel.esm.js.map
