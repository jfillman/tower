import RefreshIcon from '@material-ui/icons/Refresh';
import { Button } from './ui';

// A handful of Tower's data hooks (PR/deploy-history/provenance/GHCR - see
// useReleaseData.ts/usePullRequests.ts's own comments) are deliberately
// fetch-once, not polled, to avoid repeating a real prior GitHub rate-limit
// exhaustion incident. That left several tabs with literally no way to see
// fresh data short of leaving the app and coming back (2026-09-09 feedback,
// "some tabs aren't refreshing"). This button is the fix: one consistent,
// explicit, user-triggered re-fetch affordance, everywhere those hooks are
// used, rather than silent auto-polling. It is an action, so it is a kit Button.
export function RefreshButton({ onClick, label = 'Refresh' }: { onClick: () => void; label?: string }) {
  return (
    <Button small onClick={onClick} title="Re-fetch PR, deploy-history, and image data" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <RefreshIcon style={{ fontSize: 14 }} aria-hidden />
      {label}
    </Button>
  );
}
