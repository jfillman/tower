import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import RefreshIcon from '@material-ui/icons/Refresh';
import { fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';

// A handful of Tower's data hooks (PR/deploy-history/provenance/GHCR - see
// useReleaseData.ts/usePullRequests.ts's own comments) are deliberately
// fetch-once, not polled, to avoid repeating a real prior GitHub rate-limit
// exhaustion incident. That left several tabs with literally no way to see
// fresh data short of leaving the app and coming back (2026-09-09 feedback,
// "some tabs aren't refreshing"). This button is the fix: one consistent,
// explicit, user-triggered re-fetch affordance, everywhere those hooks are
// used, rather than silent auto-polling.
const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: ({ t }) => t.textFaint,
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    '&:hover': { color: ({ t }) => t.sky },
  },
}));

export function RefreshButton({ onClick, label = 'Refresh' }: { onClick: () => void; label?: string }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  return (
    <button type="button" className={classes.btn} onClick={onClick} title="Re-fetch PR, deploy-history, and image data">
      <RefreshIcon style={{ fontSize: 14 }} />
      {label}
    </button>
  );
}
