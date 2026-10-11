import { jsxs, jsx } from 'react/jsx-runtime';
import { useState, useEffect, useMemo } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Collapse from '@material-ui/core/Collapse';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import { fontDisplay, fontMono, useHangarTokens } from './brand/tokens.esm.js';
import { NamespaceEvents } from './NamespaceEvents.esm.js';
import { useNamespaceResource } from './useNamespaceResource.esm.js';
import { useClusterRbac } from './useClusterRbac.esm.js';
import { buildTopoStages, TopoDag } from './tabs/topology/TopoDag.esm.js';
import { TopologyStageDetail } from './tabs/topology/StageDetail.esm.js';
import { ResourceGallery } from './tabs/topology/ResourceGallery.esm.js';
import { health, ENV_TIER_LABEL } from './types.esm.js';
import { StatusChip, healthTone, FilterGroup, FilterChip } from './ui/index.esm.js';

const HEALTH_LABEL = {
  healthy: "Healthy",
  progressing: "Scaling",
  paused: "Paused",
  degraded: "Degraded",
  unknown: "Unknown"
};
const TIER_ACCENT = { preview: "textFaint", lower: "sky", upper: "amber" };
const TIER_CHIP_COLOR = { preview: "textFaint", lower: "sky", upper: "amber" };
const TIER_CHIP_SOFT = { preview: "panelAlt", lower: "skySoft", upper: "amberSoft" };
const useStyles = makeStyles(() => ({
  wrap: { display: "flex", flexDirection: "column", gap: 14 },
  head: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    padding: "4px 2px",
    borderLeft: "5px solid",
    paddingLeft: 14
  },
  headLeft: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  envName: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 17, textTransform: "lowercase", color: ({ t }) => t.textHi },
  tierDot: { width: 6, height: 6, borderRadius: "50%", display: "inline-block", marginRight: 5 },
  tierChip: { fontFamily: fontMono, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 8px", borderRadius: 3, display: "inline-flex", alignItems: "center" },
  clusterNote: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint },
  routeLink: { display: "inline-flex", alignItems: "center", gap: 4, fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.sky, textDecoration: "none", "&:hover": { textDecoration: "underline" } },
  dagCard: { backgroundColor: ({ t }) => t.panel, border: ({ t }) => `1px solid ${t.line}`, borderRadius: 10, display: "flex", flexDirection: "column" },
  dagInner: { padding: "10px 12px 4px" },
  dagDivider: { border: "none", borderTop: ({ t }) => `1px solid ${t.lineSoft}`, margin: 0 },
  stageDetailInner: { padding: "16px 18px" },
  panel: { backgroundColor: ({ t }) => t.panel, border: ({ t }) => `1px solid ${t.line}`, borderRadius: 8, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 },
  panelTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14, color: ({ t }) => t.textHi }
}));
function EnvironmentTopology({ env, tier }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const h = health(env);
  const stages = buildTopoStages(env);
  const [selectedStage, setSelectedStage] = useState("workload");
  useEffect(() => {
    setSelectedStage("workload");
  }, [env.key]);
  const [showResources, setShowResources] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const namespaceResource = useNamespaceResource(env.cluster, env.namespace);
  const referencedClusterRoleNames = useMemo(
    () => env.resources.filter((r) => r.kind === "RoleBinding").map((r) => r.raw?.roleRef).filter((ref) => ref?.kind === "ClusterRole" && Boolean(ref.name)).map((ref) => ref.name),
    [env.resources]
  );
  const { clusterRoleBindings, clusterRoles } = useClusterRbac(env.cluster, env.namespace, referencedClusterRoleNames);
  const galleryResources = useMemo(
    () => [
      ...namespaceResource ? [namespaceResource] : [],
      ...clusterRoleBindings,
      ...clusterRoles,
      ...env.resources
    ],
    [namespaceResource, clusterRoleBindings, clusterRoles, env.resources]
  );
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, style: { borderLeftColor: t[TIER_ACCENT[tier]] }, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.headLeft, children: [
        /* @__PURE__ */ jsx("span", { className: classes.envName, children: env.env }),
        /* @__PURE__ */ jsxs("span", { className: classes.tierChip, style: { backgroundColor: t[TIER_CHIP_SOFT[tier]], color: t[TIER_CHIP_COLOR[tier]] }, children: [
          /* @__PURE__ */ jsx("span", { className: classes.tierDot, style: { backgroundColor: t[TIER_CHIP_COLOR[tier]] } }),
          ENV_TIER_LABEL[tier]
        ] }),
        /* @__PURE__ */ jsxs("span", { className: classes.clusterNote, children: [
          env.namespace,
          " on ",
          env.cluster
        ] }),
        env.ingressUrl && /* @__PURE__ */ jsxs("a", { className: classes.routeLink, href: env.ingressUrl, target: "_blank", rel: "noopener noreferrer", children: [
          env.ingressUrl.replace(/^https?:\/\//, ""),
          " ",
          /* @__PURE__ */ jsx(OpenInNewIcon, { style: { fontSize: 12 } })
        ] })
      ] }),
      /* @__PURE__ */ jsx(StatusChip, { tone: healthTone(h), dot: true, children: HEALTH_LABEL[h] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.dagCard, children: [
      /* @__PURE__ */ jsx("div", { className: classes.dagInner, children: /* @__PURE__ */ jsx(TopoDag, { stages, selectedKey: selectedStage, onSelectKey: setSelectedStage, t }) }),
      /* @__PURE__ */ jsx("hr", { className: classes.dagDivider }),
      /* @__PURE__ */ jsx("div", { className: classes.stageDetailInner, children: /* @__PURE__ */ jsx(TopologyStageDetail, { env, tier, selectedKey: selectedStage }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs(FilterGroup, { label: "Show", children: [
        /* @__PURE__ */ jsx(FilterChip, { on: showResources, count: galleryResources.length, onClick: () => setShowResources((v) => !v), children: "All resources" }),
        /* @__PURE__ */ jsx(FilterChip, { on: showEvents, onClick: () => setShowEvents((v) => !v), children: "Events" })
      ] }),
      /* @__PURE__ */ jsx(Collapse, { in: showResources, unmountOnExit: true, children: /* @__PURE__ */ jsxs("div", { className: classes.panel, style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsxs(Typography, { className: classes.panelTitle, children: [
          "All resources in ",
          env.namespace
        ] }),
        /* @__PURE__ */ jsx(ResourceGallery, { resources: galleryResources, argoResources: env.argoResources })
      ] }) }),
      /* @__PURE__ */ jsx(Collapse, { in: showEvents, unmountOnExit: true, children: /* @__PURE__ */ jsx("div", { className: classes.panel, style: { marginTop: 10 }, children: /* @__PURE__ */ jsx(NamespaceEvents, { cluster: env.cluster, namespace: env.namespace }) }) })
    ] })
  ] });
}

export { EnvironmentTopology };
//# sourceMappingURL=EnvironmentTopology.esm.js.map
