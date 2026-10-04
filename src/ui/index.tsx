import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useHangarTokens, type HangarTokens } from '../brand/tokens';
import { preventFocusScroll } from '../preventFocusScroll';
import type { Health } from '../types';
import { useUi } from './styles';

// Small shared pieces of the plugin's look. See ./styles.ts and docs/design-system.md.

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ');

function useKit() {
  const t = useHangarTokens();
  return { t, ui: useUi({ t }) };
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  const { ui } = useKit();
  return (
    <div className={ui.pageHead}>
      <div>
        <h1 className={ui.pageTitle}>{title}</h1>
        {subtitle && <p className={ui.pageSub}>{subtitle}</p>}
      </div>
      {actions && <div className={ui.pageActions}>{actions}</div>}
    </div>
  );
}

export function Panel({ accent, className, children, ...rest }: { accent?: boolean; className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  const { ui } = useKit();
  return (
    <div className={cx(ui.panel, accent && ui.panelAccent, className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  const { ui } = useKit();
  return <h2 className={ui.sectionLabel}>{children}</h2>;
}

export function ColumnLabel({ children }: { children?: ReactNode }) {
  const { ui } = useKit();
  return <span className={ui.columnLabel}>{children}</span>;
}

export type ButtonVariant = 'default' | 'primary' | 'danger';

export function Button({
  variant = 'default',
  small,
  className,
  type = 'button',
  ...rest
}: { variant?: ButtonVariant; small?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { ui } = useKit();
  return (
    <button
      type={type}
      onMouseDown={preventFocusScroll}
      className={cx(ui.button, variant === 'primary' && ui.buttonPrimary, variant === 'danger' && ui.buttonDanger, small && ui.buttonSmall, className)}
      {...rest}
    />
  );
}

export function IconButton({ className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { ui } = useKit();
  return <button type={type} onMouseDown={preventFocusScroll} className={cx(ui.iconButton, className)} {...rest} />;
}

export type ChipTone = 'neutral' | 'ground' | 'flight' | 'ok' | 'bad';

export function Chip({ tone = 'neutral', children }: { tone?: ChipTone; children: ReactNode }) {
  const { ui } = useKit();
  const toneClass = { neutral: undefined, ground: ui.chipGround, flight: ui.chipFlight, ok: ui.chipOk, bad: ui.chipBad }[tone];
  return <span className={cx(ui.chip, toneClass)}>{children}</span>;
}

export function TierChip({ tier }: { tier: 'ground' | 'flight' }) {
  return <Chip tone={tier}>{tier === 'flight' ? 'Flight' : 'Ground'}</Chip>;
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: T; label: string; count?: number }>;
  value: T;
  onChange: (id: T) => void;
}) {
  const { ui } = useKit();
  return (
    <div className={ui.segmented} role="group" aria-label={label}>
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          onMouseDown={preventFocusScroll}
          className={cx(ui.segment, o.id === value && ui.segmentOn)}
          onClick={() => onChange(o.id)}
        >
          {o.label}
          {o.count !== undefined ? ` ${o.count}` : ''}
        </button>
      ))}
    </div>
  );
}

export function Subtabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: Array<{ id: T; label: string; marked?: boolean }>;
  value: T;
  onChange: (id: T) => void;
}) {
  const { ui } = useKit();
  return (
    <div className={ui.subtabs} role="tablist" aria-label={label}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === value}
          onMouseDown={preventFocusScroll}
          className={cx(ui.subtab, tab.id === value && ui.subtabOn)}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.marked && <i className={ui.marker} role="img" aria-label="has staged changes" />}
        </button>
      ))}
    </div>
  );
}

export function healthColor(h: Health, t: HangarTokens): string {
  switch (h) {
    case 'healthy':
      return t.good;
    case 'degraded':
      return t.bad;
    case 'progressing':
      return t.sky;
    case 'paused':
      return t.amber;
    default:
      return t.textFaint;
  }
}

export const HEALTH_LABEL: Record<Health, string> = {
  healthy: 'Healthy',
  progressing: 'Progressing',
  paused: 'Paused',
  degraded: 'Degraded',
  unknown: 'Unknown',
};

export function StatusDot({ health }: { health: Health }) {
  const { t, ui } = useKit();
  return <i className={ui.dot} style={{ backgroundColor: healthColor(health, t) }} role="img" aria-label={health} />;
}

/** A labelled input with the "where this value comes from" tag the Environments mockup shows. */
export function Field({
  id,
  label,
  source,
  children,
}: {
  id: string;
  label: string;
  source?: { text: string; set?: boolean };
  children: (props: { id: string; className: string }) => ReactNode;
}) {
  const { ui } = useKit();
  return (
    <div className={ui.field}>
      <label htmlFor={id} className={ui.fieldLabel}>
        {label}
        {source && <span className={cx(ui.fieldSource, source.set && ui.fieldSourceSet)}>{source.text}</span>}
      </label>
      {children({ id, className: ui.input })}
    </div>
  );
}
