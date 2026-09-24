import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';

// A static rendering of one entry from cicd.yaml's `pipelines` map - not
// PipelineDag.tsx, which is status-driven off a live Tekton PipelineRun's
// own task graph (a materially different data shape, real pass/fail/running
// state per node). cicd.yaml's `steps` is just an ordered flat array with no
// branching, so this borrows only PipelineDag's dot/connector visual
// language (the way SignalRail.tsx already does for a different purpose)
// rather than any of its layout code.

interface PipelineStepLike {
  stage?: string;
  name?: string;
  env?: string;
  cluster?: string;
  [key: string]: unknown;
}

function stepLabel(step: PipelineStepLike): string {
  const base = step.stage ?? step.name ?? 'step';
  return step.env ? `${base} → ${step.env}` : base;
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  name: { fontFamily: fontDisplay, fontSize: 12.5, fontWeight: 700, color: ({ t }) => t.textHi },
  row: { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  trigger: {
    fontFamily: fontMono,
    fontSize: 10,
    padding: '2px 8px',
    borderRadius: 10,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    color: ({ t }) => t.textLo,
  },
  connector: { width: 12, height: 1, backgroundColor: ({ t }) => t.line },
  chip: {
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: '3px 9px',
    borderRadius: 10,
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textHi,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
  },
}));

export function PipelineFlowPreview({
  name,
  pipeline,
}: {
  name: string;
  pipeline: { trigger?: unknown; steps?: PipelineStepLike[] } | PipelineStepLike[];
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const steps = Array.isArray(pipeline) ? pipeline : pipeline.steps ?? [];
  const trigger = Array.isArray(pipeline) ? undefined : pipeline.trigger;

  return (
    <div className={classes.wrap}>
      <span className={classes.name}>{name}</span>
      <div className={classes.row}>
        {trigger !== undefined && (
          <>
            <span className={classes.trigger}>
              {typeof trigger === 'string' ? trigger : JSON.stringify(trigger)}
            </span>
            {steps.length > 0 && <span className={classes.connector} />}
          </>
        )}
        {steps.map((step, i) => (
          <span key={i} style={{ display: 'contents' }}>
            <span className={classes.chip}>{stepLabel(step)}</span>
            {i < steps.length - 1 && <span className={classes.connector} />}
          </span>
        ))}
        {steps.length === 0 && trigger === undefined && (
          <span className={classes.trigger}>(no steps configured)</span>
        )}
      </div>
    </div>
  );
}
