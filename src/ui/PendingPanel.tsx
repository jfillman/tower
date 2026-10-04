import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { Button, Chip, Panel, SectionLabel } from './index';
import { useUi } from './styles';

// The "Pending changes" panel every editing tab uses (Environments, the values form, App Configuration, Glidepath):
// what is staged, what blocks it, then Discard and the one amber button that opens the pull request. Edits are
// staged in the tab and nothing is submitted until this button.

export interface PendingLine {
  title: string;
  detail?: string;
  tone?: 'add' | 'remove';
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  panel: { padding: 16, display: 'flex', flexDirection: 'column', gap: 12, alignSelf: 'start' },
  stickTop: { position: 'sticky', top: 12 },
  stickBottom: { position: 'sticky', bottom: 12, zIndex: 1, boxShadow: '0 -6px 16px rgba(0,0,0,0.25)' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  lines: { display: 'flex', flexDirection: 'column', gap: 12 },
  line: { display: 'flex', flexDirection: 'column', gap: 2 },
  lineTitle: { fontSize: 13, fontWeight: 600, color: ({ t }) => t.textHi },
  detail: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textLo },
  plus: { color: ({ t }) => t.good, marginRight: 4 },
  minus: { color: ({ t }) => t.bad, marginRight: 4 },
  buttons: { display: 'flex', gap: 8 },
}));

export function PendingPanel({
  lines,
  problems = [],
  notes = [],
  emptyText = 'Nothing staged yet.',
  heading = 'Pending changes',
  accent = true,
  stick,
  busy,
  canSubmit,
  submitLabel,
  busyLabel = 'Opening…',
  onDiscard,
  onSubmit,
  children,
  ...rest
}: {
  lines: PendingLine[];
  problems?: string[];
  notes?: string[];
  emptyText?: string;
  heading?: string;
  accent?: boolean;
  /** Keep the panel in view while the page scrolls: beside a form (top) or under a long one (bottom). */
  stick?: 'top' | 'bottom';
  busy?: boolean;
  canSubmit?: boolean;
  submitLabel: string;
  busyLabel?: string;
  onDiscard: () => void;
  onSubmit: () => void;
  /** Extra block between the changes and the notes (for example the list of pull requests). */
  children?: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const ui = useUi({ t });
  const ok = canSubmit ?? (lines.length > 0 && problems.length === 0);
  return (
    <Panel accent={accent} className={`${c.panel} ${stick === 'top' ? c.stickTop : ''} ${stick === 'bottom' ? c.stickBottom : ''}`} role="region" aria-label={heading} {...rest}>
      <div className={c.head}>
        <SectionLabel>{heading}</SectionLabel>
        <Chip tone="flight">{lines.length} staged</Chip>
      </div>
      {lines.length === 0 ? (
        <div className={ui.note}>{emptyText}</div>
      ) : (
        <>
          <div className={c.lines}>
            {lines.map((l, i) => (
              <div key={`${l.title}-${i}`} className={c.line}>
                <span className={c.lineTitle}>
                  {l.tone === 'add' && <span className={c.plus}>+</span>}
                  {l.tone === 'remove' && <span className={c.minus}>-</span>}
                  {l.title}
                </span>
                {l.detail && <span className={c.detail}>{l.detail}</span>}
              </div>
            ))}
          </div>
          {problems.map(p => (
            <div key={p} className={ui.problem}>
              {p}
            </div>
          ))}
          {children}
          {notes.map(n => (
            <div key={n} className={ui.note}>
              {n}
            </div>
          ))}
          <div className={c.buttons}>
            <Button onClick={onDiscard} disabled={busy}>
              Discard all
            </Button>
            <Button variant="primary" style={{ flex: 1 }} disabled={!ok || busy} onClick={onSubmit}>
              {busy ? busyLabel : submitLabel}
            </Button>
          </div>
        </>
      )}
    </Panel>
  );
}
