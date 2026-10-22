import { useEffect, useRef } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontMono, useHangarTokens, type HangarTokens } from './brand/tokens';
import { PrReceipt } from './ui/PrRef';
import { useReleaseRunStatus } from './useReleaseData';
import type { ReleaseRunStatus } from './types';
import { Callout, IconButton, TextLink } from './ui';

// Promote to a Flight environment used to hold its dialog open for up to 90 s while the backend waited for the
// release run to open its PR (2026-10-22: "the dialog sits for a very long time"). The dialog now closes as soon as
// the run exists and this strip, at the top of the Releases tab, follows the run (GET /release-run every 4 s) and
// turns into the PR's receipt when open-release-pr reports it. Sky while it moves; amber is not used here, because
// nothing waits on a person until the PR exists.

export interface TrackedRelease {
  run: string;
  env: string;
  /** The release name, else the image tag. */
  label: string;
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  steps: { display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(0, 1fr)', gap: 6, marginTop: 10 },
  step: { display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 },
  bar: { height: 4, borderRadius: 2 },
  stepName: { fontFamily: fontMono, fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  receiptRow: { display: 'flex', alignItems: 'flex-start', gap: 8 },
  receipt: { flex: 1, minWidth: 0 },
}));

function barColour(t: HangarTokens, s: ReleaseRunStatus['tasks'][number]['state']): string {
  if (s === 'done') return t.good;
  if (s === 'running') return t.sky;
  if (s === 'failed') return t.bad;
  return t.line;
}

export function ReleaseRunTracker({
  appName,
  release,
  onPr,
  onDismiss,
  onOpenRun,
}: {
  appName: string;
  release: TrackedRelease;
  /** Once, when the PR appears: the tab re-reads its PRs so the release card shows it too. */
  onPr: () => void;
  onDismiss: () => void;
  onOpenRun: (run: string) => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const status = useReleaseRunStatus(appName, release.run);
  const data = status.data;
  const told = useRef(false);

  useEffect(() => {
    if (data?.state === 'pr' && !told.current) {
      told.current = true;
      onPr();
    }
  }, [data?.state, onPr]);

  const runLink = <TextLink onClick={() => onOpenRun(release.run)}>Pipelines →</TextLink>;
  const dismiss = (
    <IconButton aria-label="Dismiss" title="Dismiss" onClick={onDismiss}>
      ×
    </IconButton>
  );

  if (data?.state === 'pr' && data.prUrl) {
    return (
      <div className={classes.receiptRow} data-testid="release-run-tracker">
        <PrReceipt
          className={classes.receipt}
          prUrl={data.prUrl}
          title={`Release: ${appName} to ${release.env} · ${release.label}`}
          next="checks finish and, where the release mode asks for it, someone signs off; then merge it."
        />
        {dismiss}
      </div>
    );
  }

  if (data?.state === 'failed') {
    return (
      <Callout
        tone="bad"
        label="Release run"
        title={`${release.label} → ${release.env}: no PR`}
        actions={
          <>
            {runLink}
            {dismiss}
          </>
        }
      >
        {data.reason}
      </Callout>
    );
  }

  return (
    <Callout
      tone="info"
      label="Release run"
      title={`Release PR for ${release.label} → ${release.env} on its way`}
      actions={
        <>
          {runLink}
          {status.gaveUp && dismiss}
        </>
      }
    >
      <span data-testid="release-run-tracker">
        {status.gaveUp
          ? 'Still no PR after 15 minutes; the Pipelines tab has the run.'
          : 'You can leave this page: the PR also shows in Pull requests when it opens.'}
        {status.error && !data ? ` Couldn't read the run yet (${status.error}); trying again.` : ''}
      </span>
      {data && data.tasks.length > 0 && (
        <div className={classes.steps} aria-label="Release run progress">
          {data.tasks.map(task => (
            <div key={task.name} className={classes.step} title={`${task.name}: ${task.state}`}>
              <span className={classes.bar} style={{ backgroundColor: barColour(t, task.state) }} />
              <span className={classes.stepName} style={{ color: task.state === 'pending' ? t.textFaint : t.textHi }}>
                {task.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </Callout>
  );
}
