import Switch from '@material-ui/core/Switch';
import Typography from '@material-ui/core/Typography';
import { usePrometheusInstantQuery } from '../usePrometheusQuery';
import { useHangarTokens } from '../brand/tokens';
import { Chip } from '../ui';
import { useUi } from '../ui/styles';
import { presetOn, SLO_PRESETS, SLO_PRESETS_NOTE, togglePreset, type SloContext, type SloPreset } from './sloCatalog';
import { useStyles } from './styles';

type Data = 'checking' | 'found' | 'none' | 'unreachable';
const TONE: Record<Data, 'ok' | 'neutral' | 'bad'> = { found: 'ok', checking: 'neutral', none: 'bad', unreachable: 'bad' };

function PresetRow({
  preset,
  ctx,
  cluster,
  text,
  onChange,
}: {
  preset: SloPreset;
  ctx: SloContext;
  cluster: string;
  text: string;
  onChange: (text: string) => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const ui = useUi({ t });
  const { loading, error, samples } = usePrometheusInstantQuery(cluster, preset.dataQuery(ctx));
  let data: Data = 'checking';
  if (!loading) {
    if (error) data = 'unreachable';
    else data = samples.some(s => s.value > 0) ? 'found' : 'none';
  }
  const on = presetOn(text, preset, ctx);
  const editable = togglePreset(text, preset, ctx, !on) !== undefined;
  // Turning one OFF is always allowed; turning one ON needs data behind it, or an SLO would report nothing.
  const canToggle = editable && (on || data === 'found');
  const why: Record<Data, string> = {
    checking: 'Checking whether the metric has data…',
    found: 'The metric has data for this workload.',
    none: `No data yet for this workload on ${cluster}: the pods have not reported these probes, so the SLO would show nothing.`,
    unreachable: `Tower could not reach Prometheus on ${cluster}, so it cannot tell whether there is data.`,
  };
  return (
    <div className={classes.row} style={{ alignItems: 'flex-start' }}>
      <Switch
        checked={on}
        disabled={!canToggle}
        inputProps={{ 'aria-label': `SLO ${preset.title}` }}
        onChange={e => {
          const next = togglePreset(text, preset, ctx, e.target.checked);
          if (next !== undefined) onChange(next);
        }}
      />
      <div style={{ flex: 1 }}>
        <Typography className={classes.switchLabel}>
          {preset.title}{' '}
          <span title={why[data]}>
            <Chip tone={TONE[data]}>
              {{ checking: 'checking', found: 'data found', none: 'no data yet', unreachable: 'cannot check' }[data]}
            </Chip>
          </span>
        </Typography>
        <div className={ui.note}>{preset.description}</div>
        {data !== 'found' && data !== 'checking' && !on && <div className={ui.note}>{why[data]}</div>}
        {!editable && <div className={ui.problem}>The YAML below is not a list, so this cannot edit it. Fix it first.</div>}
      </div>
    </div>
  );
}

/** The common-SLO toggles above the raw `slos:` YAML. Each toggle edits that YAML (so what it writes is visible below it). */
export function SloPresets({
  ctx,
  cluster,
  text,
  onChange,
}: {
  ctx: SloContext;
  cluster: string;
  text: string;
  onChange: (text: string) => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const ui = useUi({ t });
  return (
    <div style={{ marginBottom: 14 }}>
      <Typography className={classes.fieldLabel}>Common SLOs</Typography>
      <div className={ui.note} style={{ marginBottom: 6 }}>
        Turn one on and its entry is added to the YAML below; turn it off and only that entry is removed. {SLO_PRESETS_NOTE}
      </div>
      <div className={classes.rowList}>
        {SLO_PRESETS.map(p => (
          <PresetRow key={p.id} preset={p} ctx={ctx} cluster={cluster} text={text} onChange={onChange} />
        ))}
      </div>
    </div>
  );
}
