import { makeStyles } from '@material-ui/core/styles';
import { fontDisplay, useHangarTokens } from '../brand/tokens.esm.js';

const useDialogSheet = makeStyles(() => ({
  paper: {
    backgroundColor: ({ t }) => t.panel,
    backgroundImage: "none",
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6
  },
  title: {
    fontFamily: fontDisplay,
    fontWeight: 700,
    color: ({ t }) => t.textHi,
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`
  }
}));
function useDialogSkin() {
  const t = useHangarTokens();
  return useDialogSheet({ t });
}

export { useDialogSkin };
//# sourceMappingURL=dialog.esm.js.map
