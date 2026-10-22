import { useMemo, useState, type ReactNode, type Ref } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import FileCopyOutlinedIcon from '@material-ui/icons/FileCopyOutlined';
import { fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { preventFocusScroll } from '../preventFocusScroll';
import { useUi } from './styles';

// Not `import { Button } from './index'`: index re-exports this file, and Rollup's preserveModules build splits a
// re-export cycle across chunks with a broken load order. The kit's button classes come straight from ./styles.

// One look for YAML wherever Tower shows it read-only (docs/design-system.md, "YAML"): mono text on the base
// background in a soft-line box, keys sky, numbers and booleans amber, comments faint, a line-number gutter, a Copy
// button and, where a document is long, a line filter. Every YAML view (a PipelineRun, a Rollout, cicd.yaml, a values
// file, a chart's merged values) renders through this, so they cannot drift apart again (2026-10-12: five hand-rolled
// <pre> styles with five fonts sizes and paddings). Editors (YamlBlockEditor) stay a textarea and share the box look.

// Token-ish line coloring, not a real YAML parser - good enough for js-yaml.dump's consistent output shape and for
// hand-written files, and far cheaper than a grammar-aware highlighter for a read-only view.
const KEY_RE = /^(\s*(?:- )?)([A-Za-z0-9_.\-/]+)(:)(\s.*)?$/;
const LIST_DASH_RE = /^(\s*)(- )(.*)$/;

function colorForScalar(text: string, t: HangarTokens): string {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed === '{}' || trimmed === '[]' || trimmed === '|' || trimmed === '>') return t.textFaint;
  if (trimmed === 'null' || trimmed === '~') return t.textFaint;
  if (trimmed === 'true' || trimmed === 'false') return t.amberInk;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return t.amberInk;
  if (/^#/.test(trimmed)) return t.textFaint;
  return t.textHi;
}

export function YamlLine({ text, t }: { text: string; t: HangarTokens }) {
  if (/^\s*#/.test(text)) return <span style={{ color: t.textFaint, fontStyle: 'italic' }}>{text}</span>;
  const keyMatch = text.match(KEY_RE);
  if (keyMatch) {
    const [, prefix, key, colon, rest] = keyMatch;
    return (
      <>
        {prefix}
        <span style={{ color: t.sky }}>{key}</span>
        {colon}
        {rest && <span style={{ color: colorForScalar(rest, t) }}>{rest}</span>}
      </>
    );
  }
  const dashMatch = text.match(LIST_DASH_RE);
  if (dashMatch) {
    const [, prefix, dash, rest] = dashMatch;
    return (
      <>
        {prefix}
        <span style={{ color: t.textFaint }}>{dash}</span>
        <span style={{ color: colorForScalar(rest, t) }}>{rest}</span>
      </>
    );
  }
  return <span style={{ color: colorForScalar(text, t) }}>{text}</span>;
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  head: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  heading: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  spacer: { flex: 1 },
  search: {
    fontFamily: fontMono,
    fontSize: 11,
    padding: '5px 9px',
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    color: ({ t }) => t.textHi,
    // In the header row with the title and Copy (2026-10-12: it sat on its own row under them).
    flex: '1 1 160px',
    minWidth: 120,
    maxWidth: 280,
  },
  codeBox: {
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.bg,
    overflow: 'auto',
    fontFamily: fontMono,
    fontSize: 11,
    lineHeight: 1.6,
    padding: '6px 0',
  },
  codeLine: { display: 'flex' },
  codeLineMatch: { backgroundColor: ({ t }) => t.amberSoft },
  lineNo: {
    flexShrink: 0,
    width: 40,
    textAlign: 'right',
    paddingRight: 10,
    color: ({ t }) => t.textFaint,
    opacity: 0.6,
    userSelect: 'none',
  },
  lineText: { whiteSpace: 'pre', paddingRight: 12, minWidth: 0 },
  lineTextNoGutter: { paddingLeft: 12 },
}));

/** Copies `text` to the clipboard; `copied` is true for a moment afterwards so a button can say so. */
export function useCopyText(text: string): { copied: boolean; copy: () => void } {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // Clipboard access can be denied by the browser - nothing to recover, the button simply won't confirm.
      });
  };
  return { copied, copy };
}

export function CopyButton({ text }: { text: string }) {
  const t = useHangarTokens();
  const ui = useUi({ t });
  const { copied, copy } = useCopyText(text);
  return (
    <button type="button" className={`${ui.button} ${ui.buttonSmall}`} onMouseDown={preventFocusScroll} onClick={copy} aria-label="Copy to clipboard">
      <FileCopyOutlinedIcon style={{ fontSize: 13 }} />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function YamlBlock({
  text,
  title,
  actions,
  copy = true,
  filter = false,
  lineNumbers = true,
  maxHeight = 460,
  className,
  boxRef,
  'aria-label': ariaLabel,
}: {
  text: string;
  /** Shown at the left of the header row (a file path, a resource name). The header is omitted without one unless Copy or actions need it. */
  title?: ReactNode;
  /** Extra controls at the right of the header row, before Copy. */
  actions?: ReactNode;
  copy?: boolean;
  /** A line filter above the text, for long documents. */
  filter?: boolean;
  lineNumbers?: boolean;
  maxHeight?: number | string;
  className?: string;
  /** The scrolling box, for a caller that keeps its scroll position across views. */
  boxRef?: Ref<HTMLDivElement>;
  'aria-label'?: string;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [query, setQuery] = useState('');
  const lines = useMemo(() => text.replace(/\n$/, '').split('\n'), [text]);
  const q = query.trim().toLowerCase();
  const showHead = title !== undefined || actions !== undefined || copy;
  return (
    <div className={`${classes.wrap} ${className ?? ''}`}>
      {(showHead || filter) && (
        <div className={classes.head}>
          {title !== undefined && <span className={classes.heading}>{title}</span>}
          {filter && <input className={classes.search} placeholder="filter lines…" value={query} onChange={e => setQuery(e.target.value)} aria-label="Filter lines" />}
          <span className={classes.spacer} />
          {actions}
          {copy && <CopyButton text={text} />}
        </div>
      )}
      <div className={classes.codeBox} style={{ maxHeight }} ref={boxRef} aria-label={ariaLabel} role={ariaLabel ? 'region' : undefined}>
        {lines.map((line, i) => {
          const match = q.length > 0 && line.toLowerCase().includes(q);
          if (q.length > 0 && !match) return null;
          return (
            <div key={i} className={`${classes.codeLine} ${match ? classes.codeLineMatch : ''}`}>
              {lineNumbers && <span className={classes.lineNo}>{i + 1}</span>}
              <span className={`${classes.lineText} ${lineNumbers ? '' : classes.lineTextNoGutter}`} data-yaml-line="">
                <YamlLine text={line} t={t} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
