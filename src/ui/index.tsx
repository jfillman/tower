import type { ButtonHTMLAttributes, ReactNode } from 'react';
import SearchIcon from '@material-ui/icons/Search';
import { useHangarTokens, type HangarTokens } from '../brand/tokens';
import { keepAnchored, preventFocusScroll } from '../preventFocusScroll';
import type { Health } from '../types';
import { useControls, useUi } from './styles';

// Small shared pieces of the plugin's look. See ./styles.ts and docs/design-system.md.

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ');

function useKit() {
  const t = useHangarTokens();
  return { t, ui: useUi({ t }) };
}

function useControlsKit() {
  const t = useHangarTokens();
  return useControls({ t });
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

/** A small button that opens a list of choices and acts on the one picked (Compare with…). Not a filter. */
export function ActionSelect({
  label,
  options,
  onSelect,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  onSelect: (value: string) => void;
}) {
  const { ui } = useKit();
  return (
    <select
      aria-label={label}
      className={cx(ui.button, ui.buttonSmall)}
      value=""
      onChange={e => {
        if (e.target.value) onSelect(e.target.value);
      }}
    >
      <option value="" disabled>
        {label} ▾
      </option>
      {options.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
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

export interface FilterOption<T extends string> {
  id: T;
  label: string;
  count?: number;
  title?: string;
}

/**
 * One filter: a labelled row of pills, exactly one on. Changes what the view shows, nothing else. The label is shown
 * ("History", "Tier") unless `hideLabel`; it is always the group's accessible name.
 */
export function FilterChips<T extends string>({
  label,
  hideLabel,
  options,
  value,
  onChange,
}: {
  label: string;
  hideLabel?: boolean;
  options: Array<FilterOption<T>>;
  value: T;
  onChange: (id: T) => void;
}) {
  const ui = useControlsKit();
  return (
    <div className={ui.filterGroup} role="group" aria-label={label}>
      {!hideLabel && <span className={ui.filterLabel}>{label}</span>}
      {options.map(o => (
        <ChipButton key={o.id} ui={ui} on={o.id === value} count={o.count} title={o.title} onClick={() => onChange(o.id)}>
          {o.label}
        </ChipButton>
      ))}
    </div>
  );
}

type ChipProps = { on: boolean; count?: number; title?: string; onClick: () => void; children: ReactNode };

// The pill itself, given the kit classes: makeStyles with function values builds a stylesheet per hook call, so a
// row of pills shares its group's one call rather than each pill making its own (one per pill ran a 71-test file
// out of memory).
function ChipButton({ ui, on, count, title, onClick, children }: ChipProps & { ui: ReturnType<typeof useControls> }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onMouseDown={preventFocusScroll}
      className={cx(ui.filterChip, on && ui.filterChipOn)}
      onClick={e => keepAnchored(e.currentTarget, onClick)}
    >
      {children}
      {count !== undefined && ' '}
      {count !== undefined && <span className={cx(ui.filterCount, on && ui.filterCountOn)}>{count}</span>}
    </button>
  );
}

/** A single filter pill, for a filter where several can be on at once (wrap them in a `FilterGroup`). */
export function FilterChip(props: ChipProps) {
  const ui = useControlsKit();
  return <ChipButton ui={ui} {...props} />;
}

/** A labelled group of `FilterChip`s (multi-select). */
export function FilterGroup({ label, hideLabel, children }: { label: string; hideLabel?: boolean; children: ReactNode }) {
  const ui = useControlsKit();
  return (
    <div className={ui.filterGroup} role="group" aria-label={label}>
      {!hideLabel && <span className={ui.filterLabel}>{label}</span>}
      {children}
    </div>
  );
}

/** A filter with too many values for pills (page size, a container): a labelled native select styled like a pill. */
export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const ui = useControlsKit();
  return (
    <label className={ui.filterGroup}>
      <span className={ui.filterLabel}>{label}</span>
      <select className={ui.select} value={value} onChange={e => onChange(e.target.value as T)}>
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SearchField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const ui = useControlsKit();
  return (
    <div className={ui.search}>
      <SearchIcon className={ui.searchIcon} aria-hidden />
      <input
        type="search"
        aria-label={label}
        className={ui.searchInput}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * The row of filters above a list. Filters and search go first, in reading order; `end` (a result count, a view
 * switch such as Cards/List, a hint) sits at the right.
 */
export function FilterBar({ children, end }: { children?: ReactNode; end?: ReactNode }) {
  const ui = useControlsKit();
  return (
    <div className={ui.filterBar}>
      {children}
      {end && <div className={ui.filterBarEnd}>{end}</div>}
    </div>
  );
}

/**
 * Text that goes somewhere (another tab, an external page) or shows/hides a detail. Not a button look: a box means
 * an action. `href` makes it a link (external ones open in a new tab); otherwise it is a button.
 */
export function TextLink({
  href,
  onClick,
  title,
  expanded,
  children,
}: {
  href?: string;
  onClick?: () => void;
  title?: string;
  /** Set for a show/hide toggle: draws the ▸/▾ and sets aria-expanded. */
  expanded?: boolean;
  children: ReactNode;
}) {
  const ui = useControlsKit();
  if (href) {
    return (
      <a className={ui.textLink} href={href} target="_blank" rel="noopener noreferrer" title={title}>
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={ui.textLink}
      title={title}
      aria-expanded={expanded}
      onMouseDown={preventFocusScroll}
      onClick={onClick}
    >
      {expanded !== undefined && <span aria-hidden>{expanded ? '▾' : '▸'}</span>}
      {children}
    </button>
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
          onClick={e => keepAnchored(e.currentTarget, () => onChange(tab.id))}
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
