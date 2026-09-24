import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogActions from '@material-ui/core/DialogActions';
import Button from '@material-ui/core/Button';
import Link from '@material-ui/core/Link';
import { Progress } from '@backstage/core-components';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { imageTag, type EnvironmentSummary } from './types';
import type { usePromote } from './useReleaseData';

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
  paper: {
    backgroundColor: ({ t }) => t.panel,
    backgroundImage: 'none',
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6,
  },
  title: {
    fontFamily: fontDisplay,
    fontWeight: 700,
    color: ({ t }) => t.textHi,
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
  },
  text: { color: ({ t }) => t.textLo },
  error: { color: ({ t }) => t.bad },
  link: { fontFamily: fontMono, fontSize: 12.5, color: ({ t }) => t.sky },
  cancelBtn: { color: ({ t }) => t.textLo },
  confirmBtn: {
    borderColor: ({ t }) => t.amberLine,
    color: ({ t }) => t.amberInk,
  },
}));

const mono = { fontFamily: fontMono };

export function PromoteDialog({
  target,
  onClose,
  promote,
  targetIsLower,
  onConfirm,
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
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [, setSearchParams] = useSearchParams();
  const source = target && 'env' in target.source ? target.source : undefined;
  const sourceImage = target && !source ? (target.source as { image: string }).image : undefined;
  const appName = source?.appName ?? target?.target.appName ?? 'this app';

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

  return (
    <Dialog
      open={Boolean(target)}
      onClose={() => (promote.loading ? undefined : onClose())}
      PaperProps={{ className: classes.paper }}
    >
      {target && (
        <>
          <DialogTitle className={classes.title}>
            {source ? `Promote ${appName} to ${target.target.env}?` : `Deploy ${appName} to ${target.target.env}?`}
          </DialogTitle>
          <DialogContent>
            {!promote.result && !promote.error && (
              <DialogContentText className={classes.text}>
                {targetIsLower ? (
                  <>
                    Commits directly to{' '}
                    <span style={mono}>
                      {appName}/platform/envs/{target.target.env}.yaml
                    </span>{' '}
                    - no PR, no review. ArgoCD syncs it as soon as this commit lands.
                  </>
                ) : (
                  <>
                    Opens a real PR against{' '}
                    <span style={mono}>gitops-{appName}</span> bumping{' '}
                    <span style={mono}>
                      {target.target.cluster}/{target.target.env}/values.yaml
                    </span>
                    . ArgoCD won't sync anything until that PR is reviewed and merged.
                  </>
                )}{' '}
                {source ? (
                  <>
                    Image: <span style={mono}>{imageTag(source.image)}</span> - currently promoted to{' '}
                    {source.env}.
                  </>
                ) : (
                  <>
                    Image: <span style={mono}>{imageTag(sourceImage)}</span> - not yet deployed anywhere.
                    This is its first deploy.
                  </>
                )}
              </DialogContentText>
            )}
            {promote.loading && <Progress />}
            {promote.error && (
              <DialogContentText className={classes.error} style={{ fontStyle: 'italic' }}>
                Couldn't promote: {promote.error}
              </DialogContentText>
            )}
            {promote.result?.mode === 'pr' && (
              <DialogContentText className={classes.text}>
                {promote.result.alreadyOpen
                  ? 'A release PR for this promotion is already open:'
                  : 'Release PR opened:'}{' '}
                <Link className={classes.link} href={promote.result.prUrl} target="_blank" rel="noopener noreferrer">
                  {promote.result.prUrl}
                </Link>
              </DialogContentText>
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
                <Button className={classes.cancelBtn} onClick={onClose} disabled={promote.loading}>
                  Cancel
                </Button>
                <Button
                  variant="outlined"
                  className={classes.confirmBtn}
                  disabled={promote.loading}
                  onClick={onConfirm}
                >
                  {targetIsLower ? 'Commit and deploy' : 'Open release PR'}
                </Button>
              </>
            ) : (
              <>
                <Button className={classes.cancelBtn} onClick={onClose}>
                  Close
                </Button>
                <Button variant="outlined" className={classes.confirmBtn} onClick={goToDeployment}>
                  View deployment →
                </Button>
              </>
            )}
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
