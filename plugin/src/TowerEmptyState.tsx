import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { HangarMark, type HangarGlyph } from '../brand/HangarMark';

// A Tower-branded stand-in for Backstage's own generic <EmptyState> (plain
// icon + title, no relation to this console's own look) - every tab that
// genuinely has nothing to show yet (no SLOs declared, no GHCR image found,
// no notifications, no live workloads) was falling back to that default,
// which reads as a broken/unstyled page dropped into an otherwise fully
// Hangar-skinned console (2026-09-22 bug report: "replace it with a tower
// centric default page that includes the Hangar/Tower logos"). Same
// title/description shape every caller already had - this only changes how
// it's dressed.
const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 14,
    padding: '64px 24px',
    maxWidth: 460,
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  markWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
    borderRadius: '50%',
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    marginBottom: 4,
  },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: ({ t }) => t.textFaint,
  },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 16, color: ({ t }) => t.textHi },
  description: { fontSize: 12.5, color: ({ t }) => t.textLo, lineHeight: 1.5 },
}));

export function TowerEmptyState({
  title,
  description,
  glyph = 'tower',
}: {
  title: string;
  description?: string;
  glyph?: HangarGlyph;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  return (
    <div className={classes.wrap}>
      <div className={classes.markWrap}>
        <HangarMark glyph={glyph} size={30} />
      </div>
      <span className={classes.eyebrow}>Hangar · Tower</span>
      <Typography className={classes.title}>{title}</Typography>
      {description && <Typography className={classes.description}>{description}</Typography>}
    </div>
  );
}
