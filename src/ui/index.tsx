import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import SearchIcon from '@material-ui/icons/Search';
import { useHangarTokens, type HangarTokens } from '../brand/tokens';
import { keepAnchored, preventFocusScroll } from '../preventFocusScroll';
import type { Health } from '../types';
import { useBlocks, useControls, useData, useSection, useStatus, useUi } from './styles';

export { MenuButton, type MenuAction } from './MenuButton';

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

export const Panel = forwardRef<HTMLDivElement, { accent?: boolean; className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>>(
  function Panel({ accent, className, children, ...rest }, ref) {
    const { ui } = useKit();
    return (
      <div ref={ref} className={cx(ui.panel, accent && ui.panelAccent, className)} {...rest}>
        {children}
      </div>
    );
  },
);

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

export type ChipTone = 'neutral' | 'ground' | 'flight' | 'ok' | 'bad' | 'sky';

export function Chip({ tone = 'neutral', className, children }: { tone?: ChipTone; className?: string; children: ReactNode }) {
  const { ui } = useKit();
  const toneClass = { neutral: undefined, ground: ui.chipGround, flight: ui.chipFlight, ok: ui.chipOk, bad: ui.chipBad, sky: ui.chipSky }[tone];
  return <span className={cx(ui.chip, toneClass, className)}>{children}</span>;
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

/** ok: done or healthy · warn: needs attention or waiting · bad: failed · info: in progress, live (blue) · neutral: unknown, none. */
export type StatusTone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

export function healthTone(h: Health): StatusTone {
  switch (h) {
    case 'healthy':
      return 'ok';
    case 'degraded':
      return 'bad';
    case 'progressing':
      return 'info';
    case 'paused':
      return 'warn';
    default:
      return 'neutral';
  }
}

/**
 * What state something is in: Healthy, promoted, failed, running. Rounded with a soft tint, so it never reads as a
 * label chip (square, `Chip`) or a button. `onClick` makes it a button (an environment pill that opens its page).
 */
export function StatusChip({
  tone,
  dot,
  title,
  onClick,
  className,
  children,
}: {
  tone: StatusTone;
  dot?: boolean;
  title?: string;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const t = useHangarTokens();
  const s = useStatus({ t });
  const content = (
    <>
      {dot && <i className={s.statusDot} aria-hidden />}
      {children}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        title={title}
        onMouseDown={preventFocusScroll}
        onClick={onClick}
        className={cx(s.status, s[tone], s.statusButton, className)}
      >
        {content}
      </button>
    );
  }
  return (
    <span title={title} className={cx(s.status, s[tone], className)}>
      {content}
    </span>
  );
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

function useSectionKit() {
  const t = useHangarTokens();
  return useSection({ t });
}

/**
 * A block inside a tab: a title (15px; `level={2}` is 13px, for a title inside a card), an optional `meta` right
 * after it (a repo chip), and a `count` and `actions` at the right. `framed` draws it as a panel with the head as
 * a bar, for a list or table that fills the panel; put an `EmptyNote inset` or a table straight inside.
 */
export function Section({
  title,
  meta,
  count,
  actions,
  framed,
  level = 1,
  className,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  count?: ReactNode;
  actions?: ReactNode;
  framed?: boolean;
  level?: 1 | 2;
  className?: string;
  children?: ReactNode;
}) {
  const s = useSectionKit();
  const Heading = level === 2 ? 'h3' : 'h2';
  return (
    <section className={cx(s.section, framed && s.framed, className)}>
      <div className={cx(s.head, framed && s.headFramed)}>
        <div className={s.headStart}>
          <Heading className={cx(s.title, level === 2 && s.title2)}>{title}</Heading>
          {meta}
        </div>
        {(count !== undefined || actions) && (
          <div className={s.headEnd}>
            {count !== undefined && <span className={s.count}>{count}</span>}
            {actions}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

/** Just the title, for a head that has its own layout (an icon before it, a toggle after it). */
export function SectionTitle({ level = 1, children }: { level?: 1 | 2; children: ReactNode }) {
  const s = useSectionKit();
  const Heading = level === 2 ? 'h3' : 'h2';
  return <Heading className={cx(s.title, level === 2 && s.title2)}>{children}</Heading>;
}

/** "Nothing here": No open release PRs. `inset` adds the panel padding, for a note straight inside a framed Section. */
export function EmptyNote({ inset, className, ...rest }: { inset?: boolean } & React.HTMLAttributes<HTMLParagraphElement>) {
  const s = useSectionKit();
  return <p className={cx(s.empty, inset && s.inset, className)} {...rest} />;
}

/** A line that explains (what a chart shows, why a control is off). Not italic: it is not an empty state. */
export function Hint({ inset, className, ...rest }: { inset?: boolean } & React.HTMLAttributes<HTMLParagraphElement>) {
  const s = useSectionKit();
  return <p className={cx(s.hint, inset && s.inset, className)} {...rest} />;
}

/** A count or range next to a title or at the end of a filter bar: "3 open", "39 images", "10 shown". */
export function Count({ children }: { children: ReactNode }) {
  const s = useSectionKit();
  return <span className={s.count}>{children}</span>;
}

function useDataKit() {
  const t = useHangarTokens();
  return useData({ t });
}

/**
 * A label over its value (Source repo / example-org/boarding-api), or `inline`: label left, value right, rows ruled
 * (an environment card's Replicas 2 / 2). Put stacked facts in a `FactGrid`.
 */
export function Fact({ label, inline, title, children }: { label: ReactNode; inline?: boolean; title?: string; children: ReactNode }) {
  const d = useDataKit();
  return (
    <div className={cx(d.fact, inline && d.factInline)}>
      <span className={d.factLabel}>{label}</span>
      <span className={cx(d.factValue, inline && d.factValueInline)} title={title}>
        {children}
      </span>
    </div>
  );
}

/**
 * Stacked facts in one wrapping row, each as wide as its value, so a value only wraps when it is wider than the whole
 * row (fixed columns broke "boarding-api-f945bbbf7-qrs5s" and image refs over two or three lines). Pass `min` for
 * equal columns at least that wide, where values are short and alignment matters.
 */
export function FactGrid({ min, row, className, children }: { min?: number; row?: boolean; className?: string; children: ReactNode }) {
  const d = useDataKit();
  const columns = min !== undefined && !row;
  return (
    <div
      className={cx(d.factGrid, !columns && d.factRow, className)}
      style={columns ? { gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` } : undefined}
    >
      {children}
    </div>
  );
}

/**
 * The kit's table classes: `table`, `th` (the ColumnLabel look), `td`, `rowLink` (a row that opens something),
 * `rowSelected`, and `dense` on the table for a small panel (events, the ArgoCD resource tree, RBAC).
 */
export function useTableKit() {
  const d = useDataKit();
  return { table: d.table, th: d.th, td: d.td, rowLink: d.rowLink, rowSelected: d.rowSelected, dense: d.dense };
}

function useBlocksKit() {
  const t = useHangarTokens();
  return useBlocks({ t });
}

/**
 * A Panel with the kit padding (14px 18px) and an optional head: `title` (a SectionTitle, `level` 2 by default) and
 * `meta` at the left, `actions` (a status chip, buttons) at the right.
 */
export const Card = forwardRef<
  HTMLDivElement,
  { title?: ReactNode; meta?: ReactNode; actions?: ReactNode; level?: 1 | 2; className?: string; children?: ReactNode } & Omit<
    React.HTMLAttributes<HTMLDivElement>,
    'title'
  >
>(function Card({ title, meta, actions, level = 2, className, children, ...rest }, ref) {
  const b = useBlocksKit();
  return (
    <Panel ref={ref} className={cx(b.card, className)} {...rest}>
      {(title !== undefined || actions) && (
        <div className={b.cardHead}>
          <div className={b.cardHeadStart}>
            {title !== undefined && <SectionTitle level={level}>{title}</SectionTitle>}
            {meta}
          </div>
          {actions && <div className={b.cardHeadEnd}>{actions}</div>}
        </div>
      )}
      {children}
    </Panel>
  );
});

/** An item inside a card (a pod, a resource, a fact box): panelAlt, radius 4. `onClick` makes it a button. */
export function Tile({ onClick, className, children, ...rest }: { onClick?: () => void; className?: string; children: ReactNode } & Omit<React.HTMLAttributes<HTMLElement>, 'onClick'>) {
  const b = useBlocksKit();
  if (onClick) {
    return (
      <button
        type="button"
        onMouseDown={preventFocusScroll}
        onClick={onClick}
        className={cx(b.tile, b.tileLink, className)}
        style={{ textAlign: 'left', font: 'inherit', color: 'inherit', width: '100%' }}
        {...rest}
      >
        {children}
      </button>
    );
  }
  return (
    <div className={cx(b.tile, className)} {...rest}>
      {children}
    </div>
  );
}

export type CalloutTone = 'info' | 'warn' | 'bad' | 'ok' | 'neutral';

/**
 * A banner in a status tone: `info` (blue, in motion), `warn` (amber, needs someone or may be stale), `bad` (red,
 * failed), `ok`, `neutral`. Title 13px condensed, body 12.5px; `label` is a mono caps line above the title.
 * `icon` draws a round glyph before it; `actions` sit at the right.
 */
export function Callout({
  tone,
  label,
  title,
  icon,
  actions,
  className,
  children,
}: {
  tone: CalloutTone;
  label?: ReactNode;
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const b = useBlocksKit();
  return (
    <div className={cx(b.callout, b[tone], className)} role={tone === 'bad' ? 'alert' : 'status'}>
      {icon !== undefined && (
        <span className={b.calloutIcon} aria-hidden>
          <span className={b.calloutIconGlyph}>{icon}</span>
        </span>
      )}
      <div className={b.calloutBody}>
        {label !== undefined && <span className={b.calloutLabel}>{label}</span>}
        {title !== undefined && <p className={b.calloutTitle}>{title}</p>}
        {children !== undefined && <div className={b.calloutText}>{children}</div>}
      </div>
      {actions && <div className={b.calloutActions}>{actions}</div>}
    </div>
  );
}

/** A headline number: label, a 22px value, an optional caption. `tone` colours the value. */
export function Stat({
  label,
  value,
  caption,
  tone,
  title,
}: {
  label: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
  tone?: 'ok' | 'warn' | 'bad';
  title?: string;
}) {
  const b = useBlocksKit();
  const toneClass = tone && { ok: b.statValueOk, warn: b.statValueWarn, bad: b.statValueBad }[tone];
  return (
    <div className={b.stat} title={title}>
      <span className={b.statLabel}>{label}</span>
      <span className={cx(b.statValue, toneClass)}>{value}</span>
      {caption !== undefined && <span className={b.statCaption}>{caption}</span>}
    </div>
  );
}

export { CopyButton, YamlBlock, YamlLine, useCopyText } from './YamlBlock';
