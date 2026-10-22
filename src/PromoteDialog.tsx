import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogActions from '@material-ui/core/DialogActions';
import Link from '@material-ui/core/Link';
import { fontMono, useHangarTokens, type HangarTokens } from './brand/tokens';
import { imageTag, type EnvironmentSummary } from './types';
import type { usePromote } from './useReleaseData';
import type { ReleaseNames } from './useReleaseNames';
import { Button, TextLink } from './ui';
import { useDialogSkin } from './ui/dialog';
import { PrReceipt } from './ui/PrRef';

// Ported from GlidepathPage.tsx's inline promote dialog - same tier-aware
// copy (direct commit for a lower-env target vs a real PR for an upper-env
// target, decided by glidepathPromote.ts on the backend), reusing the same
// /api/glidepath/promote route via useReleaseData.ts's usePromote(). Reskinned
// in Hangar tokens - previously the one PR-adjacent surface in Tower still on
// bare default MUI (`grep useHangarTokens` on this file came back empty),
// found while auditing every PR touchpoint for the pull-request integration
// pass. The confirm button borrows the same outlined-amber treatment as
// ReleaseCard's own Promote button, since this dialog is what that button
// opens.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  lead: { color: ({ t }) => t.textHi, marginBottom: 6 },
  text: { color: ({ t }) => t.textLo },
  error: { color: ({ t }) => t.bad, marginBottom: 6 },
  details: { color: ({ t }) => t.textFaint, fontSize: 12, '& summary': { cursor: 'pointer' } },
  detailsBody: { fontFamily: fontMono, fontSize: 11.5, marginTop: 6, maxHeight: 160, overflow: 'auto', overflowWrap: 'anywhere' },
  link: { fontFamily: fontMono, fontSize: 12.5, color: ({ t }) => t.sky },
}));

const mono = { fontFamily: fontMono };

export function PromoteDialog({
  target,
  onClose,
  promote,
  targetIsLower,
  onConfirm,
  names,
}: {
  // source is a real EnvironmentSummary when promoting an already-deployed
  // release forward, or just its image for a first deploy of a release
  // that's never been deployed anywhere (2026-09-16) - there's no
  // environment to describe in that case.
  target: { source: EnvironmentSummary | { image: string }; target: EnvironmentSummary } | null;
  onClose: () => void;
  promote: ReturnType<typeof usePromote>;
  targetIsLower: boolean;
  onConfirm: () => void;
  /** Release names: a build that already shipped to Flight is named; one that hasn't gets the next name there. */
  names?: ReleaseNames;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const d = useDialogSkin();
  const [, setSearchParams] = useSearchParams();
  const source = target && 'env' in target.source ? target.source : undefined;
  const sourceImage = target && !source ? (target.source as { image: string }).image : undefined;
  const appName = source?.appName ?? target?.target.appName ?? 'this app';
  const tag = imageTag(source ? source.image : sourceImage ?? '');
  const releaseName = names?.byTag.get(tag);

  // Same tab=deployments&env=<env> deep link OverviewTab's own goToEnv/
  // goToRollout use (2026-09-16: "when you promote to an env and the PR
  // dialogue box opens, it should provide a link to the deployment in the
  // deployment tab") - closes this dialog too, since staying open over a
  // freshly-switched tab would be confusing.
  const goToDeployment = () => {
    if (!target) return;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', 'deployments');
      next.set('env', target.target.env);
      return next;
    });
    onClose();
  };

  let confirmLabel = targetIsLower ? 'Commit and deploy' : 'Start release';
  if (promote.loading) confirmLabel = targetIsLower ? 'Deploying…' : 'Starting release…';

  return (
    <Dialog
      open={Boolean(target)}
      onClose={() => (promote.loading ? undefined : onClose())}
      PaperProps={{ className: d.paper }}
    >
      {target && (
        <>
          <DialogTitle className={d.title}>
            {source ? `Promote ${appName} to ${target.target.env}?` : `Deploy ${appName} to ${target.target.env}?`}
          </DialogTitle>
          <DialogContent>
            {!promote.result && !promote.error && (
              <>
                <DialogContentText className={classes.lead}>
                  {targetIsLower ? 'Deploys ' : 'Opens a release PR for '}
                  {releaseName && <b>{`${releaseName} `}</b>}
                  <span style={mono}>{tag}</span>
                  {source ? `, now in ${source.env}` : ', its first deploy'}
                  {targetIsLower ? `, to ${target.target.env} straight away.` : '.'}
                </DialogContentText>
                <DialogContentText className={classes.text}>
                  {targetIsLower
                    ? `${target.target.env} is a Ground environment, so there's no PR to review.`
                    : `${target.target.env} changes only when you merge the PR. This closes once the release run starts; the Releases tab follows it to the PR.`}
                  {!targetIsLower && !releaseName && names
                    ? ` Once it's healthy there, this build becomes the release ${names.next}.`
                    : ''}
                </DialogContentText>
              </>
            )}
            {promote.error && (
              <>
                <DialogContentText className={classes.error}>
                  {targetIsLower ? "Couldn't deploy." : "Couldn't start the release."}
                </DialogContentText>
                <details className={classes.details}>
                  <summary>Details</summary>
                  <div className={classes.detailsBody}>{promote.error}</div>
                </details>
              </>
            )}
            {promote.result?.mode === 'pr' && promote.result.prUrl && (
              <PrReceipt
                prUrl={promote.result.prUrl}
                alreadyOpen={promote.result.alreadyOpen}
                next="merge it to release; checks and any sign-off show on the PR."
              />
            )}
            {promote.result?.mode === 'direct-commit' && (
              <DialogContentText className={classes.text}>
                Committed - ArgoCD will sync it shortly:{' '}
                <Link className={classes.link} href={promote.result.commitUrl} target="_blank" rel="noopener noreferrer">
                  {promote.result.commitUrl}
                </Link>
              </DialogContentText>
            )}
          </DialogContent>
          <DialogActions>
            {!promote.result ? (
              <>
                <Button onClick={onClose} disabled={promote.loading}>
                  Cancel
                </Button>
                <Button variant="primary" disabled={promote.loading} onClick={onConfirm}>
                  {confirmLabel}
                </Button>
              </>
            ) : (
              <>
                <TextLink onClick={goToDeployment}>View deployment →</TextLink>
                <Button onClick={onClose}>Close</Button>
              </>
            )}
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
