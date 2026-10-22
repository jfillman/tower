import { useState, type ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import Divider from '@material-ui/core/Divider';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { fontBody, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { Button } from './index';

// The actions a view offers but rarely needs (Hard refresh, Terminate, Force sync) go behind a small "More" button,
// so the bar shows the one or two that matter now. An item can carry a hint (what it does), be `danger`, or be
// disabled with a `title` saying why. `group` starts a new block under a divider.
export interface MenuAction {
  key: string;
  label: ReactNode;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  group?: boolean;
  onSelect: () => void;
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  paper: {
    minWidth: 260,
    marginTop: 4,
    backgroundColor: ({ t }) => t.panel,
    backgroundImage: 'none',
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6,
    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
  },
  item: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    fontFamily: fontBody,
    fontSize: 13,
    color: ({ t }) => t.textHi,
    padding: '7px 12px',
  },
  off: { color: ({ t }) => t.textFaint, cursor: 'not-allowed' },
  danger: { color: ({ t }) => t.bad },
  hint: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textLo },
  divider: { backgroundColor: ({ t }) => t.line, margin: '4px 0' },
}));

export function MenuButton({ label = 'More', actions, small = true }: { label?: string; actions: MenuAction[]; small?: boolean }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const items: ReactNode[] = [];
  actions.forEach((a, i) => {
    if (a.group && i > 0) items.push(<Divider key={`${a.key}-divider`} className={classes.divider} />);
    items.push(
      // Not MUI's `disabled`: that sets pointer-events none, and the tooltip saying why would never show.
      <MenuItem
        key={a.key}
        className={[classes.item, a.danger ? classes.danger : '', a.disabled ? classes.off : ''].join(' ').trim()}
        aria-disabled={a.disabled || undefined}
        title={a.title}
        onClick={() => {
          if (a.disabled) return;
          setAnchor(null);
          a.onSelect();
        }}
      >
        <span>{a.label}</span>
        {a.hint && <span className={classes.hint}>{a.hint}</span>}
      </MenuItem>,
    );
  });
  return (
    <>
      <Button small={small} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={e => setAnchor(e.currentTarget)}>
        {label}
        <ExpandMoreIcon style={{ fontSize: 15, marginRight: -3 }} />
      </Button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        getContentAnchorEl={null}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ className: classes.paper }}
        disableScrollLock
      >
        {items}
      </Menu>
    </>
  );
}
