import { jsx, jsxs } from 'react/jsx-runtime';
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontMono, useHangarTokens } from '../brand/tokens.esm.js';
import { useReleaseContext, nicknameForImageTag } from '../useReleaseContext.esm.js';
import { useTektonPipelineRuns } from '../tekton/useTektonPipelineRuns.esm.js';
import { RefreshButton } from '../RefreshButton.esm.js';
import { EnvironmentTopology } from '../EnvironmentTopology.esm.js';
import { EnvPicker } from '../EnvPicker.esm.js';
import { envStageRank, envTierOf, imageTag, health } from '../types.esm.js';

const TIER_DISPLAY_ORDER = ["lower", "upper", "preview"];
const useStyles = makeStyles(() => ({
  main: { display: "flex", flexDirection: "column", gap: 16 },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: "0.06em",
    color: ({ t }) => t.textFaint,
    textTransform: "uppercase"
  },
  note: { fontSize: 12.5, fontStyle: "italic", padding: "14px 20px", color: ({ t }) => t.textLo }
}));
function TopologyTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { environments, loading, error, appName, pipelineOrder, refresh } = useReleaseContext();
  const pipelineRuns = useTektonPipelineRuns(appName);
  const [searchParams] = useSearchParams();
  const linkedEnv = searchParams.get("env") ?? void 0;
  const [selectedEnv, setSelectedEnv] = useState(void 0);
  useEffect(() => {
    if (selectedEnv && environments.some((e) => e.env === selectedEnv)) return;
    if (linkedEnv && environments.some((e) => e.env === linkedEnv)) {
      setSelectedEnv(linkedEnv);
      return;
    }
    setSelectedEnv(environments[0]?.env);
  }, [environments, linkedEnv]);
  const withTier = useMemo(
    () => environments.map((env) => ({
      env,
      tier: envTierOf(env.env, { lower: pipelineOrder.lower, upper: pipelineOrder.upper }),
      rank: envStageRank(env.env, pipelineOrder.data)
    })),
    [environments, pipelineOrder]
  );
  const pickerGroups = useMemo(
    () => TIER_DISPLAY_ORDER.map((tier) => {
      const items = withTier.filter((x) => x.tier === tier).sort((a, b) => a.rank - b.rank).map(({ env: e }) => {
        const tag = e.image ? imageTag(e.image) : void 0;
        return {
          key: e.key,
          envName: e.env,
          cluster: e.cluster,
          health: health(e),
          active: e.env === selectedEnv,
          imageTag: tag,
          imageNickname: tag ? nicknameForImageTag(tag, pipelineRuns.runs) : void 0,
          onClick: () => setSelectedEnv(e.env)
        };
      });
      return { tier, items };
    }).filter((g) => g.items.length > 0),
    [withTier, selectedEnv, pipelineRuns.runs]
  );
  if (loading) return /* @__PURE__ */ jsx(Progress, {});
  if (error) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(error) });
  if (environments.length === 0) {
    return /* @__PURE__ */ jsxs("div", { className: classes.main, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" }, children: [
        /* @__PURE__ */ jsx(Typography, { className: classes.eyebrow, children: "route \u2192 service \u2192 workload \u2192 pods, real-time from each cluster" }),
        /* @__PURE__ */ jsx(RefreshButton, { onClick: refresh })
      ] }),
      /* @__PURE__ */ jsx(
        EnvPicker,
        {
          summary: "0 environments",
          groups: [
            { tier: "lower", items: [] },
            { tier: "upper", items: [] }
          ],
          showConnectors: false
        }
      ),
      /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "Once something's rolled out somewhere, its topology will show up here." })
    ] });
  }
  const selected = environments.find((e) => e.env === selectedEnv) ?? environments[0];
  const selectedTier = envTierOf(selected.env, { lower: pipelineOrder.lower, upper: pipelineOrder.upper });
  return /* @__PURE__ */ jsxs("div", { className: classes.main, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" }, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.eyebrow, children: "route \u2192 service \u2192 workload \u2192 pods, real-time from each cluster" }),
      /* @__PURE__ */ jsx(RefreshButton, { onClick: refresh })
    ] }),
    /* @__PURE__ */ jsx(
      EnvPicker,
      {
        summary: `${environments.length} environment${environments.length === 1 ? "" : "s"}`,
        groups: pickerGroups,
        showConnectors: false
      }
    ),
    /* @__PURE__ */ jsx(EnvironmentTopology, { env: selected, tier: selectedTier })
  ] });
}

export { TopologyTab };
//# sourceMappingURL=TopologyTab.esm.js.map
