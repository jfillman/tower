import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontDisplay, useHangarTokens, type HangarTokens } from '../brand/tokens';

// The Hangar skin for an MUI Dialog: a panel-coloured paper with the kit's 1px line and 6px radius, and a condensed
// title over a soft rule. PromoteDialog had it, CloudPromoteDialog and the Environments dialogs each grew a copy.
// Usage: <Dialog PaperProps={{ className: d.paper }}><DialogTitle className={d.title}>…
const useDialogSheet = makeStyles<Theme, { t: HangarTokens }>(() => ({
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
}));

export function useDialogSkin() {
  const t = useHangarTokens();
  return useDialogSheet({ t });
}
