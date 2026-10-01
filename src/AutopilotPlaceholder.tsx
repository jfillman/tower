import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import type { Entity } from '@backstage/catalog-model';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from './brand/tokens';

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { maxWidth: 560, margin: '0 auto', padding: '48px 24px' },
  back: {
    fontFamily: fontMono,
    fontSize: 11.5,
    letterSpacing: '0.04em',
    color: ({ t }) => t.textFaint,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: 0,
    marginBottom: 16,
    '&:hover': { color: ({ t }) => t.textHi },
  },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 24, color: ({ t }) => t.textHi, marginBottom: 8 },
  body: { fontSize: 14, color: ({ t }) => t.textLo, lineHeight: 1.6 },
}));

// Stand-in for the Autopilot plugin's agent pane. AI workloads show up on
// the Tower home and can be selected, but the pane that manages them lives
// in the separate Autopilot plugin, which is not built yet. Replace this
// with the plugin's entry point when it exists.
export function AutopilotPlaceholder({ entity, onBack }: { entity: Entity; onBack: () => void }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  return (
    <div className={classes.wrap}>
      <button type="button" className={classes.back} onClick={onBack}>
        ← All services
      </button>
      <Typography className={classes.title}>{entity.metadata.title ?? entity.metadata.name}</Typography>
      <Typography className={classes.body}>
        This is an AI workload. Its runs, Clearance policy and planner are managed by the Autopilot plugin, which is not
        installed in this Tower yet.
      </Typography>
    </div>
  );
}
