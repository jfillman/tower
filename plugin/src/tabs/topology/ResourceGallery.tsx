import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Collapse from '@material-ui/core/Collapse';
import DescriptionIcon from '@material-ui/icons/Description';
import LockIcon from '@material-ui/icons/Lock';
import SettingsIcon from '@material-ui/icons/Settings';
import LayersIcon from '@material-ui/icons/Layers';
import DeviceHubIcon from '@material-ui/icons/DeviceHub';
import RouterIcon from '@material-ui/icons/Router';
import AppsIcon from '@material-ui/icons/Apps';
import TrendingUpIcon from '@material-ui/icons/TrendingUp';
import ScheduleIcon from '@material-ui/icons/Schedule';
import StorageIcon from '@material-ui/icons/Storage';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import FolderSpecialIcon from '@material-ui/icons/FolderSpecial';
import AccountBoxIcon from '@material-ui/icons/AccountBox';
import GavelIcon from '@material-ui/icons/Gavel';
import LinkIcon from '@material-ui/icons/Link';
import SecurityIcon from '@material-ui/icons/Security';
import VpnKeyIcon from '@material-ui/icons/VpnKey';
import ShowChartIcon from '@material-ui/icons/ShowChart';
import { fontMono, useHangarTokens, type HangarTokens } from '../../../brand/tokens';
import { preventFocusScroll } from '../../preventFocusScroll';
import { YamlView } from './YamlView';
import { RbacDetailView, RBAC_KINDS } from './RbacDetailView';
import { resourceKey } from '../../ResourceInspector';
import type { ArgoResourceNode, K8sResourceRef } from '../../types';

// Item 4's "surface all the remaining resources in a more graphical, useful
// way" - replaces the old plain <table> ResourceList with kind-grouped
// cards (an icon per kind, a real ArgoCD sync/health badge when this
// resource is one ArgoCD manages) and the new YamlView for anything
// clicked open, rather than the flat two-column list the Topology tab used
// to fall back on for "everything else."

const KIND_ICON: Record<string, JSX.Element> = {
  ConfigMap: <DescriptionIcon fontSize="inherit" />,
  Secret: <LockIcon fontSize="inherit" />,
  HorizontalPodAutoscaler: <TrendingUpIcon fontSize="inherit" />,
  PodDisruptionBudget: <SettingsIcon fontSize="inherit" />,
  ReplicaSet: <LayersIcon fontSize="inherit" />,
  Deployment: <LayersIcon fontSize="inherit" />,
  Rollout: <LayersIcon fontSize="inherit" />,
  StatefulSet: <LayersIcon fontSize="inherit" />,
  DaemonSet: <LayersIcon fontSize="inherit" />,
  Service: <DeviceHubIcon fontSize="inherit" />,
  Ingress: <RouterIcon fontSize="inherit" />,
  HTTPRoute: <RouterIcon fontSize="inherit" />,
  Pod: <AppsIcon fontSize="inherit" />,
  Job: <ScheduleIcon fontSize="inherit" />,
  CronJob: <ScheduleIcon fontSize="inherit" />,
  PersistentVolumeClaim: <StorageIcon fontSize="inherit" />,
  PersistentVolume: <StorageIcon fontSize="inherit" />,
  Namespace: <FolderSpecialIcon fontSize="inherit" />,
  ServiceAccount: <AccountBoxIcon fontSize="inherit" />,
  Role: <GavelIcon fontSize="inherit" />,
  RoleBinding: <GavelIcon fontSize="inherit" />,
  NetworkPolicy: <SecurityIcon fontSize="inherit" />,
  Endpoints: <LinkIcon fontSize="inherit" />,
  ExternalSecret: <VpnKeyIcon fontSize="inherit" />,
  ServiceMonitor: <ShowChartIcon fontSize="inherit" />,
};

function iconFor(kind: string): JSX.Element {
  return KIND_ICON[kind] ?? <HelpOutlineIcon fontSize="inherit" />;
}

function argoStatusFor(ref: K8sResourceRef, argoResources: ArgoResourceNode[] | undefined): ArgoResourceNode | undefined {
  return argoResources?.find(r => r.kind === ref.kind && r.name === ref.name);
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  toolbar: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' },
  search: {
    fontFamily: fontMono,
    fontSize: 11,
    padding: '5px 9px',
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    color: ({ t }) => t.textHi,
    flex: '0 1 220px',
  },
  count: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint },
  kindGroup: { marginBottom: 12 },
  kindHead: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, color: ({ t }) => t.textFaint },
  kindIcon: { display: 'flex', fontSize: 14 },
  kindLabel: { fontFamily: fontMono, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  kindCount: { fontFamily: fontMono, fontSize: 10, opacity: 0.7 },
  // auto-fit, not auto-fill - see StageDetail.tsx's serviceGrid comment for
  // why auto-fill leaves a lone item stranded in a narrow column instead of
  // stretching to fill the row.
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 },
  card: {
    textAlign: 'left',
    borderRadius: 7,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.panelAlt,
    padding: '8px 10px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    '&:hover': { backgroundColor: ({ t }) => t.bg },
  },
  cardSelected: { borderColor: ({ t }) => t.skyLine, backgroundColor: ({ t }) => t.skySoft },
  cardName: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textHi, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardBadges: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  badge: { fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8 },
  badgeOk: { backgroundColor: ({ t }) => t.goodSoft, color: ({ t }) => t.good },
  badgeWarn: { backgroundColor: ({ t }) => t.amberSoft, color: ({ t }) => t.amberInk },
  badgeBad: { backgroundColor: ({ t }) => t.badSoft, color: ({ t }) => t.bad },
  detail: { marginTop: 10, padding: '10px 12px', borderRadius: 8, border: ({ t }) => `1px dashed ${t.line}`, backgroundColor: ({ t }) => t.panel },
  none: { fontSize: 12, fontStyle: 'italic', color: ({ t }) => t.textFaint },
  detailModeRow: { display: 'flex', gap: 6, marginBottom: 10 },
  detailModeBtn: {
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: '3px 9px',
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.line}`,
    background: 'none',
    color: ({ t }) => t.textFaint,
    cursor: 'pointer',
  },
  detailModeBtnActive: { color: ({ t }) => t.sky, borderColor: ({ t }) => t.skyLine, backgroundColor: ({ t }) => t.skySoft },
}));

function isRbacKind(kind: string): boolean {
  return (RBAC_KINDS as readonly string[]).includes(kind);
}

function badgeClass(classes: ReturnType<typeof useStyles>, status: string | undefined): string {
  if (status === 'Healthy' || status === 'Synced') return classes.badgeOk;
  if (status === 'Progressing' || status === 'OutOfSync') return classes.badgeWarn;
  if (status === 'Degraded' || status === 'Missing') return classes.badgeBad;
  return classes.badgeWarn;
}

export function ResourceGallery({ resources, argoResources }: { resources: K8sResourceRef[]; argoResources?: ArgoResourceNode[] }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const filtered = resources.filter(r => {
    if (!query) return true;
    const q = query.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.kind.toLowerCase().includes(q);
  });

  const byKind = new Map<string, K8sResourceRef[]>();
  filtered.forEach(r => {
    const list = byKind.get(r.kind) ?? [];
    list.push(r);
    byKind.set(r.kind, list);
  });
  const kinds = [...byKind.keys()].sort();
  const selected = selectedKey ? resources.find(r => resourceKey(r) === selectedKey) : undefined;

  const [detailMode, setDetailMode] = useState<'friendly' | 'yaml'>('friendly');
  useEffect(() => {
    setDetailMode('friendly');
  }, [selectedKey]);

  return (
    <div>
      <div className={classes.toolbar}>
        <input className={classes.search} placeholder="filter by name or kind…" value={query} onChange={e => setQuery(e.target.value)} />
        <span className={classes.count}>{filtered.length} of {resources.length} resources</span>
      </div>
      {kinds.length === 0 && <Typography className={classes.none}>No resources match "{query}".</Typography>}
      {kinds.map(kind => {
        const items = byKind.get(kind) ?? [];
        return (
          <div key={kind} className={classes.kindGroup}>
            <div className={classes.kindHead}>
              <span className={classes.kindIcon}>{iconFor(kind)}</span>
              <span className={classes.kindLabel}>{kind}</span>
              <span className={classes.kindCount}>({items.length})</span>
            </div>
            <div className={classes.cardGrid}>
              {items.map(r => {
                const key = resourceKey(r);
                const argo = argoStatusFor(r, argoResources);
                const isSelected = selectedKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`${classes.card} ${isSelected ? classes.cardSelected : ''}`}
                    onMouseDown={preventFocusScroll}
                    onClick={() => setSelectedKey(isSelected ? null : key)}
                  >
                    <span className={classes.cardName} title={r.name}>{r.name}</span>
                    {argo && (
                      <span className={classes.cardBadges}>
                        {argo.syncStatus && <span className={`${classes.badge} ${badgeClass(classes, argo.syncStatus)}`}>{argo.syncStatus}</span>}
                        {argo.health && <span className={`${classes.badge} ${badgeClass(classes, argo.health)}`}>{argo.health}</span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <Collapse in={Boolean(selected)} unmountOnExit>
        {selected && (
          <div className={classes.detail}>
            {isRbacKind(selected.kind) ? (
              <>
                <div className={classes.detailModeRow}>
                  <button
                    type="button"
                    className={`${classes.detailModeBtn} ${detailMode === 'friendly' ? classes.detailModeBtnActive : ''}`}
                    onMouseDown={preventFocusScroll}
                    onClick={() => setDetailMode('friendly')}
                  >
                    Overview
                  </button>
                  <button
                    type="button"
                    className={`${classes.detailModeBtn} ${detailMode === 'yaml' ? classes.detailModeBtnActive : ''}`}
                    onMouseDown={preventFocusScroll}
                    onClick={() => setDetailMode('yaml')}
                  >
                    YAML
                  </button>
                </div>
                {detailMode === 'friendly' ? (
                  <RbacDetailView resource={selected} related={resources.filter(r => isRbacKind(r.kind))} />
                ) : (
                  <YamlView resource={selected} />
                )}
              </>
            ) : (
              <YamlView resource={selected} />
            )}
          </div>
        )}
      </Collapse>
    </div>
  );
}
