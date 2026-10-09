import Typography from '@material-ui/core/Typography';
import { usePrometheusInstantQuery } from '../usePrometheusQuery';
import { useHangarTokens } from '../brand/tokens';
import { Button, Chip } from '../ui';
import { useUi } from '../ui/styles';
import { catalogCheck, type CheckContext } from './analysisCatalog';
import { useStyles } from './styles';

type Data = 'checking' | 'found' | 'none' | 'unreachable' | 'unknown';
const TONE: Record<Data, 'ok' | 'neutral' | 'bad'> = {
  found: 'ok',
  checking: 'neutral',
  unknown: 'neutral',
  none: 'bad',
  unreachable: 'bad',
};
const LABEL: Record<Data, string> = {
  found: 'data found',
  checking: 'checking',
  unknown: 'not checked',
  none: 'no data yet',
  unreachable: 'cannot check',
};

function CheckRow({
  name,
  ctx,
  cluster,
  inUse,
  onAdd,
}: {
  name: string;
  ctx: CheckContext;
  cluster: string;
  inUse: boolean;
  onAdd: (name: string) => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const ui = useUi({ t });
  const known = catalogCheck(name);
  const { loading, error, samples } = usePrometheusInstantQuery(known ? cluster : undefined, known?.dataQuery(ctx));
  let data: Data = known ? 'checking' : 'unknown';
  if (known && !loading) {
    if (error) data = 'unreachable';
    else data = samples.some(s => s.value > 0) ? 'found' : 'none';
  }
  // A catalog check with no data would pass every time (its query falls back to passing), so it is not offered until
  // the metric has data. A template outside the catalog is the team's own: Tower cannot tell what it needs.
  const canAdd = !inUse && (data === 'found' || data === 'unknown');
  const why: Record<Data, string> = {
    checking: 'Checking whether the metric has data…',
    found: 'The metric this check reads has data for this workload.',
    none: `No data for this workload on ${cluster}: it needs ${known?.needs}. Until that is scraped the check passes without looking at anything.`,
    unreachable: `Tower could not reach Prometheus on ${cluster}, so it cannot tell whether this check would see data.`,
    unknown: 'Not part of the airframe catalog, so Tower does not know which metric it reads. Check its args yourself.',
  };
  return (
    <div className={classes.row} style={{ alignItems: 'flex-start' }}>
      <Button small disabled={!canAdd} aria-label={`Add cluster check ${name}`} onClick={() => onAdd(name)}>
        {inUse ? 'Added' : '+ Add'}
      </Button>
      <div style={{ flex: 1 }}>
        <Typography className={classes.switchLabel}>
          {known ? `${known.title} ` : ''}
          <code>{name}</code>{' '}
          <span title={why[data]}>
            <Chip tone={TONE[data]}>{LABEL[data]}</Chip>
          </span>
        </Typography>
        {data !== 'found' && data !== 'checking' && <div className={ui.note}>{why[data]}</div>}
      </div>
    </div>
  );
}

/** One-click analysis steps from the cluster's ClusterAnalysisTemplates, each offered only when its metric has data. */
export function ClusterCheckPicker({
  templates,
  ctx,
  cluster,
  inUse,
  onAdd,
}: {
  /** The cluster's ClusterAnalysisTemplates, or undefined when Tower could not read them. */
  templates: string[] | undefined;
  ctx: CheckContext;
  cluster: string;
  /** Cluster templates some step already uses. */
  inUse: string[];
  onAdd: (name: string) => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const ui = useUi({ t });
  return (
    <div style={{ marginTop: 12 }}>
      <Typography className={classes.fieldLabel}>Cluster checks on {cluster}</Typography>
      <div className={ui.note} style={{ marginBottom: 6 }}>
        Adds an analysis step that runs the check against this environment ({ctx.namespace}, pods {ctx.app}-*). Put it
        after a weight step: a failing check aborts the rollout.
      </div>
      {templates === undefined && <div className={ui.note}>Tower could not read this cluster&apos;s templates.</div>}
      {templates?.length === 0 && <div className={ui.note}>This cluster has no cluster templates.</div>}
      <div className={classes.rowList}>
        {(templates ?? []).map(name => (
          <CheckRow key={name} name={name} ctx={ctx} cluster={cluster} inUse={inUse.includes(name)} onAdd={onAdd} />
        ))}
      </div>
    </div>
  );
}
