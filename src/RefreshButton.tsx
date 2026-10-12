import { useEffect, useRef, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import CheckIcon from '@material-ui/icons/Check';
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
// Feedback (2026-10-11: "the refresh button should respond in some way when you click on it"): the re-fetch is often
// quiet (the data may not change), so the button itself answers: the icon turns and it says Refreshing… for at least
// SPIN_MS, then Refreshed for DONE_MS, and it does not take a second click meanwhile. `busy` (when the caller knows
// its own loading state) keeps it turning until the fetch is back.
const SPIN_MS = 900;
const DONE_MS = 1500;

const useStyles = makeStyles(() => ({
  '@keyframes refreshSpin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
  spin: { animation: '$refreshSpin 0.8s linear infinite' },
}));

export function RefreshButton({ onClick, label = 'Refresh', busy }: { onClick: () => void; label?: string; busy?: boolean }) {
  const classes = useStyles();
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'done'>('idle');
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(id => window.clearTimeout(id)), []);
  useEffect(() => {
    if (phase === 'spinning' && !busy) {
      const id = window.setTimeout(() => {
        setPhase('done');
        timers.current.push(window.setTimeout(() => setPhase('idle'), DONE_MS));
      }, SPIN_MS);
      timers.current.push(id);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [phase, busy]);
  const spinning = phase === 'spinning' || Boolean(busy);
  let text = label;
  if (label && spinning) text = 'Refreshing…';
  else if (label && phase === 'done') text = 'Refreshed';
  return (
    <Button
      small
      disabled={spinning}
      aria-live="polite"
      onClick={() => {
        setPhase('spinning');
        onClick();
      }}
      title="Re-fetch PR, deploy-history, and image data"
    >
      {phase === 'done' && !spinning ? (
        <CheckIcon style={{ fontSize: 14 }} aria-hidden />
      ) : (
        <RefreshIcon style={{ fontSize: 14 }} className={spinning ? classes.spin : undefined} aria-hidden />
      )}
      {text}
    </Button>
  );
}
