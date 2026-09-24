import { useMemo } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { load as loadYaml } from 'js-yaml';
import { fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';

// Item 3/4's "some field values are full k8s resources, need a helper with
// syntax checking, must validate before a PR is ever opened" - a plain
// <textarea> rather than pulling in a full code-editor dependency (no
// monaco/codemirror anywhere in this app today, see package.json), with
// live js-yaml parsing on every keystroke so a syntax error surfaces the
// instant it's typed, not just at submit time. `onChange` reports both the
// raw text (so a caller can round-trip it back into the textarea) and
// whether it currently parses - ConfigTab disables "Review changes"
// whenever any block reports invalid, which is the actual pre-PR gate (see
// that file's own validateAll).

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  labelRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  label: {
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: ({ t }) => t.textFaint,
  },
  hint: { fontSize: 11.5, color: ({ t }) => t.textFaint, fontStyle: 'italic' },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: fontMono,
    fontSize: 12.5,
    lineHeight: 1.5,
    padding: '10px 12px',
    borderRadius: 4,
    resize: 'vertical',
    color: ({ t }) => t.textHi,
    backgroundColor: ({ t }) => t.bgRaised,
    border: ({ t }) => `1px solid ${t.line}`,
    '&:focus': { outline: 'none', borderColor: ({ t }) => t.sky },
  },
  textareaInvalid: {
    borderColor: ({ t }) => t.bad,
  },
  status: {
    fontFamily: fontMono,
    fontSize: 11,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  statusOk: { color: ({ t }) => t.good },
  statusBad: { color: ({ t }) => t.bad },
}));

export interface YamlValidation {
  valid: boolean;
  error?: string;
  parsed?: unknown;
}

// Exported so ConfigTab can validate every block's current text in one place
// right before submit (belt-and-suspenders against a stale `valid` flag from
// a change that fired between renders) without duplicating the try/catch.
export function validateYamlBlock(text: string): YamlValidation {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { valid: true, parsed: undefined };
  try {
    const parsed = loadYaml(text);
    return { valid: true, parsed };
  } catch (e) {
    const err = e as { message?: string; mark?: { line?: number; column?: number } };
    const where =
      err.mark?.line !== undefined ? ` (line ${err.mark.line + 1}, column ${(err.mark.column ?? 0) + 1})` : '';
    return { valid: false, error: `${err.message ?? String(e)}${where}` };
  }
}

export function YamlBlockEditor({
  label,
  hint,
  value,
  onChange,
  rows = 8,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (text: string) => void;
  rows?: number;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const validation = useMemo(() => validateYamlBlock(value), [value]);

  return (
    <div className={classes.wrap}>
      <div className={classes.labelRow}>
        <Typography className={classes.label}>{label}</Typography>
        <span className={`${classes.status} ${validation.valid ? classes.statusOk : classes.statusBad}`}>
          {validation.valid ? '✓ Valid YAML' : `✗ ${validation.error}`}
        </span>
      </div>
      {hint && <Typography className={classes.hint}>{hint}</Typography>}
      <textarea
        className={`${classes.textarea} ${validation.valid ? '' : classes.textareaInvalid}`}
        spellCheck={false}
        rows={rows}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}
