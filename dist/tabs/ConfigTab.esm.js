import { jsx, jsxs } from 'react/jsx-runtime';
import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Typography from '@material-ui/core/Typography';
import WarningRoundedIcon from '@material-ui/icons/WarningRounded';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useHangarTokens } from '../brand/tokens.esm.js';
import { TowerEmptyState } from '../TowerEmptyState.esm.js';
import { useReleaseContext } from '../useReleaseContext.esm.js';
import { ConfigEditor } from '../values/ValuesForm.esm.js';
import { EnvXrPanel, ConfigMapFilesPanel } from '../values/FlightPanels.esm.js';
import { useChartValues } from '../values/annotatedValues.esm.js';
import { useComponentCatalog } from '../values/componentCatalog.esm.js';
import { useFlightValuesSource } from '../values/sources.esm.js';
import { useStyles } from '../values/styles.esm.js';

function isProdEnv(env) {
  return /^(prod|production)$/i.test(env);
}
function ConfigTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { owner, appName, pipelineOrder, loading, error } = useReleaseContext();
  const flightEnvs = useMemo(() => {
    if (!pipelineOrder.upper) return [];
    return pipelineOrder.upper.map((name) => ({
      env: name,
      cluster: pipelineOrder.upperClusters?.[name] ?? ""
    }));
  }, [pipelineOrder.upper, pipelineOrder.upperClusters]);
  const [searchParams] = useSearchParams();
  const [selectedEnv, setSelectedEnv] = useState(searchParams.get("env") ?? void 0);
  useEffect(() => {
    if (!selectedEnv && flightEnvs.length > 0) setSelectedEnv(flightEnvs[0].env);
  }, [flightEnvs, selectedEnv]);
  if (loading) return /* @__PURE__ */ jsx(Progress, {});
  if (error) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(error) });
  if (!owner || !appName) {
    return /* @__PURE__ */ jsx(
      TowerEmptyState,
      {
        title: "Can't resolve this app's source repo",
        description: "App Configuration needs a resolved GitHub owner/repo (from a promoted environment's provenance) to know which gitops-<app> repo to read."
      }
    );
  }
  if (pipelineOrder.loading || !pipelineOrder.data && !pipelineOrder.error) return /* @__PURE__ */ jsx(Progress, {});
  if (pipelineOrder.error) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(pipelineOrder.error) });
  if (flightEnvs.length === 0) {
    return /* @__PURE__ */ jsx(
      TowerEmptyState,
      {
        title: "No flight environments yet",
        description: `App Configuration only supports flight (upper) environments, and ${appName}'s cicd.yaml doesn't declare any yet. This is expected until CI/CD is set up for this app - it's not an error.`
      }
    );
  }
  const active = flightEnvs.find((e) => e.env === selectedEnv) ?? flightEnvs[0];
  const prod = isProdEnv(active.env);
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: `${classes.envBanner} ${prod ? classes.envBannerProd : classes.envBannerOther}`, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.envBannerLeft, children: [
        prod && /* @__PURE__ */ jsx(WarningRoundedIcon, { style: { color: t.bad } }),
        /* @__PURE__ */ jsxs(Typography, { className: `${classes.envBannerTitle} ${prod ? classes.envBannerTitleProd : classes.envBannerTitleOther}`, children: [
          "Editing ",
          active.env.toUpperCase()
        ] }),
        /* @__PURE__ */ jsx("select", { className: classes.select, value: active.env, onChange: (e) => setSelectedEnv(e.target.value), children: flightEnvs.map((e) => /* @__PURE__ */ jsxs("option", { value: e.env, children: [
          e.env,
          " (",
          e.cluster,
          ")"
        ] }, e.env)) })
      ] }),
      /* @__PURE__ */ jsxs(Typography, { className: classes.envBannerPath, children: [
        "gitops-",
        appName,
        "/",
        active.cluster,
        "/",
        active.env,
        "/values.yaml"
      ] })
    ] }),
    /* @__PURE__ */ jsx(EnvXrPanel, { owner, appName, env: active.env, classes }),
    /* @__PURE__ */ jsx(ConfigMapFilesPanel, { owner, appName, cluster: active.cluster, env: active.env, classes }),
    /* @__PURE__ */ jsx(FlightValuesEditor, { owner, appName, cluster: active.cluster, env: active.env, prod })
  ] });
}
function FlightValuesEditor({ owner, appName, cluster, env, prod }) {
  const source = useFlightValuesSource({ owner, appName, cluster, env });
  const componentCatalog = useComponentCatalog(owner);
  const chart = useChartValues(owner);
  return /* @__PURE__ */ jsx(ConfigEditor, { owner, appName, source, componentCatalog, chart, title: `${env.toUpperCase()} (${cluster})`, prod, layout: "side" });
}

export { ConfigTab };
//# sourceMappingURL=ConfigTab.esm.js.map
