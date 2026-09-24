import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  panel: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px dashed ${t.line}`,
    borderRadius: 5,
    padding: '40px 24px',
    textAlign: 'center',
  },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: ({ t }) => t.textFaint,
    marginBottom: 8,
  },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 18, color: ({ t }) => t.textHi, marginBottom: 6 },
  body: { fontSize: 13.5, color: ({ t }) => t.textLo, maxWidth: 480, margin: '0 auto' },
}));

// Rollout is incremental (see HANDOFF-tower-module.md) - Releases and Pull
// Requests ship first, real; every other tab in the confirmed bar renders
// honestly as not-yet-built rather than faking data, same posture
// GlidepathPage.tsx's own Readiness sub-tab took for a signal with no real
// source ("honest placeholder, no data source exists").
export function ComingSoonTab({ title, body }: { title: string; body: string }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  return (
    <div className={classes.panel}>
      <Typography className={classes.eyebrow}>Coming soon</Typography>
      <Typography className={classes.title}>{title}</Typography>
      <Typography className={classes.body}>{body}</Typography>
    </div>
  );
}
