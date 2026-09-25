import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogActions from '@material-ui/core/DialogActions';
import Button from '@material-ui/core/Button';
import Link from '@material-ui/core/Link';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';

// Shown over the Config tab when an "Open PR" submit finishes (2026-09-24
// bug: the inline PR link sat far down a long form and the page jumped to the
// top when the submit button unmounted, losing the link). Same treatment as
// PromoteDialog: a modal that keeps the PR link in front of the user until
// they dismiss it. Dismissing only clears the submit state (reset()); the
// form is left as submitted.
const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  paper: {
    backgroundColor: ({ t }) => t.panel,
    backgroundImage: 'none',
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6,
  },
  title: { fontFamily: fontDisplay, fontWeight: 700, color: ({ t }) => t.textHi, borderBottom: ({ t }) => `1px solid ${t.lineSoft}` },
  text: { color: ({ t }) => t.textLo },
  error: { color: ({ t }) => t.bad },
  link: { fontFamily: fontMono, fontSize: 12.5, color: ({ t }) => t.sky, wordBreak: 'break-all' },
  closeBtn: { color: ({ t }) => t.textLo },
  openBtn: { borderColor: ({ t }) => t.amberLine, color: ({ t }) => t.amberInk },
}));

export function PrResultDialog({
  result,
  error,
  onClose,
}: {
  result?: { prUrl: string; alreadyOpen?: boolean };
  error?: string;
  onClose: () => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  return (
    <Dialog open={Boolean(result || error)} onClose={onClose} PaperProps={{ className: classes.paper }}>
      <DialogTitle className={classes.title}>{error ? "Couldn't open PR" : 'Pull request'}</DialogTitle>
      <DialogContent>
        {error ? (
          <DialogContentText className={classes.error}>{error}</DialogContentText>
        ) : (
          <DialogContentText className={classes.text}>
            {result?.alreadyOpen ? 'A PR for this exact change is already open:' : 'PR opened:'}
            <br />
            <Link className={classes.link} href={result?.prUrl} target="_blank" rel="noopener noreferrer">
              {result?.prUrl}
            </Link>
          </DialogContentText>
        )}
      </DialogContent>
      <DialogActions>
        <Button className={classes.closeBtn} onClick={onClose}>
          Close
        </Button>
        {result && (
          <Button variant="outlined" className={classes.openBtn} href={result.prUrl} target="_blank" rel="noopener noreferrer">
            View PR ↗
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
