import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';
import { pipelinesNamingEnv } from '../../environments/stagedChanges.esm.js';
import { ConfigEditor } from '../../values/ValuesForm.esm.js';
import { EnvXrPanel, ConfigMapFilesPanel } from '../../values/FlightPanels.esm.js';
import { useChartValues } from '../../values/annotatedValues.esm.js';
import { useComponentCatalog } from '../../values/componentCatalog.esm.js';
import { useClusterAnalysisTemplates } from '../../values/useClusterAnalysisTemplates.esm.js';
import { useFlightValuesSource, useGroundValuesSource, useEnvValuesLoader } from '../../values/sources.esm.js';
import { useEnvLifecycle } from '../../environments/useEnvLifecycle.esm.js';
import { EnvLifecycle } from './EnvLifecycle.esm.js';
import { useStyles as useStyles$1 } from '../../values/styles.esm.js';
import { Subtabs, Field, ColumnLabel, Button } from '../../ui/index.esm.js';
import { useUi } from '../../ui/styles.esm.js';
import { BLOCK_FIELDS } from './shared.esm.js';

const useStyles = makeStyles(() => ({
  wrap: { display: "flex", flexDirection: "column", gap: 12, padding: "16px 18px 18px 48px", backgroundColor: ({ t }) => t.panelAlt, borderTop: ({ t }) => `1px solid ${t.line}` },
  body: { display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 },
  grid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px 22px", maxWidth: 760 },
  facts: { display: "grid", gridTemplateColumns: "120px 1fr", gap: "8px 16px", alignItems: "baseline" },
  mono: { fontFamily: fontMono, fontSize: 12.5 },
  steps: { margin: "6px 0 0", paddingLeft: 20, lineHeight: 1.7 },
  foot: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, borderTop: ({ t }) => `1px solid ${t.line}`, paddingTop: 12, color: ({ t }) => t.textLo, fontSize: 12.5 }
}));
function RowDetail(props) {
  const { row, ctx } = props;
  const hasFile = !ctx.cloudBlock && row.state !== "new" && row.state !== "pr-open" && Boolean(ctx.owner && ctx.appName);
  if (!hasFile) return /* @__PURE__ */ jsx(RowDetailBody, { ...props });
  if (row.def.tier === "flight") return /* @__PURE__ */ jsx(FlightRow, { ...props });
  return /* @__PURE__ */ jsx(GroundRow, { ...props });
}
function FlightRow(props) {
  const { row, ctx } = props;
  const source = useFlightValuesSource({ owner: ctx.owner, appName: ctx.appName, cluster: row.def.cluster ?? row.where, env: row.name });
  return /* @__PURE__ */ jsx(RowDetailBody, { ...props, source });
}
function GroundRow(props) {
  const { row, ctx } = props;
  const source = useGroundValuesSource({ owner: ctx.owner, appName: ctx.appName, env: row.name });
  return /* @__PURE__ */ jsx(RowDetailBody, { ...props, source });
}
function RowDetailBody({ row, ctx, source }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const ui = useUi({ t });
  const { def } = row;
  const [tab, setTab] = useState(ctx.cloudBlock ? "settings" : "values");
  const removed = row.state === "removed";
  const steps = pipelinesNamingEnv(ctx.pipelines, row.name);
  const valuesFileExists = Boolean(source?.data?.raw?.trim());
  const pending = ctx.pendingFor(row.name);
  const ghost = row.state === "pr-open";
  const lifecycle = useEnvLifecycle(
    {
      owner: ctx.owner ?? "",
      appName: ctx.appName ?? "",
      env: row.name,
      tier: def.tier,
      cluster: def.cluster ?? row.where,
      declared: !ghost && row.state !== "new",
      cicdPrUrl: pending?.prUrl,
      knownRequestUrl: pending?.requestUrl,
      deployed: row.deployed,
      valuesFileExists,
      valuesFilePath: source?.data?.path ?? `${ctx.envsRoot}/envs/${row.name}.yaml`
    },
    !ctx.cloudBlock && Boolean(ctx.owner && ctx.appName) && row.state !== "new" && row.state !== "removed"
  );
  const unfinished = lifecycle.steps.some((x) => x.state !== "done");
  if (ghost) {
    return /* @__PURE__ */ jsxs("div", { className: c.wrap, children: [
      /* @__PURE__ */ jsx(EnvLifecycle, { steps: lifecycle.steps, initiallyOpen: true }),
      /* @__PURE__ */ jsx("div", { className: ui.note, children: "Nothing here can be edited until the environment exists. It appears in the table as it is created." })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: c.wrap, children: [
    !ctx.cloudBlock && unfinished && row.state !== "new" && /* @__PURE__ */ jsx(EnvLifecycle, { steps: lifecycle.steps }),
    /* @__PURE__ */ jsx(
      Subtabs,
      {
        label: `${row.name} sections`,
        value: tab,
        onChange: setTab,
        tabs: [
          { id: "settings", label: "Settings" },
          { id: "values", label: "Values" },
          { id: "promotion", label: "Promotion" },
          { id: "danger", label: "Danger zone" }
        ]
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: c.body, children: [
      tab === "settings" && /* @__PURE__ */ jsx(Settings, { row, ctx }),
      tab === "values" && /* @__PURE__ */ jsx(Values, { row, ctx, source }),
      tab === "promotion" && /* @__PURE__ */ jsxs("div", { className: ui.note, children: [
        def.tier === "ground" ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("b", { children: "Ground." }),
          " Deploys automatically on every push to the default branch."
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("b", { children: "Flight." }),
          " Never deploys without an approved release: a pull request on",
          " ",
          /* @__PURE__ */ jsxs("span", { className: c.mono, children: [
            "gitops-",
            ctx.appName
          ] }),
          " that Argo CD applies once it merges."
        ] }),
        /* @__PURE__ */ jsx("div", { style: { marginTop: 10 }, children: steps.length > 0 ? /* @__PURE__ */ jsxs(Fragment, { children: [
          def.tier === "ground" ? "Deploy" : "Release",
          " step in pipeline ",
          steps.map((s) => `"${s}"`).join(", "),
          "."
        ] }) : /* @__PURE__ */ jsxs("span", { className: ui.problem, children: [
          "No pipeline step ",
          def.tier === "ground" ? "deploys" : "releases",
          " to ",
          row.name,
          ". Add one in the Glidepath tab."
        ] }) })
      ] }),
      tab === "danger" && /* @__PURE__ */ jsx(Danger, { row, ctx, removed })
    ] }),
    tab === "settings" && ctx.cloudBlock && /* @__PURE__ */ jsx("div", { className: c.foot, children: /* @__PURE__ */ jsx("span", { children: "Staged. Nothing is submitted until you open the pull request from the pending changes." }) })
  ] });
}
function Settings({ row, ctx }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const vc = useStyles$1({ t });
  const ui = useUi({ t });
  const { def } = row;
  const block = ctx.cloudBlock;
  if (block) {
    const appLevel = ctx.deploy?.[block] ?? {};
    const own = def[block] ?? {};
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: ui.note, children: [
        "This environment's ",
        ctx.targetLabel,
        " resource. Leave a field empty to use the app-level value."
      ] }),
      /* @__PURE__ */ jsx("div", { className: c.grid, children: BLOCK_FIELDS[block].map((f) => /* @__PURE__ */ jsx(
        Field,
        {
          id: `env-${row.name}-${f}`,
          label: f,
          source: own[f] !== void 0 && own[f] !== "" ? { text: "set here", set: true } : { text: "app-level" },
          children: (p) => /* @__PURE__ */ jsx(
            "input",
            {
              ...p,
              value: String(own[f] ?? ""),
              placeholder: String(appLevel[f] ?? ""),
              onChange: (e) => ctx.onSetField(def, block, f, e.target.value)
            }
          )
        },
        f
      )) })
    ] });
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: c.facts, children: [
      /* @__PURE__ */ jsx(ColumnLabel, { children: "Tier" }),
      /* @__PURE__ */ jsx("span", { children: def.tier === "flight" ? "Flight" : "Ground" }),
      /* @__PURE__ */ jsx(ColumnLabel, { children: "Cluster" }),
      /* @__PURE__ */ jsx("span", { className: c.mono, children: def.cluster ?? row.where }),
      /* @__PURE__ */ jsx(ColumnLabel, { children: "Target" }),
      /* @__PURE__ */ jsx("span", { children: row.target })
    ] }),
    /* @__PURE__ */ jsx("div", { className: ui.note, children: "Tier, cluster and target cannot change on an existing environment. Remove it and add it again." }),
    def.tier === "flight" && ctx.owner && ctx.appName && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(EnvXrPanel, { owner: ctx.owner, appName: ctx.appName, env: row.name, classes: vc }),
      /* @__PURE__ */ jsx(ConfigMapFilesPanel, { owner: ctx.owner, appName: ctx.appName, cluster: def.cluster ?? row.where, env: row.name, classes: vc })
    ] })
  ] });
}
function Values({ row, ctx, source }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const ui = useUi({ t });
  const { def } = row;
  const gate = (src) => src && !src.loading && !src.error && src.data && !src.data.raw.trim() ? /* @__PURE__ */ jsxs("div", { className: ui.note, children: [
    "The values file ",
    /* @__PURE__ */ jsx("span", { className: c.mono, children: src.data.path }),
    " does not exist yet, so there is nothing to edit. The progress above shows what it is waiting on. It can be edited here as soon as it exists."
  ] }) : void 0;
  if (ctx.cloudBlock) {
    return /* @__PURE__ */ jsx("div", { className: ui.note, children: "A cloud environment has no chart values. Its target resource is under Settings." });
  }
  if (def.tier === "ground") {
    if (row.state === "new") {
      return /* @__PURE__ */ jsxs("div", { className: ui.note, children: [
        "Its values file, ",
        /* @__PURE__ */ jsxs("span", { className: c.mono, children: [
          ctx.envsRoot,
          "/envs/",
          row.name,
          ".yaml"
        ] }),
        ", is created by a second pull request after the cicd.yaml change merges. Edit its values here once that is merged."
      ] });
    }
    return gate(source) ?? /* @__PURE__ */ jsx(GroundValues, { ctx, env: row.name, cluster: row.where, source });
  }
  return gate(source) ?? /* @__PURE__ */ jsx(FlightValues, { ctx, env: row.name, cluster: def.cluster ?? row.where, source });
}
function useCopyFrom(ctx, env) {
  const load = useEnvValuesLoader();
  const others = ctx.siblings.filter((e) => e.name !== env);
  return {
    options: others.map((e) => ({ id: e.name, label: `${e.name} (${e.tier === "flight" ? "Flight" : "Ground"})` })),
    load: (id) => {
      const e = ctx.siblings.find((x) => x.name === id);
      return load({ owner: ctx.owner, appName: ctx.appName, env: id, tier: e.tier, cluster: e.cluster });
    }
  };
}
function GroundValues({ ctx, env, cluster, source }) {
  const copyFrom = useCopyFrom(ctx, env);
  const clusterTemplates = useClusterAnalysisTemplates(cluster);
  const componentCatalog = useComponentCatalog(ctx.owner);
  const chart = useChartValues(ctx.owner);
  return /* @__PURE__ */ jsx(
    ConfigEditor,
    {
      owner: ctx.owner,
      appName: ctx.appName,
      source,
      title: env.toUpperCase(),
      layout: "inline",
      copyFrom,
      analysisCluster: cluster,
      clusterAnalysisTemplates: clusterTemplates,
      componentCatalog,
      chart,
      sloContext: { cluster, namespace: `app-${ctx.appName}-${env}`, app: ctx.appName }
    }
  );
}
function FlightValues({ ctx, env, cluster, source }) {
  const copyFrom = useCopyFrom(ctx, env);
  const clusterTemplates = useClusterAnalysisTemplates(cluster);
  const componentCatalog = useComponentCatalog(ctx.owner);
  const chart = useChartValues(ctx.owner);
  return /* @__PURE__ */ jsx(
    ConfigEditor,
    {
      owner: ctx.owner,
      appName: ctx.appName,
      source,
      title: `${env.toUpperCase()} (${cluster})`,
      prod: /^prod/i.test(env),
      layout: "inline",
      copyFrom,
      analysisCluster: cluster,
      clusterAnalysisTemplates: clusterTemplates,
      componentCatalog,
      chart,
      sloContext: { cluster, namespace: `app-${ctx.appName}-${env}`, app: ctx.appName }
    }
  );
}
function Danger({ row, ctx, removed }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const ui = useUi({ t });
  const { def } = row;
  if (removed) {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: ui.note, children: [
        row.name,
        " is staged for removal. Nothing happens until you open the pull request."
      ] }),
      /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(Button, { onClick: () => ctx.onUndoRemove(row.name), children: "Undo removal" }) })
    ] });
  }
  if (def.tier === "ground") {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { className: ui.note, children: ctx.cloudBlock ? `Removes ${row.name} from cicd.yaml. The ${ctx.targetLabel} resource it deployed to is not deleted.` : `Removes ${row.name} from cicd.yaml and deletes its values files in the same pull request. Argo CD then deletes everything running in it.` }),
      /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsxs(Button, { variant: "danger", onClick: () => ctx.onRemove(row.name), children: [
        "Remove ",
        row.name,
        "\u2026"
      ] }) })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: ui.problem, children: [
    /* @__PURE__ */ jsx("b", { children: "Removing a Flight environment" }),
    /* @__PURE__ */ jsxs("div", { className: ui.note, children: [
      "Tower does not remove Flight environments. Deleting the ApplicationEnvironment does not delete the files it wrote, so a partial removal would leave an Application still deploying. By hand, in this order:",
      /* @__PURE__ */ jsxs("ol", { className: c.steps, children: [
        /* @__PURE__ */ jsxs("li", { children: [
          "Remove the pipeline step that releases to ",
          row.name,
          " (Glidepath tab)."
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          "In the tenants repo, delete",
          " ",
          /* @__PURE__ */ jsxs("span", { className: c.mono, children: [
            "tenants/",
            ctx.appName,
            "/",
            row.name,
            "/"
          ] }),
          " ",
          "so the Application is no longer generated."
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          "In ",
          /* @__PURE__ */ jsxs("span", { className: c.mono, children: [
            "gitops-",
            ctx.appName
          ] }),
          ", delete",
          " ",
          /* @__PURE__ */ jsxs("span", { className: c.mono, children: [
            def.cluster ?? "<cluster>",
            "/",
            row.name,
            "/"
          ] }),
          "."
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          "Delete the ApplicationEnvironment request, then remove ",
          row.name,
          " from cicd.yaml."
        ] })
      ] })
    ] })
  ] });
}

export { RowDetail };
//# sourceMappingURL=RowDetail.esm.js.map
