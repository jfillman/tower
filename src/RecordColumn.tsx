import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontDisplay, useHangarTokens, type HangarTokens } from './brand/tokens';

// A Release Record panel: the record's own look (a colour strip along the top, an uppercase title, a ruled head),
// shared by the panels that live in their own files (Outcome, Release notes and sign-off) so they match What changed,
// What was built and What happened in ReleaseRecordDetail.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  col: { border: ({ t }) => `1px solid ${t.line}`, borderRadius: 6, backgroundColor: ({ t }) => t.panel, overflow: 'hidden', minWidth: 0 },
  colHead: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '6px 12px',
    padding: '12px 15px',
    borderBottom: ({ t }) => `1px solid ${t.line}`,
  },
  colTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', color: ({ t }) => t.textHi },
  colBody: { padding: '14px 15px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 },
}));

export function RecordColumn({ title, strip, meta, children }: { title: string; strip: string; meta?: ReactNode; children: ReactNode }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  return (
    <div className={classes.col}>
      <div className={classes.colHead} style={{ borderTop: `3px solid ${strip}` }}>
        <span className={classes.colTitle}>{title}</span>
        {meta}
      </div>
      <div className={classes.colBody}>{children}</div>
    </div>
  );
}
