import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { ErrorBoundary } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef, EntityProvider } from '@backstage/plugin-catalog-react';
import { useHangarTokens, fontMono, fontDisplay } from './brand/tokens.esm.js';
import { HangarMark } from './brand/HangarMark.esm.js';
import { AppPicker } from './AppPicker.esm.js';
import { CAP, hasCapabilities } from './serviceClass.esm.js';
import { TowerDashboardPage } from './tabs/dashboard/TowerDashboardPage.esm.js';
import { OverviewTab } from './tabs/OverviewTab.esm.js';
import { ReleasesTab } from './tabs/ReleasesTab.esm.js';
import { ConfigureTab, isConfigureSubtab } from './tabs/ConfigureTab.esm.js';
import { TopologyTab } from './tabs/TopologyTab.esm.js';
import { AirspaceTab } from './tabs/AirspaceTab.esm.js';
import { AirspacePage } from './airspace/AirspacePage.esm.js';
import { AgentRequestsPage } from './agentRequests/AgentRequestsPage.esm.js';
import { AgentRequestsChip } from './agentRequests/AgentRequestsChip.esm.js';
import { AgentRequestsProvider } from './agentRequests/useAgentRequests.esm.js';
import { ForYouPage } from './forYou/ForYouPage.esm.js';
import { PullRequestsTab } from './tabs/PullRequestsTab.esm.js';
import { PipelinesTab } from './tabs/PipelinesTab.esm.js';
import { DeploymentsTab } from './tabs/DeploymentsTab.esm.js';
import { CloudDeploymentsTab } from './tabs/CloudDeploymentsTab.esm.js';
import { hasCloudDeployInFlight } from './cloudDeploy.esm.js';
import { ImagesTab } from './tabs/ImagesTab.esm.js';
import { SlosTab } from './tabs/SlosTab.esm.js';
import { NotificationsTab } from './tabs/NotificationsTab.esm.js';
import { useAppNotifications } from './useAppNotifications.esm.js';
import { useTektonPipelineRuns } from './tekton/useTektonPipelineRuns.esm.js';
import { TowerEnvironmentsProvider, useTowerEnvironments } from './useTowerEnvironments.esm.js';
import { isRolloutActive } from './types.esm.js';
import './ui/index.esm.js';
import { TabSkeleton, TabError } from './ui/LoadState.esm.js';
import { Tooltip } from './ui/Tooltip.esm.js';

const TABS = [
  { id: "overview", label: "Overview", Component: OverviewTab },
  { id: "pull-requests", label: "Pull requests", Component: PullRequestsTab, requires: [CAP.source] },
  { id: "pipelines", label: "Pipelines", Component: PipelinesTab, requires: [CAP.ci, CAP.build] },
  { id: "deployments", label: "Deployments", Component: DeploymentsTab, requires: [CAP.k8sRuntime] },
  // The same tab for a service that deploys to a cloud target instead of a Rollout. A service has
  // exactly one deploy target, so only one of the two ever passes the capability filter.
  { id: "deployments", label: "Deployments", Component: CloudDeploymentsTab, requires: [CAP.cloudRuntime] },
  { id: "releases", label: "Releases", Component: ReleasesTab, requires: [CAP.releases] },
  { id: "topology", label: "Topology", Component: TopologyTab, requires: [CAP.k8sRuntime] },
  { id: "airspace", label: "Airspace", Component: AirspaceTab, requires: [CAP.k8sRuntime] },
  { id: "images", label: "Images", Component: ImagesTab, requires: [CAP.images] },
  { id: "slos", label: "SLOs", Component: SlosTab, requires: [CAP.slo, CAP.k8sRuntime] },
  // Glidepath's build, deploy, release and config-change notifications: only a service onboarded to Glidepath has any.
  { id: "notifications", label: "Notifications", Component: NotificationsTab, requires: [CAP.source, CAP.ci] },
  // Environments, shared values and cicd.yaml: everything that lives in git (2026-10-22, was three tabs). Their old ids
  // are now its sub-tabs; activeTabId() maps them here so old deep links still work.
  { id: "configure", label: "Configure", Component: ConfigureTab, requires: [CAP.ci] }
];
function activeTabId(tabParam) {
  return isConfigureSubtab(tabParam) ? "configure" : tabParam;
}
const useStyles = makeStyles(() => ({
  // minHeight: 100vh, not 100% - a percentage height only resolves once
  // every ancestor up to <body> also has an explicit height, which
  // Backstage's own page/content wrapper doesn't guarantee. That gap showed
  // up as a real bug: the AppPicker's list (and its background) shrinks to
  // fit as a search narrows the results, and everything below the shrunk
  // content fell through to the page's un-themed default background instead
  // of staying instrument-panel dark/light. noHeader:true on this page's
  // route means nothing above this div eats into the viewport, so 100vh is
  // exactly this page's real available height, not an overshoot.
  root: { backgroundColor: ({ t }) => t.bg, minHeight: "100vh" },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 24px 0",
    flexWrap: "wrap",
    gap: 10
  },
  backLink: {
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: "0.04em",
    color: ({ t }) => t.textFaint,
    cursor: "pointer",
    background: "none",
    border: "none",
    padding: 0,
    marginBottom: 10,
    "&:hover": { color: ({ t }) => t.textHi }
  },
  titleRow: { display: "flex", alignItems: "center", gap: 10 },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 22, color: ({ t }) => t.textHi },
  tabbar: {
    display: "flex",
    gap: 2,
    borderBottom: ({ t }) => `1px solid ${t.line}`,
    padding: "0 24px",
    flexWrap: "wrap"
  },
  tab: {
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    padding: "10px 16px",
    color: ({ t }) => t.textFaint,
    borderBottom: "2px solid transparent",
    cursor: "pointer",
    background: "none",
    border: "none",
    borderBottomWidth: 2,
    borderBottomStyle: "solid"
  },
  tabActive: {
    color: ({ t }) => t.textHi,
    borderBottomColor: ({ t }) => t.amber
  },
  tabBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 15,
    height: 15,
    padding: "0 4px",
    marginLeft: 6,
    borderRadius: 100,
    fontSize: 11,
    fontWeight: 700,
    backgroundColor: ({ t }) => t.bad,
    color: ({ t }) => t.bg
  },
  // A pipeline actually running right now is worth surfacing even when the
  // user isn't looking at the CI/CD tab (2026-09-11: "give it your best
  // shot" on some kind of activity indicator) - a small pulsing dot on the
  // tab itself, the same visual language SignalRail/CiCdTab already use for
  // "something live" (dotLive/liveDot), rather than a count (how MANY
  // pipelines are running is rarely the interesting fact - THAT one is).
  // Suppressed while already on that tab - CiCdTab's own run list already
  // shows this, no need to also glow the tab you're looking straight at.
  tabActivityDot: {
    display: "inline-block",
    width: 6,
    height: 6,
    borderRadius: "50%",
    marginLeft: 6,
    backgroundColor: ({ t }) => t.sky,
    boxShadow: ({ t }) => `0 0 0 3px ${t.skySoft}`,
    animation: "$tabPulse 1.6s ease-in-out infinite"
  },
  "@keyframes tabPulse": {
    "0%, 100%": { opacity: 1 },
    "50%": { opacity: 0.4 }
  },
  body: { padding: "20px 24px 40px" }
}));
function TowerPage() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const catalogApi = useApi(catalogApiRef);
  const [searchParams, setSearchParams] = useSearchParams();
  const entityRef = searchParams.get("entity");
  const tabParam = searchParams.get("tab") ?? "overview";
  const isDashboardView = searchParams.get("view") === "dashboard";
  const isAirspaceView = searchParams.get("view") === "airspace";
  const isAgentRequestsView = searchParams.get("view") === "agent-requests";
  const isForYouView = searchParams.get("view") === "for-you";
  const [entity, setEntity] = useState(void 0);
  const [error, setError] = useState(void 0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!entityRef) {
      setEntity(void 0);
      return void 0;
    }
    let cancelled = false;
    setLoading(true);
    catalogApi.getEntityByRef(entityRef).then((e) => {
      if (!cancelled) {
        setEntity(e);
        setLoading(false);
      }
    }).catch((e) => {
      if (!cancelled) {
        setError(String(e));
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [entityRef, catalogApi]);
  const appName = entity?.metadata.annotations?.["github.com/project-slug"]?.split("/")[1] ?? entity?.metadata.name;
  const { recentCount } = useAppNotifications(appName);
  const selectApp = (ref) => setSearchParams({ entity: ref, tab: "overview" });
  const clearApp = () => setSearchParams({});
  const selectTab = (id) => setSearchParams({ entity: entityRef ?? "", tab: id });
  const openDashboard = () => setSearchParams({ view: "dashboard" });
  const openAirspace = () => setSearchParams({ view: "airspace" });
  const openAgentRequests = () => setSearchParams({ view: "agent-requests" });
  const openForYou = () => setSearchParams({ view: "for-you" });
  const openBreakglass = (_row, link) => setSearchParams(new URLSearchParams(link));
  let body;
  if (isDashboardView) {
    body = /* @__PURE__ */ jsx(TowerDashboardPage, { onBack: clearApp });
  } else if (isAirspaceView) {
    body = /* @__PURE__ */ jsx(AirspacePage, { onBack: clearApp });
  } else if (isAgentRequestsView) {
    body = /* @__PURE__ */ jsx(AgentRequestsPage, { onBack: clearApp });
  } else if (isForYouView) {
    body = /* @__PURE__ */ jsx(ForYouPage, { onBack: clearApp, onOpenAgentRequests: openAgentRequests });
  } else if (!entityRef) {
    body = /* @__PURE__ */ jsx("div", { style: { padding: "48px 24px" }, children: /* @__PURE__ */ jsx(AppPicker, { onSelect: selectApp, onOpenDashboard: openDashboard, onOpenAirspace: openAirspace, onOpenBreakglass: openBreakglass, onOpenAgentRequests: openAgentRequests, onOpenForYou: openForYou }) });
  } else if (loading) {
    body = /* @__PURE__ */ jsx(TabSkeleton, {});
  } else if (error) {
    body = /* @__PURE__ */ jsx("div", { style: { padding: 24 }, children: /* @__PURE__ */ jsx(TabError, { error, what: "this service" }) });
  } else if (!entity) {
    body = /* @__PURE__ */ jsx("div", { style: { padding: 24 }, children: /* @__PURE__ */ jsx(Typography, { children: "Service not found." }) });
  } else {
    body = /* @__PURE__ */ jsx(
      TowerAppShell,
      {
        entity,
        entityRef,
        tabParam,
        clearApp,
        selectTab,
        recentCount,
        classes
      }
    );
  }
  return /* @__PURE__ */ jsx(AgentRequestsProvider, { children: /* @__PURE__ */ jsxs("div", { className: classes.root, style: { position: "relative" }, children: [
    !isAgentRequestsView && /* @__PURE__ */ jsx(AgentRequestsChip, { onOpen: openAgentRequests }),
    body
  ] }) });
}
function TowerAppShell({
  entity,
  entityRef,
  tabParam,
  clearApp,
  selectTab,
  recentCount,
  classes
}) {
  return /* @__PURE__ */ jsx(EntityProvider, { entity, children: /* @__PURE__ */ jsx(TowerEnvironmentsProvider, { children: /* @__PURE__ */ jsx(
    TowerAppShellInner,
    {
      entity,
      entityRef,
      tabParam,
      clearApp,
      selectTab,
      recentCount,
      classes
    }
  ) }) });
}
function TowerAppShellInner({
  entity,
  entityRef,
  tabParam,
  clearApp,
  selectTab,
  recentCount,
  classes
}) {
  const appName = entity.metadata.annotations?.["github.com/project-slug"]?.split("/")[1] ?? entity.metadata.name;
  const ciPipelineRuns = useTektonPipelineRuns(appName);
  const ciActive = ciPipelineRuns.runs.some((r) => r.phase === "running");
  const { environments } = useTowerEnvironments();
  const cdActive = environments.some(isRolloutActive) || hasCloudDeployInFlight(ciPipelineRuns.runs);
  const tabs = TABS.filter((tabDef) => hasCapabilities(entity, tabDef.requires));
  const activeTab = tabs.find((tabDef) => tabDef.id === activeTabId(tabParam)) ?? tabs[0];
  const { Component } = activeTab;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: classes.header, children: /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("button", { className: classes.backLink, onClick: clearApp, type: "button", children: "\u2190 All services" }),
      /* @__PURE__ */ jsxs("div", { className: classes.titleRow, children: [
        /* @__PURE__ */ jsx(HangarMark, { glyph: "tower", size: 22 }),
        /* @__PURE__ */ jsx(Typography, { className: classes.title, children: entity.metadata.title ?? entity.metadata.name })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx("div", { className: classes.tabbar, children: tabs.map((tabDef) => /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        className: `${classes.tab} ${activeTab.id === tabDef.id ? classes.tabActive : ""}`,
        onClick: () => selectTab(tabDef.id),
        children: [
          tabDef.label,
          tabDef.id === "notifications" && recentCount > 0 && /* @__PURE__ */ jsx("span", { className: classes.tabBadge, children: recentCount > 9 ? "9+" : recentCount }),
          tabDef.id === "pipelines" && ciActive && /* @__PURE__ */ jsx(Tooltip, { title: "A pipeline is running", children: /* @__PURE__ */ jsx("span", { className: classes.tabActivityDot }) }),
          tabDef.id === "deployments" && cdActive && /* @__PURE__ */ jsx(Tooltip, { title: "A rollout is in progress", children: /* @__PURE__ */ jsx("span", { className: classes.tabActivityDot }) })
        ]
      },
      tabDef.id
    )) }),
    /* @__PURE__ */ jsx("div", { className: classes.body, children: /* @__PURE__ */ jsx(ErrorBoundary, { children: /* @__PURE__ */ jsx(Component, {}) }, `${entityRef}:${activeTab.id}`) })
  ] });
}

export { TABS, TowerPage, activeTabId };
//# sourceMappingURL=TowerPage.esm.js.map
