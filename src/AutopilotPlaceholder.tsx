import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { useEntity } from '@backstage/plugin-catalog-react';
import { fontDisplay, useHangarTokens, type HangarTokens } from './brand/tokens';

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { maxWidth: 560, margin: '0 auto', padding: '48px 24px' },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 24, color: ({ t }) => t.textHi, marginBottom: 8 },
  body: { fontSize: 14, color: ({ t }) => t.textLo, lineHeight: 1.6 },
}));

// Stand-in for the AI workload tabs. AI workloads open in the same service window
// as everything else, with the tabs their class grants (Pull Requests, plus this).
// Their own tabs (runs, Clearance policy, planner) are not built yet; they join
// the registry in TowerPage the same way.
export function AutopilotPlaceholder() {
  const { entity } = useEntity();
  const t = useHangarTokens();
  const classes = useStyles({ t });
  return (
    <div className={classes.wrap}>
      <Typography className={classes.title}>{entity.metadata.title ?? entity.metadata.name}</Typography>
      <Typography className={classes.body}>
        This is an AI workload. Its runs, Clearance policy and planner are not built into Tower yet.
      </Typography>
    </div>
  );
}
