import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogActions from '@material-ui/core/DialogActions';
import Link from '@material-ui/core/Link';
import { Progress } from '@backstage/core-components';
import { fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { imageTag } from '../../types';
import { useSubmitPin } from '../../environments/releasePins';
import { Button } from '../../ui';

// Promote for a cloud target (glidepath ADR-0020): a Flight environment deploys only its pinned image, so promoting
// opens a pull request on the app's own repo changing glidepath/releases/<env>.yaml - the same request the Deployments
// tab's Flight panel makes. A Ground environment of a cloud app deploys on every push and has nothing to promote.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  text: { color: ({ t }) => t.textLo, lineHeight: 1.6 },
  mono: { fontFamily: fontMono, fontSize: 12.5, color: ({ t }) => t.textHi },
  bad: { color: ({ t }) => t.bad },
}));

export interface CloudPromoteTarget {
  /** The full image reference (registry/repo:tag) to pin. */
  image: string;
  /** The environment it is promoted from, recorded in the pin. */
  from?: string;
  env: string;
  /** False for a Ground environment, which has no pin. */
  flight: boolean;
}

export function CloudPromoteDialog({
  owner,
  appName,
  target,
  onClose,
  onDone,
}: {
  owner?: string;
  appName?: string;
  target: CloudPromoteTarget | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const submit = useSubmitPin();
  const close = () => {
    if (submit.loading) return;
    submit.reset();
    onClose();
  };
  const path = target ? `glidepath/releases/${target.env}.yaml` : '';
  return (
    <Dialog open={target !== null} onClose={close} maxWidth="sm" fullWidth>
      {target && (
        <>
          <DialogTitle>{target.flight ? `Promote ${appName} to ${target.env}?` : `${target.env} deploys on push`}</DialogTitle>
          <DialogContent>
            {!target.flight && (
              <DialogContentText className={c.text}>
                {target.env} is a Ground environment of a cloud service: the pipeline&apos;s deploy stage updates it on every
                push, so there is nothing to promote. Only Flight environments take a pinned image.
              </DialogContentText>
            )}
            {target.flight && !submit.result && !submit.error && (
              <DialogContentText className={c.text}>
                Opens a pull request on <span className={c.mono}>{owner}/{appName}</span> pinning{' '}
                <span className={c.mono}>{path}</span> to <span className={c.mono}>{imageTag(target.image)}</span>
                {target.from ? <> (from {target.from})</> : null}. Merging it is the approval; Glidepath then deploys exactly
                that image&apos;s digest.
              </DialogContentText>
            )}
            {submit.loading && <Progress />}
            {submit.result && (
              <DialogContentText className={c.text}>
                {submit.result.unchanged ? (
                  <>
                    {target.env} is already pinned to <span className={c.mono}>{imageTag(target.image)}</span>: nothing to do.
                  </>
                ) : (
                  <>
                    {submit.result.alreadyOpen ? 'The pin PR was already open; it now pins this image: ' : 'Pull request opened: '}
                    <Link href={submit.result.prUrl} target="_blank" rel="noopener noreferrer" className={c.mono}>
                      {submit.result.prUrl}
                    </Link>
                  </>
                )}
              </DialogContentText>
            )}
            {submit.error && <DialogContentText className={c.bad}>Couldn&apos;t promote: {submit.error}</DialogContentText>}
          </DialogContent>
          <DialogActions>
            <Button onClick={close} disabled={submit.loading}>
              {submit.result || !target.flight ? 'Close' : 'Cancel'}
            </Button>
            {target.flight && !submit.result && (
              <Button
                variant="primary"
                disabled={submit.loading || !owner || !appName}
                onClick={async () => {
                  const r = await submit.submit({ owner: owner as string, appName: appName as string, env: target.env, image: target.image, promotedFrom: target.from });
                  if (r) onDone();
                }}
              >
                Open pin PR
              </Button>
            )}
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
