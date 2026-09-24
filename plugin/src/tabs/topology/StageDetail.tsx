import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import RouterIcon from '@material-ui/icons/Router';
import DeviceHubIcon from '@material-ui/icons/DeviceHub';
import LayersIcon from '@material-ui/icons/Layers';
import AppsIcon from '@material-ui/icons/Apps';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../../../brand/tokens';
import { preventFocusScroll } from '../../preventFocusScroll';
import { CanaryRampChart } from '../../CanaryRampChart';
import { YamlView } from './YamlView';
import { MetricsPanel } from './MetricsPanel';
import { PodsPanel } from './PodsPanel';
import type { TopoStageKey } from './TopoDag';
import type { EnvironmentSummary, K8sResourceRef } from '../../types';

// The per-stage detail panel the DAG drives (item 3: "each stage in the DAG
// shows details in the attached details section below... be more
// graphical"). Same click-drives-detail relationship as the Deployments
// tab's own StageDetail, just against the 4 static topology stages instead
// of a CD delivery's steps.

function findResource(resources: K8sResourceRef[], kind: string, name: string): K8sResourceRef | undefined {
  return resources.find(r => r.kind === kind && r.name === name);
}

function autoPromoteLabel(blueGreen: NonNullable<EnvironmentSummary['workload']>['blueGreen']): string {
  if (blueGreen?.autoPromotionEnabled === undefined) return '—';
  if (blueGreen.autoPromotionEnabled) return 'yes';
  return `no · ${blueGreen.scaleDownDelaySeconds ?? '?'}s scale-down delay`;
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  head: { display: 'flex', alignItems: 'center', gap: 9 },
  headIcon: { display: 'flex', color: ({ t }) => t.sky, flexShrink: 0 },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14.5, color: ({ t }) => t.textHi },
  note: { fontSize: 12.5, fontStyle: 'italic', color: ({ t }) => t.textLo },
  body: { display: 'flex', flexDirection: 'column', gap: 14 },
  bigCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '16px 18px',
    borderRadius: 10,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
  },
  bigIcon: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 22,
    flexShrink: 0,
  },
  bigLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 14,
    color: ({ t }) => t.sky,
    textDecoration: 'none',
    '&:hover': { textDecoration: 'underline' },
  },
  meta: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint },
  // auto-fit (not auto-fill): with few items and a wide container, auto-fill
  // still lays out as many empty minmax(220px,1fr) tracks as fit, so a
  // single real item only ever occupies the first narrow track instead of
  // stretching - that's what squashed the Service panel down to a ~250px
  // column on an otherwise-empty row (2026-09-17 bug report). auto-fit
  // collapses the empty tracks so real items actually share the full width.
  serviceGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 },
  serviceCard: {
    textAlign: 'left',
    borderRadius: 8,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.panelAlt,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    cursor: 'pointer',
    '&:hover': { backgroundColor: ({ t }) => t.bg },
  },
  serviceCardSelected: { borderColor: ({ t }) => t.skyLine, backgroundColor: ({ t }) => t.skySoft },
  serviceName: { fontFamily: fontMono, fontWeight: 700, fontSize: 12, color: ({ t }) => t.textHi },
  serviceMeta: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint },
  fullWidthDetail: { marginTop: 4 },
  yamlBtn: {
    alignSelf: 'flex-start',
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.sky,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
  },
  strategyGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px 20px' },
  kv: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  kvLabel: { fontFamily: fontMono, fontSize: 10, lineHeight: 1.4, textTransform: 'uppercase', letterSpacing: '0.04em', color: ({ t }) => t.textFaint },
  kvValue: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textHi },
  stepsList: { display: 'flex', flexDirection: 'column', gap: 4 },
  stepRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 },
  stepIndex: { fontFamily: fontMono, fontSize: 10, color: ({ t }) => t.textFaint, width: 18, flexShrink: 0 },
}));

function RouteDetail({ env, classes, t }: { env: EnvironmentSummary; classes: ReturnType<typeof useStyles>; t: HangarTokens }) {
  const routeResource = findResource(env.resources, 'HTTPRoute', env.appName ?? '') ?? env.resources.find(r => r.kind === 'HTTPRoute' || r.kind === 'Ingress');
  const [showYaml, setShowYaml] = useState(false);
  return (
    <div className={classes.body}>
      <div className={classes.head}>
        <span className={classes.headIcon}><RouterIcon fontSize="small" /></span>
        <Typography className={classes.title}>Route</Typography>
      </div>
      <div className={classes.bigCard}>
        <span className={classes.bigIcon} style={{ backgroundColor: env.ingressUrl ? t.skySoft : t.panelAlt, color: env.ingressUrl ? t.sky : t.textFaint }}>
          <RouterIcon fontSize="inherit" />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {env.ingressUrl ? (
            <a className={classes.bigLink} href={env.ingressUrl} target="_blank" rel="noopener noreferrer">
              {env.ingressUrl} <OpenInNewIcon style={{ fontSize: 14 }} />
            </a>
          ) : (
            <Typography className={classes.note}>No external route configured for this environment.</Typography>
          )}
          {routeResource && <span className={classes.meta}>{routeResource.kind} · {routeResource.name}</span>}
        </div>
      </div>
      {routeResource && (
        <>
          <button type="button" className={classes.yamlBtn} onMouseDown={preventFocusScroll} onClick={() => setShowYaml(v => !v)}>
            {showYaml ? '▾ hide YAML' : '▸ view route YAML'}
          </button>
          {showYaml && <YamlView resource={routeResource} />}
        </>
      )}
    </div>
  );
}

function ServiceDetail({ env, classes }: { env: EnvironmentSummary; classes: ReturnType<typeof useStyles> }) {
  const [selected, setSelected] = useState<string | null>(env.services.length === 1 ? env.services[0].name : null);
  // Separate from `selected` (which service's YAML would show) - defaults
  // closed even when a single service is auto-selected, so this stage
  // matches Route/Workload's own "▸ view … YAML" toggle instead of the
  // YAML panel just appearing open with no visible way to have opened it
  // (2026-09-17 bug report: "stuck in the open position... no 'view service
  // YAML' link"). Reset whenever the selected service itself changes, so
  // switching services doesn't carry the previous one's YAML open.
  const [showYaml, setShowYaml] = useState(false);
  const selectedResource = selected ? findResource(env.resources, 'Service', selected) : undefined;

  return (
    <div className={classes.body}>
      <div className={classes.head}>
        <span className={classes.headIcon}><DeviceHubIcon fontSize="small" /></span>
        <Typography className={classes.title}>Service</Typography>
      </div>
      {env.services.length === 0 ? (
        <Typography className={classes.note}>No Service resolved for this environment.</Typography>
      ) : (
        <>
          <div className={classes.serviceGrid}>
            {env.services.map(svc => {
              const isSelected = selected === svc.name;
              return (
                <button
                  key={svc.name}
                  type="button"
                  className={`${classes.serviceCard} ${isSelected ? classes.serviceCardSelected : ''}`}
                  onMouseDown={preventFocusScroll}
                  onClick={() => {
                    setSelected(isSelected ? null : svc.name);
                    setShowYaml(false);
                  }}
                >
                  <span className={classes.serviceName}>{svc.name}</span>
                  <span className={classes.serviceMeta}>{svc.type ?? 'ClusterIP'} · {svc.clusterIP ?? '—'}</span>
                  <span className={classes.serviceMeta}>
                    {svc.ports.length ? svc.ports.map(p => `${p.port}${p.targetPort ? `→${p.targetPort}` : ''}/${p.protocol ?? 'TCP'}`).join(', ') : 'no ports'}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Rendered below the grid, full-width - nesting YamlView inside a
              grid card constrained it to that card's own column width,
              which squashed the YAML/search/copy row into an unreadably
              narrow box (2026-09-17 bug report). */}
          {selectedResource && (
            <>
              <button type="button" className={classes.yamlBtn} onMouseDown={preventFocusScroll} onClick={() => setShowYaml(v => !v)}>
                {showYaml ? '▾ hide YAML' : '▸ view service YAML'}
              </button>
              {showYaml && (
                <div className={classes.fullWidthDetail}>
                  <YamlView resource={selectedResource} />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function WorkloadDetail({ env, classes }: { env: EnvironmentSummary; classes: ReturnType<typeof useStyles> }) {
  const [showYaml, setShowYaml] = useState(false);
  const workload = env.workload;
  const workloadResource = workload ? findResource(env.resources, workload.kind, workload.name) : undefined;
  const podNames = env.pods.map(p => p.name);

  return (
    <div className={classes.body}>
      <div className={classes.head}>
        <span className={classes.headIcon}><LayersIcon fontSize="small" /></span>
        <Typography className={classes.title}>{workload ? `${workload.kind} — ${workload.name}` : 'Workload'}</Typography>
      </div>
      {!workload ? (
        <Typography className={classes.note}>No Rollout or Deployment found for this environment.</Typography>
      ) : (
        <>
          <div className={classes.strategyGrid}>
            <div className={classes.kv}>
              <span className={classes.kvLabel}>Strategy</span>
              <span className={classes.kvValue}>{env.strategy ?? '—'}</span>
            </div>
            <div className={classes.kv}>
              <span className={classes.kvLabel}>Replicas</span>
              <span className={classes.kvValue}>{env.availableReplicas ?? '—'} / {env.desiredReplicas ?? '—'}</span>
            </div>
            <div className={classes.kv}>
              <span className={classes.kvLabel}>CPU request / limit</span>
              <span className={classes.kvValue}>{env.cpuRequest ?? '—'} / {env.cpuLimit ?? '—'}</span>
            </div>
            <div className={classes.kv}>
              <span className={classes.kvLabel}>Memory request / limit</span>
              <span className={classes.kvValue}>{env.memoryRequest ?? '—'} / {env.memoryLimit ?? '—'}</span>
            </div>
            {workload.canaryServices && (
              <div className={classes.kv}>
                <span className={classes.kvLabel}>Canary / Stable service</span>
                <span className={classes.kvValue}>{workload.canaryServices.canary ?? '—'} / {workload.canaryServices.stable ?? '—'}</span>
              </div>
            )}
            {workload.blueGreen && (
              <>
                <div className={classes.kv}>
                  <span className={classes.kvLabel}>Active / Preview service</span>
                  <span className={classes.kvValue}>{workload.blueGreen.activeService ?? '—'} / {workload.blueGreen.previewService ?? '—'}</span>
                </div>
                <div className={classes.kv}>
                  <span className={classes.kvLabel}>Auto-promote</span>
                  <span className={classes.kvValue}>{autoPromoteLabel(workload.blueGreen)}</span>
                </div>
              </>
            )}
            {workload.hpa && (
              <div className={classes.kv}>
                <span className={classes.kvLabel}>HPA (min / max / target CPU)</span>
                <span className={classes.kvValue}>
                  {workload.hpa.minReplicas ?? '—'} / {workload.hpa.maxReplicas ?? '—'} / {workload.hpa.targetCpuUtilization !== undefined ? `${workload.hpa.targetCpuUtilization}%` : '—'}
                </span>
              </div>
            )}
            {workload.pdb && (
              <div className={classes.kv}>
                <span className={classes.kvLabel}>PDB (min avail / max unavail)</span>
                <span className={classes.kvValue}>
                  {workload.pdb.minAvailable ?? '—'} / {workload.pdb.maxUnavailable ?? '—'}
                  {workload.pdb.disruptionsAllowed !== undefined ? ` · ${workload.pdb.disruptionsAllowed} disruption${workload.pdb.disruptionsAllowed === 1 ? '' : 's'} allowed` : ''}
                </span>
              </div>
            )}
          </div>

          {workload.canaryProgress ? (
            <CanaryRampChart
              cluster={env.cluster}
              namespace={env.namespace}
              rolloutName={workload.name}
              podHash={workload.currentPodHash}
              progress={workload.canaryProgress}
            />
          ) : (
            workload.canarySteps &&
            workload.canarySteps.length > 0 && (
              <div className={classes.stepsList}>
                {workload.canarySteps.map((step, i) => (
                  <div key={i} className={classes.stepRow}>
                    <span className={classes.stepIndex}>{i + 1}</span>
                    <span>{step.label}</span>
                  </div>
                ))}
              </div>
            )
          )}

          <MetricsPanel cluster={env.cluster} namespace={env.namespace} podNames={podNames} title="Workload performance" />

          {workloadResource && (
            <>
              <button type="button" className={classes.yamlBtn} onMouseDown={preventFocusScroll} onClick={() => setShowYaml(v => !v)}>
                {showYaml ? '▾ hide YAML' : '▸ view workload YAML'}
              </button>
              {showYaml && <YamlView resource={workloadResource} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

function PodsDetail({ env, classes }: { env: EnvironmentSummary; classes: ReturnType<typeof useStyles> }) {
  return (
    <div className={classes.body}>
      <div className={classes.head}>
        <span className={classes.headIcon}><AppsIcon fontSize="small" /></span>
        <Typography className={classes.title}>Pods</Typography>
      </div>
      <PodsPanel env={env} />
    </div>
  );
}

export function TopologyStageDetail({ env, selectedKey }: { env: EnvironmentSummary; selectedKey: TopoStageKey }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });

  if (selectedKey === 'route') return <RouteDetail env={env} classes={classes} t={t} />;
  if (selectedKey === 'service') return <ServiceDetail env={env} classes={classes} />;
  if (selectedKey === 'workload') return <WorkloadDetail env={env} classes={classes} />;
  return <PodsDetail env={env} classes={classes} />;
}
