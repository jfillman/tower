import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { dump as dumpYaml } from 'js-yaml';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import FileCopyOutlinedIcon from '@material-ui/icons/FileCopyOutlined';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../../../brand/tokens';
import { JsonNode } from '../../ResourceInspector';
import { preventFocusScroll } from '../../preventFocusScroll';
import type { K8sResourceRef } from '../../types';

// Item 4's "better yaml viewer" - the old ResourceYamlView only ever showed
// a collapsible JS-object tree (JsonNode), which reads as JSON with colons,
// not the real YAML a `kubectl get -o yaml` would print. This renders the
// actual YAML text (via js-yaml, already a dependency for the Config/
// Glidepath tabs' raw-file views) with real syntax coloring, line numbers,
// and a copy button, and keeps the old collapsible tree as a "Structured"
// alternate view for drilling into one deeply-nested field without losing
// your place - each mode is better for a different task, so both stay
// rather than picking one.

function redactIfSecret(ref: K8sResourceRef): unknown {
  if (ref.kind !== 'Secret' || !ref.raw || typeof ref.raw !== 'object') return ref.raw;
  const secret = ref.raw as { data?: Record<string, unknown>; stringData?: Record<string, unknown> };
  const redact = (rec?: Record<string, unknown>) =>
    rec ? Object.fromEntries(Object.keys(rec).map(k => [k, '<redacted>'])) : undefined;
  return { ...secret, data: redact(secret.data), stringData: redact(secret.stringData) };
}

// 2026-09-17 bug: apiVersion/kind were missing from the top of "all
// resources"/pod YAML views. Root cause - Kubernetes list responses don't
// self-carry a `kind`/`apiVersion` per item (only the enclosing List does,
// see useTowerEnvironments.ts's RESOURCE_KIND_LABEL comment), so `ref.raw`
// itself is frequently missing both. `ref.kind` is always reliable (every
// producer sets it explicitly); `ref.apiVersion` is populated wherever a
// producer can determine it. Re-stamped onto the object at dump time,
// ahead of every other field, so the YAML view always reads like a real
// `kubectl get -o yaml` - never left to whatever the raw fetch happened to
// include.
function withTypeMeta(ref: K8sResourceRef, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const obj = value as Record<string, unknown>;
  const kind = (typeof obj.kind === 'string' && obj.kind) || ref.kind;
  const apiVersion = (typeof obj.apiVersion === 'string' && obj.apiVersion) || ref.apiVersion;
  const { apiVersion: _apiVersion, kind: _kind, ...rest } = obj;
  return apiVersion ? { apiVersion, kind, ...rest } : { kind, ...rest };
}

// Token-ish line coloring, not a real YAML parser - good enough for
// `js-yaml.dump`'s own consistent output shape (it never emits flow-style
// scalars ambiguously), and far cheaper than pulling in a full grammar-aware
// highlighter for a read-only viewer.
const KEY_RE = /^(\s*(?:- )?)([A-Za-z0-9_.\-/]+)(:)(\s.*)?$/;
const LIST_DASH_RE = /^(\s*)(- )(.*)$/;

function colorForScalar(text: string, t: HangarTokens): string {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed === '{}' || trimmed === '[]' || trimmed === '|' || trimmed === '>') return t.textFaint;
  if (trimmed === 'null' || trimmed === '~') return t.textFaint;
  if (trimmed === 'true' || trimmed === 'false') return t.amberInk;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return t.amberInk;
  return t.textHi;
}

function YamlLine({ text, t }: { text: string; t: HangarTokens }) {
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
  if (/^\s*#/.test(text)) return <span style={{ color: t.textFaint, fontStyle: 'italic' }}>{text}</span>;
  return <span style={{ color: colorForScalar(text, t) }}>{text}</span>;
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  head: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  kind: {
    fontFamily: fontMono,
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: '2px 8px',
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.skyLine}`,
    backgroundColor: ({ t }) => t.skySoft,
    color: ({ t }) => t.sky,
  },
  name: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14, color: ({ t }) => t.textHi },
  spacer: { flex: 1 },
  modeBtn: {
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: '3px 9px',
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.line}`,
    background: 'none',
    color: ({ t }) => t.textFaint,
    cursor: 'pointer',
  },
  modeBtnActive: { color: ({ t }) => t.sky, borderColor: ({ t }) => t.skyLine, backgroundColor: ({ t }) => t.skySoft },
  copyBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: '3px 9px',
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.line}`,
    background: 'none',
    color: ({ t }) => t.textFaint,
    cursor: 'pointer',
    '&:hover': { color: ({ t }) => t.sky },
  },
  secretNote: { fontSize: 11.5, fontStyle: 'italic', color: ({ t }) => t.textFaint },
  search: {
    fontFamily: fontMono,
    fontSize: 11,
    padding: '5px 9px',
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    color: ({ t }) => t.textHi,
    width: '100%',
    maxWidth: 260,
  },
  codeBox: {
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.bg,
    maxHeight: 460,
    overflow: 'auto',
    fontFamily: fontMono,
    fontSize: 11.5,
    lineHeight: 1.6,
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
  treeBox: {
    padding: '10px 12px',
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.bg,
    fontFamily: fontMono,
    fontSize: 11.5,
    lineHeight: 1.6,
    maxHeight: 460,
    overflow: 'auto',
  },
}));

type Mode = 'yaml' | 'tree';

export function YamlView({ resource }: { resource: K8sResourceRef }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [mode, setMode] = useState<Mode>('yaml');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);

  // YAML and Structured are two different scrollable boxes (codeBox/
  // treeBox below) - switching between them mounts a brand new element that
  // always starts at scrollTop 0, so scrolling deep into a long resource's
  // YAML and then clicking "Structured" silently snapped back to the very
  // top (2026-09-17 bug report: "the workload dag stage YAML and structured
  // buttons" jump you to the top - the Workload stage is the one most
  // likely to have a YAML/tree long enough to need scrolling in the first
  // place, e.g. a Rollout's full spec). The two views have no line-for-line
  // correspondence, so an exact position can't carry over, but the relative
  // scroll depth (0 = top, 1 = bottom) reads as "roughly the same place" to
  // a human and is cheap to compute from either box.
  const boxRef = useRef<HTMLDivElement>(null);
  const pendingScrollRatio = useRef<number | null>(null);
  const switchMode = (next: Mode) => {
    if (next === mode) return;
    const el = boxRef.current;
    const scrollable = el ? el.scrollHeight - el.clientHeight : 0;
    pendingScrollRatio.current = el && scrollable > 0 ? el.scrollTop / scrollable : 0;
    setMode(next);
  };
  useLayoutEffect(() => {
    if (pendingScrollRatio.current === null) return;
    const el = boxRef.current;
    if (el) {
      const scrollable = el.scrollHeight - el.clientHeight;
      el.scrollTop = pendingScrollRatio.current * scrollable;
    }
    pendingScrollRatio.current = null;
  }, [mode]);

  const value = withTypeMeta(resource, redactIfSecret(resource));
  const yamlText = useMemo(() => {
    try {
      return dumpYaml(value, { lineWidth: 100, noRefs: true });
    } catch (e) {
      return `# couldn't render as YAML: ${String(e)}`;
    }
  }, [value]);
  const lines = useMemo(() => yamlText.split('\n'), [yamlText]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(yamlText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard access can be denied by the browser - nothing to recover,
      // the button label simply won't confirm.
    }
  };

  return (
    <div className={classes.wrap}>
      <div className={classes.head}>
        <span className={classes.kind}>{resource.kind}</span>
        <span className={classes.name}>{resource.name}</span>
        <span className={classes.spacer} />
        <button type="button" className={`${classes.modeBtn} ${mode === 'yaml' ? classes.modeBtnActive : ''}`} onMouseDown={preventFocusScroll} onClick={() => switchMode('yaml')}>
          YAML
        </button>
        <button type="button" className={`${classes.modeBtn} ${mode === 'tree' ? classes.modeBtnActive : ''}`} onMouseDown={preventFocusScroll} onClick={() => switchMode('tree')}>
          Structured
        </button>
        <button type="button" className={classes.copyBtn} onMouseDown={preventFocusScroll} onClick={copy}>
          <FileCopyOutlinedIcon style={{ fontSize: 13 }} />
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      {resource.kind === 'Secret' && (
        <Typography className={classes.secretNote}>Values redacted below - this is a real Secret, not a preview of one.</Typography>
      )}
      {mode === 'yaml' && (
        <input
          className={classes.search}
          placeholder="filter lines…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      )}
      {mode === 'yaml' ? (
        <div className={classes.codeBox} ref={boxRef}>
          {lines.map((line, i) => {
            const match = query.length > 0 && line.toLowerCase().includes(query.toLowerCase());
            if (query.length > 0 && !match) return null;
            return (
              <div key={i} className={`${classes.codeLine} ${match ? classes.codeLineMatch : ''}`}>
                <span className={classes.lineNo}>{i + 1}</span>
                <span className={classes.lineText}>
                  <YamlLine text={line} t={t} />
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={classes.treeBox} ref={boxRef}>
          <JsonNode value={value} depth={0} />
        </div>
      )}
    </div>
  );
}
