import { useEffect, useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Collapse from '@material-ui/core/Collapse';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { NamespaceEvents } from './NamespaceEvents';
import { preventFocusScroll } from './preventFocusScroll';
import { useNamespaceResource } from './useNamespaceResource';
import { useClusterRbac } from './useClusterRbac';
import { TopoDag, buildTopoStages, type TopoStageKey } from './tabs/topology/TopoDag';
import { TopologyStageDetail } from './tabs/topology/StageDetail';
import { ResourceGallery } from './tabs/topology/ResourceGallery';
import { ENV_TIER_LABEL, health, type EnvironmentSummary, type EnvTier, type Health } from './types';

// The single-environment topology view Ground Control's own DAG/detail
// pattern established on the Deployments tab (2026-09-17 Topology
// modernization) - a real chain-of-custody view (Route -> Service ->
// Workload -> Pods) for exactly one environment at a time, matched to the
// TopologyTab's own env-picker-driven selection rather than the older
// "every env stacked in one long page" layout. Every field here already
// flows through useTowerEnvironments via useReleaseContext - no new fetch
// for the flow itself; Events/Logs/Metrics/YAML are the real per-click
// fetches, same as before.

const STATUS_COLOR: Record<Health, keyof HangarTokens> = {
  healthy: 'good',
  progressing: 'amber',
  paused: 'sky',
  degraded: 'bad',
  unknown: 'textFaint',
};
const STATUS_SOFT: Record<Health, keyof HangarTokens> = {
  healthy: 'goodSoft',
  progressing: 'amberSoft',
  paused: 'skySoft',
  degraded: 'badSoft',
  unknown: 'panelAlt',
};
const HEALTH_LABEL: Record<Health, string> = {
  healthy: 'Healthy',
  progressing: 'Scaling',
  paused: 'Paused',
  degraded: 'Degraded',
  unknown: 'Unknown',
};
const TIER_ACCENT: Record<EnvTier, keyof HangarTokens> = { preview: 'textFaint', lower: 'sky', upper: 'amber' };
const TIER_CHIP_COLOR: Record<EnvTier, keyof HangarTokens> = { preview: 'textFaint', lower: 'sky', upper: 'amber' };
const TIER_CHIP_SOFT: Record<EnvTier, keyof HangarTokens> = { preview: 'panelAlt', lower: 'skySoft', upper: 'amberSoft' };

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { display: 'flex', flexDirection: 'column', gap: 14 },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
    padding: '4px 2px',
    borderLeft: '5px solid',
    paddingLeft: 14,
  },
  headLeft: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  envName: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 17, textTransform: 'lowercase', color: ({ t }) => t.textHi },
  tierDot: { width: 6, height: 6, borderRadius: '50%', display: 'inline-block', marginRight: 5 },
  tierChip: { fontFamily: fontMono, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 8px', borderRadius: 3, display: 'inline-flex', alignItems: 'center' },
  clusterNote: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint },
  routeLink: { display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.sky, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
  pill: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100 },
  dot: { width: 6, height: 6, borderRadius: '50%', display: 'inline-block' },
  dagCard: { backgroundColor: ({ t }) => t.panel, border: ({ t }) => `1px solid ${t.line}`, borderRadius: 10, display: 'flex', flexDirection: 'column' },
  dagInner: { padding: '10px 12px 4px' },
  dagDivider: { border: 'none', borderTop: ({ t }) => `1px solid ${t.lineSoft}`, margin: 0 },
  stageDetailInner: { padding: '16px 18px' },
  panel: { backgroundColor: ({ t }) => t.panel, border: ({ t }) => `1px solid ${t.line}`, borderRadius: 8, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 },
  panelTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14, color: ({ t }) => t.textHi },
  toolbar: { display: 'flex', gap: 8 },
  toolbarBtn: {
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: '0.02em',
    padding: '5px 11px',
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.line}`,
    background: 'none',
    color: ({ t }) => t.textLo,
    cursor: 'pointer',
    '&:hover': { backgroundColor: ({ t }) => t.panelAlt },
  },
  toolbarBtnActive: { color: ({ t }) => t.sky, borderColor: ({ t }) => t.skyLine, backgroundColor: ({ t }) => t.skySoft },
}));

export function EnvironmentTopology({ env, tier }: { env: EnvironmentSummary; tier: EnvTier }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const h = health(env);
  const stages = buildTopoStages(env);

  const [selectedStage, setSelectedStage] = useState<TopoStageKey>('workload');
  // Reset to the workload stage whenever the selected environment itself
  // changes (TopologyTab's own env-picker click) - keeping the previous
  // env's selected stage would silently show e.g. "Pods" detail for an env
  // that was never clicked into.
  useEffect(() => {
    setSelectedStage('workload');
  }, [env.key]);

  const [showResources, setShowResources] = useState(false);
  const [showEvents, setShowEvents] = useState(false);

  // The Namespace object itself, fetched separately (see
  // useNamespaceResource's own comment on why it can't join the bulk
  // fetch) and prepended to the gallery's resource list only - not folded
  // into env.resources itself, which every other consumer (PodsPanel,
  // StageDetail) reads and has no use for a namespace-kind entry.
  const namespaceResource = useNamespaceResource(env.cluster, env.namespace);

  // ClusterRole/ClusterRoleBinding, same "gallery-only" treatment - see
  // useClusterRbac's own comment on why they need a separate fetch. Any
  // already-fetched RoleBinding whose roleRef points at a ClusterRole
  // (common: binding a shared ClusterRole's rules within just this one
  // namespace) needs that ClusterRole resolvable too, so its name is
  // passed in alongside whatever ClusterRoleBindings turn out relevant.
  const referencedClusterRoleNames = useMemo(
    () =>
      env.resources
        .filter(r => r.kind === 'RoleBinding')
        .map(r => (r.raw as { roleRef?: { kind?: string; name?: string } })?.roleRef)
        .filter((ref): ref is { kind: string; name: string } => ref?.kind === 'ClusterRole' && Boolean(ref.name))
        .map(ref => ref.name),
    [env.resources],
  );
  const { clusterRoleBindings, clusterRoles } = useClusterRbac(env.cluster, env.namespace, referencedClusterRoleNames);

  const galleryResources = useMemo(
    () => [
      ...(namespaceResource ? [namespaceResource] : []),
      ...clusterRoleBindings,
      ...clusterRoles,
      ...env.resources,
    ],
    [namespaceResource, clusterRoleBindings, clusterRoles, env.resources],
  );

  return (
    <div className={classes.wrap}>
      <div className={classes.head} style={{ borderLeftColor: t[TIER_ACCENT[tier]] as string }}>
        <div className={classes.headLeft}>
          <span className={classes.envName}>{env.env}</span>
          <span className={classes.tierChip} style={{ backgroundColor: t[TIER_CHIP_SOFT[tier]] as string, color: t[TIER_CHIP_COLOR[tier]] as string }}>
            <span className={classes.tierDot} style={{ backgroundColor: t[TIER_CHIP_COLOR[tier]] as string }} />
            {ENV_TIER_LABEL[tier]}
          </span>
          <span className={classes.clusterNote}>{env.namespace} on {env.cluster}</span>
          {env.ingressUrl && (
            <a className={classes.routeLink} href={env.ingressUrl} target="_blank" rel="noopener noreferrer">
              {env.ingressUrl.replace(/^https?:\/\//, '')} <OpenInNewIcon style={{ fontSize: 12 }} />
            </a>
          )}
        </div>
        <span className={classes.pill} style={{ backgroundColor: t[STATUS_SOFT[h]] as string, color: t[STATUS_COLOR[h]] as string }}>
          <span className={classes.dot} style={{ backgroundColor: t[STATUS_COLOR[h]] as string }} />
          {HEALTH_LABEL[h]}
        </span>
      </div>

      <div className={classes.dagCard}>
        <div className={classes.dagInner}>
          <TopoDag stages={stages} selectedKey={selectedStage} onSelectKey={setSelectedStage} t={t} />
        </div>
        <hr className={classes.dagDivider} />
        <div className={classes.stageDetailInner}>
          <TopologyStageDetail env={env} selectedKey={selectedStage} />
        </div>
      </div>

      <div>
        <div className={classes.toolbar}>
          <button type="button" className={`${classes.toolbarBtn} ${showResources ? classes.toolbarBtnActive : ''}`} onMouseDown={preventFocusScroll} onClick={() => setShowResources(v => !v)}>
            All resources ({galleryResources.length})
          </button>
          <button type="button" className={`${classes.toolbarBtn} ${showEvents ? classes.toolbarBtnActive : ''}`} onMouseDown={preventFocusScroll} onClick={() => setShowEvents(v => !v)}>
            Events
          </button>
        </div>
        <Collapse in={showResources} unmountOnExit>
          <div className={classes.panel} style={{ marginTop: 10 }}>
            <Typography className={classes.panelTitle}>All resources in {env.namespace}</Typography>
            <ResourceGallery resources={galleryResources} argoResources={env.argoResources} />
          </div>
        </Collapse>
        <Collapse in={showEvents} unmountOnExit>
          <div className={classes.panel} style={{ marginTop: 10 }}>
            <NamespaceEvents cluster={env.cluster} namespace={env.namespace} />
          </div>
        </Collapse>
      </div>
    </div>
  );
}
