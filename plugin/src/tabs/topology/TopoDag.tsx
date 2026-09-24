import type { KeyboardEvent, MouseEvent } from 'react';
import RouterIcon from '@material-ui/icons/Router';
import DeviceHubIcon from '@material-ui/icons/DeviceHub';
import LayersIcon from '@material-ui/icons/Layers';
import AppsIcon from '@material-ui/icons/Apps';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import { fontMono, type HangarTokens } from '../../../brand/tokens';
import { TallArrow, useSignalRailStyles } from '../../SignalRail';
import { health, type EnvironmentSummary } from '../../types';

// Item 2's DAG - the same real chain Tower's Topology tab has always shown
// (Route -> Service -> Workload -> Pods), now drawn with the exact rail/dot/
// connector visual language "Ground Control" (the Deployments tab) already
// established for a DAG, rather than the older flat icon-row EnvironmentTopology
// used to draw on its own. Reuses useSignalRailStyles directly (not a
// styles fork) so a Topology DAG node and a Deployments DAG node are
// pixel-identical - only the step set and their status source differ.

export type TopoStageKey = 'route' | 'service' | 'workload' | 'pods';
export type TopoStageStatus = 'good' | 'current' | 'bad' | 'pending';

export interface TopoStage {
  key: TopoStageKey;
  label: string;
  status: TopoStageStatus;
  meta: string;
}

export function buildTopoStages(env: EnvironmentSummary): TopoStage[] {
  const h = health(env);
  const readyPods = env.pods.filter(p => p.ready).length;
  const totalPods = env.pods.length;

  let workloadStatus: TopoStageStatus = 'pending';
  if (h === 'healthy') workloadStatus = 'good';
  else if (h === 'degraded') workloadStatus = 'bad';
  else if (h === 'progressing' || h === 'paused') workloadStatus = 'current';

  let podsStatus: TopoStageStatus = 'pending';
  if (totalPods > 0) {
    if (readyPods === totalPods) podsStatus = 'good';
    else if (readyPods > 0) podsStatus = 'current';
    else podsStatus = 'bad';
  }

  return [
    {
      key: 'route',
      label: 'Route',
      status: env.ingressUrl ? 'good' : 'pending',
      meta: env.ingressUrl ? env.ingressUrl.replace(/^https?:\/\//, '') : 'no route',
    },
    {
      key: 'service',
      label: 'Service',
      status: env.services.length > 0 ? 'good' : 'pending',
      meta: env.services.length > 0 ? `${env.services.length} service${env.services.length === 1 ? '' : 's'}` : 'no service',
    },
    {
      key: 'workload',
      label: 'Workload',
      status: env.workload ? workloadStatus : 'pending',
      meta: env.workload ? (env.strategy ?? env.workload.kind) : 'no workload',
    },
    {
      key: 'pods',
      label: 'Pods',
      status: podsStatus,
      meta: totalPods > 0 ? `${readyPods}/${totalPods} ready` : 'no pods',
    },
  ];
}

function dotStyle(t: HangarTokens, status: TopoStageStatus) {
  switch (status) {
    case 'good':
      return { backgroundColor: t.goodSoft, borderColor: t.good, color: t.good };
    case 'current':
      return { backgroundColor: t.amberSoft, borderColor: t.amber, color: t.amberInk };
    case 'bad':
      return { backgroundColor: t.badSoft, borderColor: t.bad, color: t.bad };
    default:
      return { backgroundColor: t.panelAlt, borderColor: t.line, color: t.textFaint };
  }
}

function StageIcon({ stageKey, status }: { stageKey: TopoStageKey; status: TopoStageStatus }) {
  if (status === 'bad') return <ErrorOutlineIcon fontSize="inherit" />;
  if (stageKey === 'route') return <RouterIcon fontSize="inherit" />;
  if (stageKey === 'service') return <DeviceHubIcon fontSize="inherit" />;
  if (stageKey === 'workload') return <LayersIcon fontSize="inherit" />;
  return <AppsIcon fontSize="inherit" />;
}

export function TopoDag({
  stages,
  selectedKey,
  onSelectKey,
  t,
}: {
  stages: TopoStage[];
  selectedKey: TopoStageKey | undefined;
  onSelectKey: (key: TopoStageKey) => void;
  t: HangarTokens;
}) {
  const classes = useSignalRailStyles({ t });
  return (
    <div className={classes.rail}>
      {stages.map((stage, i) => (
        <div key={stage.key} style={{ display: 'contents' }}>
          <div
            className={`${classes.node} ${classes.nodeClickable} ${stage.key === selectedKey ? classes.nodeSelected : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => onSelectKey(stage.key)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') onSelectKey(stage.key);
            }}
            onMouseDown={(e: MouseEvent) => e.preventDefault()}
          >
            <span className={`${classes.dot} ${stage.status === 'current' ? classes.dotCurrent : ''}`} style={dotStyle(t, stage.status)}>
              <StageIcon stageKey={stage.key} status={stage.status} />
            </span>
            <span className={classes.label}>{stage.label}</span>
            <span className={classes.meta} style={{ fontFamily: fontMono }}>
              {stage.meta}
            </span>
          </div>
          {i < stages.length - 1 && (
            <div className={classes.connector}>
              <span className={classes.connectorArrow} style={{ color: t.amber }}>
                <TallArrow size={18} />
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
