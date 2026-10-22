import type { ReactElement, ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import MuiTooltip from '@material-ui/core/Tooltip';
import LockIcon from '@material-ui/icons/LockOutlined';
import { fontBody, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';

// Reasons and detail people can actually see (2026-10-22 UI pass, recommendation 2). Tower had 235 native title=
// tooltips: they show after about a second of hovering, are unstyled, never appear on touch and never for keyboard
// focus, and several carried the one thing a user needed (why Sync is grey). Two pieces:
//
//   ActionReason  why a primary action is unavailable, as a visible line under the action bar. The disabled button
//                 points at it with aria-describedby. Never only a tooltip.
//   Tooltip       detail that blocks nothing (a PR's failing checks, what a button does): opens 300 ms after hover and
//                 straight away on keyboard focus; Esc closes it. A truncated value's full text may stay a title=.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  tip: {
    backgroundColor: ({ t }) => t.textHi,
    color: ({ t }) => t.bg,
    fontFamily: fontBody,
    fontSize: 12,
    lineHeight: 1.45,
    padding: '8px 10px',
    borderRadius: 6,
    maxWidth: 340,
    whiteSpace: 'pre-line',
    boxShadow: '0 10px 28px rgba(0,0,0,0.25)',
  },
  reason: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textHi,
    fontFamily: fontBody,
    fontSize: 13,
    lineHeight: 1.45,
  },
  reasonIcon: { fontSize: 15, marginTop: 1, color: ({ t }) => t.textLo, flexShrink: 0 },
  reasonActions: { display: 'flex', gap: 14, marginTop: 4, fontFamily: fontMono, fontSize: 12 },
}));

export function Tooltip({ title, children }: { title: ReactNode; children: ReactElement }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  if (!title) return children;
  // A DOM element (span, div, td, a) takes the tooltip directly, so nothing about its layout changes. A component
  // child is wrapped: MUI's Tooltip needs a child that holds a ref (the kit Button, StatusChip and friends do not
  // forward one). So is a disabled control, which fires no pointer or focus events: the wrapper listens instead, and
  // is itself focusable so a keyboard user can still reach the reason.
  const disabled = Boolean((children.props as { disabled?: boolean }).disabled);
  const target =
    typeof children.type === 'string' && !disabled ? (
      children
    ) : (
      <span style={{ display: 'inline-flex' }} tabIndex={disabled ? 0 : undefined}>
        {children}
      </span>
    );
  return (
    <MuiTooltip title={title} enterDelay={300} enterNextDelay={150} classes={{ tooltip: c.tip }} placement="bottom">
      {target}
    </MuiTooltip>
  );
}

export function ActionReason({ id, children, actions }: { id?: string; children: ReactNode; actions?: ReactNode }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  return (
    <div id={id} className={c.reason}>
      <LockIcon className={c.reasonIcon} aria-hidden />
      <div>
        {children}
        {actions && <div className={c.reasonActions}>{actions}</div>}
      </div>
    </div>
  );
}
