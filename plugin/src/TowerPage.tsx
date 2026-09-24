import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { ErrorBoundary, Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef, EntityProvider } from '@backstage/plugin-catalog-react';
import type { Entity } from '@backstage/catalog-model';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { HangarMark } from '../brand/HangarMark';
import { AppPicker } from './AppPicker';
import { TowerDashboardPage } from './tabs/dashboard/TowerDashboardPage';
import { OverviewTab } from './tabs/OverviewTab';
import { ReleasesTab } from './tabs/ReleasesTab';
import { TopologyTab } from './tabs/TopologyTab';
import { PullRequestsTab } from './tabs/PullRequestsTab';
import { PipelinesTab } from './tabs/PipelinesTab';
import { DeploymentsTab } from './tabs/DeploymentsTab';
import { ImagesTab } from './tabs/ImagesTab';
import { ConfigTab } from './tabs/ConfigTab';
import { GlidepathTab } from './tabs/GlidepathTab';
import { SlosTab } from './tabs/SlosTab';
import { NotificationsTab } from './tabs/NotificationsTab';
import { useAppNotifications } from './useAppNotifications';
import { useTektonPipelineRuns } from './tekton/useTektonPipelineRuns';
import { useTowerEnvironments } from './useTowerEnvironments';
import { isRolloutActive } from './types';

// Order follows the real lifecycle of a change (2026-09-11 decision, see
// HANDOFF-tower-pr-integration.md's successor discussion): a PR is proposed,
// CI/CD builds/tests/promotes it, Releases is the resulting record (what
// shipped, when, provenance), Topology is where it's running now, Images is
// the artifact catalog, SLOs is how it performs afterward. CI/CD sits right
// after Pull Requests (not next to Releases) because it's the *mechanism* -
// Releases is a curated summary/report of what CI/CD already did, so it
// reads as the next stop after, not a peer either could swap with.
// Notifications/Config are utility tabs unrelated to that flow and stay
// parked at the end, in their prior relative order.
//
// 2026-09-16 (HANDOFF-tower-cicd-redesign.md): the old combined "CI / CD"
// tab split in two, Pipelines (CI, near-1:1 lift of the old CiCdTab.tsx run
// list) and Deployments (CD, the new "Ground Control" ArgoCD/Rollouts
// command center) - kept adjacent, in the same slot the combined tab held.
//
// 2026-09-16, same day: added Glidepath (full cicd.yaml + platform/ folder
// management) right next to Config/App Configuration - not next to Pipelines/
// Deployments, even though it configures the same CI/CD engine those tabs
// monitor. Both Glidepath and Config are utility "manage this app's own
// settings" surfaces, not stops in the lifecycle flow the tabs above them
// trace - explicitly decided not to rename Pipelines to Glidepath (it spans
// both Pipelines and Deployments, so a rename would misrepresent scope); the
// Glidepath name/logo lives on this tab instead. Config itself relabeled to
// "App Configuration" the same day, once "Config" became ambiguous between
// the two.
const TABS = [
  { id: 'overview', label: 'Overview', Component: OverviewTab },
  { id: 'pull-requests', label: 'Pull Requests', Component: PullRequestsTab },
  { id: 'pipelines', label: 'Pipelines', Component: PipelinesTab },
  { id: 'deployments', label: 'Deployments', Component: DeploymentsTab },
  { id: 'releases', label: 'Releases', Component: ReleasesTab },
  { id: 'topology', label: 'Topology', Component: TopologyTab },
  { id: 'images', label: 'Images', Component: ImagesTab },
  { id: 'slos', label: 'SLOs', Component: SlosTab },
  { id: 'notifications', label: 'Notifications', Component: NotificationsTab },
  { id: 'config', label: 'App Configuration', Component: ConfigTab },
  { id: 'glidepath', label: 'Glidepath', Component: GlidepathTab },
] as const;

type TabId = (typeof TABS)[number]['id'];


const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  // minHeight: 100vh, not 100% - a percentage height only resolves once
  // every ancestor up to <body> also has an explicit height, which
  // Backstage's own page/content wrapper doesn't guarantee. That gap showed
  // up as a real bug: the AppPicker's list (and its background) shrinks to
  // fit as a search narrows the results, and everything below the shrunk
  // content fell through to the page's un-themed default background instead
  // of staying instrument-panel dark/light. noHeader:true on this page's
  // route means nothing above this div eats into the viewport, so 100vh is
  // exactly this page's real available height, not an overshoot.
  root: { backgroundColor: ({ t }) => t.bg, minHeight: '100vh' },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px 0',
    flexWrap: 'wrap',
    gap: 10,
  },
  backLink: {
    fontFamily: fontMono,
    fontSize: 11.5,
    letterSpacing: '0.04em',
    color: ({ t }) => t.textFaint,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: 0,
    marginBottom: 10,
    '&:hover': { color: ({ t }) => t.textHi },
  },
  titleRow: { display: 'flex', alignItems: 'center', gap: 10 },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 24, color: ({ t }) => t.textHi },
  tabbar: {
    display: 'flex',
    gap: 2,
    borderBottom: ({ t }) => `1px solid ${t.line}`,
    padding: '0 24px',
    flexWrap: 'wrap',
  },
  tab: {
    fontFamily: fontMono,
    fontSize: 11.5,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    padding: '10px 16px',
    color: ({ t }) => t.textFaint,
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
  },
  tabActive: {
    color: ({ t }) => t.textHi,
    borderBottomColor: ({ t }) => t.amber,
  },
  tabBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 15,
    height: 15,
    padding: '0 4px',
    marginLeft: 6,
    borderRadius: 100,
    fontSize: 10,
    fontWeight: 700,
    backgroundColor: ({ t }) => t.bad,
    color: ({ t }) => t.bg,
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
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
    marginLeft: 6,
    backgroundColor: ({ t }) => t.amber,
    boxShadow: ({ t }) => `0 0 0 3px ${t.amberSoft}`,
    animation: '$tabPulse 1.6s ease-in-out infinite',
  },
  '@keyframes tabPulse': {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.4 },
  },
  body: { padding: '20px 24px 40px' },
}));

export function TowerPage() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const catalogApi = useApi(catalogApiRef);
  const [searchParams, setSearchParams] = useSearchParams();
  const entityRef = searchParams.get('entity');
  const tabParam = (searchParams.get('tab') as TabId | null) ?? 'overview';
  const isDashboardView = searchParams.get('view') === 'dashboard';

  const [entity, setEntity] = useState<Entity | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!entityRef) {
      setEntity(undefined);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    catalogApi
      .getEntityByRef(entityRef)
      .then(e => {
        if (!cancelled) {
          setEntity(e);
          setLoading(false);
        }
      })
      .catch(e => {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entityRef, catalogApi]);

  const appName = entity?.metadata.annotations?.['github.com/project-slug']?.split('/')[1] ?? entity?.metadata.name;
  const { recentCount } = useAppNotifications(appName);

  const selectApp = (ref: string) => setSearchParams({ entity: ref, tab: 'overview' });
  const clearApp = () => setSearchParams({});
  const selectTab = (id: TabId) => setSearchParams({ entity: entityRef ?? '', tab: id });
  const openDashboard = () => setSearchParams({ view: 'dashboard' });

  let body: JSX.Element;
  if (isDashboardView) {
    body = <TowerDashboardPage onBack={clearApp} />;
  } else if (!entityRef) {
    body = (
      <div style={{ padding: '48px 24px' }}>
        <AppPicker onSelect={selectApp} onOpenDashboard={openDashboard} />
      </div>
    );
  } else if (loading) {
    body = <Progress />;
  } else if (error) {
    body = (
      <div style={{ padding: 24 }}>
        <ResponseErrorPanel error={new Error(error)} />
      </div>
    );
  } else if (!entity) {
    body = (
      <div style={{ padding: 24 }}>
        <Typography>Application not found.</Typography>
      </div>
    );
  } else {
    body = (
      <TowerAppShell
        entity={entity}
        entityRef={entityRef}
        tabParam={tabParam}
        clearApp={clearApp}
        selectTab={selectTab}
        recentCount={recentCount}
        classes={classes}
      />
    );
  }

  return <div className={classes.root}>{body}</div>;
}

// Split out from TowerPage so its two activity-signal hooks
// (useTektonPipelineRuns/useTowerEnvironments) can actually run -
// useTowerEnvironments calls useEntity() internally, which only resolves
// inside an EntityProvider, and EntityProvider itself only ever gets
// rendered once the entity has loaded (see TowerPage's own branches above).
function TowerAppShell({
  entity,
  entityRef,
  tabParam,
  clearApp,
  selectTab,
  recentCount,
  classes,
}: {
  entity: Entity;
  entityRef: string;
  tabParam: TabId;
  clearApp: () => void;
  selectTab: (id: TabId) => void;
  recentCount: number;
  classes: ReturnType<typeof useStyles>;
}) {
  return (
    <EntityProvider entity={entity}>
      <TowerAppShellInner
        entity={entity}
        entityRef={entityRef}
        tabParam={tabParam}
        clearApp={clearApp}
        selectTab={selectTab}
        recentCount={recentCount}
        classes={classes}
      />
    </EntityProvider>
  );
}

function TowerAppShellInner({
  entity,
  entityRef,
  tabParam,
  clearApp,
  selectTab,
  recentCount,
  classes,
}: {
  entity: Entity;
  entityRef: string;
  tabParam: TabId;
  clearApp: () => void;
  selectTab: (id: TabId) => void;
  recentCount: number;
  classes: ReturnType<typeof useStyles>;
}) {
  const appName = entity.metadata.annotations?.['github.com/project-slug']?.split('/')[1] ?? entity.metadata.name;
  // Polls independently of which tab is actually open (2026-09-11: "some
  // kind of message or notification that there's CICD activity... maybe the
  // tab glows when you're not on it") - PipelinesTab's own identical hook
  // only ever runs while that tab is the one mounted (see the `key` on the
  // ErrorBoundary below), so a lightweight instance has to live up here
  // instead for the tab bar itself to know about it.
  const ciPipelineRuns = useTektonPipelineRuns(appName);
  const ciActive = ciPipelineRuns.runs.some(r => r.phase === 'running');
  // Real canary activity, cheap and GitHub-free (useTowerEnvironments hits
  // only this app's own Kubernetes clusters, already live-polled regardless
  // of which tab is open - unlike PR/ArgoCD-status data, which is
  // deliberately fetch-on-demand only, see useReleaseContext's own comment
  // on the real GitHub rate-limit incident that decision came from).
  // 2026-09-16: now that Pipelines and Deployments are two separate tabs
  // (HANDOFF-tower-cicd-redesign.md), each gets its OWN dot instead of one
  // shared "something's happening in CI/CD" glow - a running pipeline no
  // longer lights up the Deployments tab you're not looking at, and vice
  // versa, now that there's a real place for each signal to point to.
  const { environments } = useTowerEnvironments();
  const cdActive = environments.some(isRolloutActive);

  const activeTab = TABS.find(tabDef => tabDef.id === tabParam) ?? TABS[0];
  const { Component } = activeTab;
  return (
    <>
      <div className={classes.header}>
        <div>
          <button className={classes.backLink} onClick={clearApp} type="button">
            ← All applications
          </button>
          <div className={classes.titleRow}>
            <HangarMark glyph="tower" size={22} />
            <Typography className={classes.title}>{entity.metadata.title ?? entity.metadata.name}</Typography>
          </div>
        </div>
      </div>
      <div className={classes.tabbar}>
        {TABS.map(tabDef => (
          <button
            key={tabDef.id}
            type="button"
            className={`${classes.tab} ${tabParam === tabDef.id ? classes.tabActive : ''}`}
            onClick={() => selectTab(tabDef.id)}
          >
            {tabDef.label}
            {tabDef.id === 'notifications' && recentCount > 0 && (
              <span className={classes.tabBadge}>{recentCount > 9 ? '9+' : recentCount}</span>
            )}
            {/* Shown regardless of whether this tab is currently focused
                (2026-09-12 bug: "it should display this dot even when
                focused on that CICD tab") - it's a live activity signal, not
                an unread/unseen marker that should clear once you've looked. */}
            {tabDef.id === 'pipelines' && ciActive && (
              <span className={classes.tabActivityDot} title="A pipeline is running" />
            )}
            {tabDef.id === 'deployments' && cdActive && (
              <span className={classes.tabActivityDot} title="A rollout is in progress" />
            )}
          </button>
        ))}
      </div>
      <div className={classes.body}>
        <ErrorBoundary key={`${entityRef}:${tabParam}`}>
          <Component />
        </ErrorBoundary>
      </div>
    </>
  );
}
