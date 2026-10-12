import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import RouterIcon from '@material-ui/icons/Router';
import DeviceHubIcon from '@material-ui/icons/DeviceHub';
import LayersIcon from '@material-ui/icons/Layers';
import AppsIcon from '@material-ui/icons/Apps';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import { fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { preventFocusScroll } from '../../preventFocusScroll';
import { CanaryRampChart } from '../../CanaryRampChart';
import { YamlView } from './YamlView';
import { MetricsPanel } from './MetricsPanel';
import { PodsPanel } from './PodsPanel';
import { BreakglassEnvironmentCard } from './BreakglassEnvironmentView';
import type { TopoStageKey } from './TopoDag';
import type { EnvironmentSummary, EnvTier, K8sResourceRef } from '../../types';
import { EmptyNote, Fact, SectionTitle, TextLink } from '../../ui';

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
  body: { display: 'flex', flexDirection: 'column', gap: 14 },
  bigCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '16px 18px',
    borderRadius: 4,
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
    borderRadius: 4,
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
  strategyGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px 20px' },
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
        <SectionTitle level={2}>Route</SectionTitle>
      </div>
      <div className={classes.bigCard}>
        <span className={classes.bigIcon} style={{ backgroundColor: env.ingressUrl ? t.skySoft : t.panelAlt, color: env.ingressUrl ? t.sky : t.textFaint }}>
          <RouterIcon fontSize="inherit" />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {env.ingressUrl ? (
            <TextLink href={env.ingressUrl}>
              {env.ingressUrl} <OpenInNewIcon style={{ fontSize: 14 }} />
            </TextLink>
          ) : (
            <EmptyNote>No external route configured for this environment.</EmptyNote>
          )}
          {routeResource && <span className={classes.meta}>{routeResource.kind} · {routeResource.name}</span>}
        </div>
      </div>
      {routeResource && (
        <>
          <TextLink expanded={showYaml} onClick={() => setShowYaml(v => !v)}>
            Route YAML
          </TextLink>
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
        <SectionTitle level={2}>Service</SectionTitle>
      </div>
      {env.services.length === 0 ? (
        <EmptyNote>No Service resolved for this environment.</EmptyNote>
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
              <TextLink expanded={showYaml} onClick={() => setShowYaml(v => !v)}>
                Service YAML
              </TextLink>
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
        <SectionTitle level={2}>{workload ? `${workload.kind} — ${workload.name}` : 'Workload'}</SectionTitle>
      </div>
      {!workload ? (
        <EmptyNote>No Rollout or Deployment found for this environment.</EmptyNote>
      ) : (
        <>
          <div className={classes.strategyGrid}>
            <Fact label="Strategy">{env.strategy ?? '—'}</Fact>
            <Fact label="Replicas">{env.availableReplicas ?? '—'} / {env.desiredReplicas ?? '—'}</Fact>
            <Fact label="CPU request / limit">{env.cpuRequest ?? '—'} / {env.cpuLimit ?? '—'}</Fact>
            <Fact label="Memory request / limit">{env.memoryRequest ?? '—'} / {env.memoryLimit ?? '—'}</Fact>
            {workload.canaryServices && (
              <Fact label="Canary / Stable service">{workload.canaryServices.canary ?? '—'} / {workload.canaryServices.stable ?? '—'}</Fact>
            )}
            {workload.blueGreen && (
              <>
                <Fact label="Active / Preview service">{workload.blueGreen.activeService ?? '—'} / {workload.blueGreen.previewService ?? '—'}</Fact>
                <Fact label="Auto-promote">{autoPromoteLabel(workload.blueGreen)}</Fact>
              </>
            )}
            {workload.hpa && (
              <Fact label="HPA (min / max / target CPU)">{workload.hpa.minReplicas ?? '—'} / {workload.hpa.maxReplicas ?? '—'} / {workload.hpa.targetCpuUtilization !== undefined ? `${workload.hpa.targetCpuUtilization}%` : '—'}</Fact>
            )}
            {workload.pdb && (
              <Fact label="PDB (min avail / max unavail)">{workload.pdb.minAvailable ?? '—'} / {workload.pdb.maxUnavailable ?? '—'}
                  {workload.pdb.disruptionsAllowed !== undefined ? ` · ${workload.pdb.disruptionsAllowed} disruption${workload.pdb.disruptionsAllowed === 1 ? '' : 's'} allowed` : ''}</Fact>
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
              <div>
                <TextLink expanded={showYaml} onClick={() => setShowYaml(v => !v)}>
                  Workload YAML
                </TextLink>
              </div>
              {showYaml && <YamlView resource={workloadResource} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

function PodsDetail({
  env,
  tier,
  classes,
  linkedSessionId,
}: {
  env: EnvironmentSummary;
  tier: EnvTier;
  classes: ReturnType<typeof useStyles>;
  linkedSessionId?: string;
}) {
  return (
    <div className={classes.body}>
      <div className={classes.head}>
        <span className={classes.headIcon}><AppsIcon fontSize="small" /></span>
        <SectionTitle level={2}>Pods</SectionTitle>
      </div>
      <PodsPanel env={env} tier={tier} linkedSessionId={linkedSessionId} />
      {/* The environment's break-glass sessions outlive their pods (a live session recycles its pod; a copy is
          deleted), so they live here, under Pods, not only inside one pod's Debug panel (gap G1). */}
      <BreakglassEnvironmentCard env={env} tier={tier} linkedSessionId={linkedSessionId} />
    </div>
  );
}

export function TopologyStageDetail({
  env,
  tier,
  selectedKey,
  linkedSessionId,
}: {
  env: EnvironmentSummary;
  tier: EnvTier;
  selectedKey: TopoStageKey;
  /** A break-glass session a deep link named (?breakglass=<id>): opened and highlighted under Pods. */
  linkedSessionId?: string;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });

  if (selectedKey === 'route') return <RouteDetail env={env} classes={classes} t={t} />;
  if (selectedKey === 'service') return <ServiceDetail env={env} classes={classes} />;
  if (selectedKey === 'workload') return <WorkloadDetail env={env} classes={classes} />;
  return <PodsDetail env={env} tier={tier} classes={classes} linkedSessionId={linkedSessionId} />;
}
