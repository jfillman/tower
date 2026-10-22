import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontBody, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { Tooltip } from './Tooltip';
import type { PullRequestSummary } from '../pullRequests/usePullRequests';

// One way to show a pull request (docs/design-system.md, "Pull requests"). Before this, Tower drew a PR seven ways
// (PrButton, TextLink "PR #N ↗", "#N", "Review PR #N", "pin PR open ↗", MUI links, raw URLs). Every PR on screen is
// now a PrRef in one of three sizes, and every action that opens one ends in a PrReceipt.
//
//   inline  sky mono "PR #482 ↗" inside a sentence or a fact
//   chip    a square chip: state glyph, #482, checks dot, one word (approved / 2 failing / draft / merged / closed)
//   card    a row: state glyph, PR #482, title, a meta line (repo · checks · review), a status word, ↗
//
// State glyph: ○ open, ◌ draft, ✓ merged, ✕ closed. Checks: one dot, green / red / sky while running.

export type PrState = 'open' | 'draft' | 'merged' | 'closed';

/** The least a PrRef needs. A PullRequestSummary fits; so does what a create route returns (a URL). */
export interface PrLike {
  number?: number;
  url: string;
  title?: string;
  state?: PrState;
  repo?: string;
  ci?: {
    state: 'success' | 'failure' | 'pending' | 'unknown';
    totalChecks: number;
    passedChecks: number;
    checks?: Array<{ name: string; status: string; conclusion?: string }>;
  };
  review?: { state: string };
}

export function prNumberFromUrl(url: string | undefined): number | undefined {
  const m = url?.match(/\/pull\/(\d+)/);
  return m ? Number(m[1]) : undefined;
}

export function prFromSummary(pr: PullRequestSummary): PrLike {
  let state: PrState = 'open';
  if (pr.state === 'merged') state = 'merged';
  else if (pr.draft) state = 'draft';
  return { number: pr.number, url: pr.url, title: pr.title, state, repo: pr.repo, ci: pr.ci, review: pr.review };
}

/** What the kit Tooltip on a chip or card says: the title, then the checks that are not passing. */
function prDetail(pr: PrLike): ReactNode {
  const ci = pr.ci;
  if (!ci) return pr.title;
  const notPassing = (ci.checks ?? []).filter(
    run => run.status !== 'completed' || (run.conclusion && run.conclusion !== 'success' && run.conclusion !== 'skipped'),
  );
  const lines = [
    pr.title,
    `Checks: ${ci.passedChecks} of ${ci.totalChecks} passed`,
    ...notPassing.map(run => `  ${run.name}: ${run.status === 'completed' ? run.conclusion : run.status.replace('_', ' ')}`),
  ].filter(Boolean);
  return lines.join('\n');
}

const GLYPH: Record<PrState, string> = { open: '○', draft: '◌', merged: '✓', closed: '✕' };

function glyphColor(t: HangarTokens, s: PrState): string {
  if (s === 'open') return t.sky;
  if (s === 'merged') return t.good;
  return t.textFaint;
}

function ciColor(t: HangarTokens, ci: NonNullable<PrLike['ci']>): string {
  if (ci.state === 'success') return t.good;
  if (ci.state === 'failure') return t.bad;
  if (ci.state === 'pending') return t.sky;
  return t.textFaint;
}

type Word = { text: string; tone: 'ok' | 'bad' | 'info' | 'neutral' };

/** The one status word a chip or card shows: what the PR is waiting on, or how it ended. */
export function prWord(pr: PrLike): Word | undefined {
  if (pr.state === 'merged') return { text: 'merged', tone: 'neutral' };
  if (pr.state === 'closed') return { text: 'closed', tone: 'neutral' };
  if (pr.state === 'draft') return { text: 'draft', tone: 'neutral' };
  if (pr.ci?.state === 'failure') {
    const failing = pr.ci.totalChecks - pr.ci.passedChecks;
    return { text: failing > 0 ? `${failing} failing` : 'checks failing', tone: 'bad' };
  }
  if (pr.review?.state === 'changes_requested') return { text: 'changes requested', tone: 'bad' };
  if (pr.ci?.state === 'pending') return { text: 'checks running', tone: 'info' };
  if (pr.review?.state === 'approved') return { text: pr.ci?.state === 'success' ? 'ready to merge' : 'approved', tone: 'ok' };
  return undefined;
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  inline: { fontFamily: fontMono, fontSize: '0.96em', color: ({ t }) => t.sky, textDecoration: 'none', whiteSpace: 'nowrap', '&:hover': { textDecoration: 'underline' } },
  inlineDone: { color: ({ t }) => t.textLo },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: fontMono,
    fontSize: 11,
    lineHeight: 1,
    padding: '4px 8px',
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    color: ({ t }) => t.textHi,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    '&:hover': { borderColor: ({ t }) => t.textFaint },
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    maxWidth: '100%',
    boxSizing: 'border-box',
    padding: '9px 14px',
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    color: ({ t }) => t.textHi,
    textDecoration: 'none',
    '&:hover': { borderColor: ({ t }) => t.textFaint },
  },
  cardBody: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flexGrow: 1 },
  cardTop: { display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 },
  num: { fontFamily: fontMono, fontSize: 12, flexShrink: 0 },
  title: { fontFamily: fontBody, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textLo, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  word: { fontFamily: fontMono, fontSize: 11, whiteSpace: 'nowrap', padding: '3px 9px', borderRadius: 999, border: '1px solid' },
  arrow: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textFaint, flexShrink: 0 },
  // receipt
  receipt: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 14,
    borderRadius: 6,
    border: '1px solid',
  },
  receiptHead: { display: 'flex', alignItems: 'center', gap: 8, fontFamily: fontBody, fontSize: 13, fontWeight: 600, color: ({ t }) => t.textHi },
  receiptNext: { fontFamily: fontBody, fontSize: 12, color: ({ t }) => t.textLo },
}));

function wordStyle(t: HangarTokens, w: Word) {
  if (w.tone === 'ok') return { color: t.good, backgroundColor: t.goodSoft, borderColor: t.good };
  if (w.tone === 'bad') return { color: t.bad, backgroundColor: t.badSoft, borderColor: t.bad };
  if (w.tone === 'info') return { color: t.sky, backgroundColor: t.skySoft, borderColor: t.skyLine };
  return { color: t.textLo, backgroundColor: t.panelAlt, borderColor: t.line };
}

export function PrRef({
  pr,
  size = 'chip',
  meta,
  className,
  label,
}: {
  pr: PrLike;
  size?: 'inline' | 'chip' | 'card';
  /** Card only: the second line. Defaults to repo · checks. */
  meta?: ReactNode;
  className?: string;
  /** Inline only: words before the number ("Release Record PR #12"). */
  label?: string;
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const state = pr.state ?? 'open';
  const n = pr.number ?? prNumberFromUrl(pr.url);
  const numText = n !== undefined ? `PR #${n}` : 'PR';
  const done = state === 'merged' || state === 'closed';
  const glyph = <span style={{ color: glyphColor(t, state), fontFamily: fontMono }}>{GLYPH[state]}</span>;
  const word = prWord({ ...pr, state });
  const cx = (...xs: Array<string | false | undefined>) => xs.filter(Boolean).join(' ');

  if (size === 'inline') {
    return (
      <a className={cx(c.inline, done && c.inlineDone, className)} href={pr.url} target="_blank" rel="noopener noreferrer" title={pr.title}>
        {state === 'merged' && <span style={{ color: t.good }}>✓ </span>}
        {label ? `${label} ` : ''}
        {numText} ↗
      </a>
    );
  }

  if (size === 'chip') {
    return (
      <Tooltip title={prDetail(pr)}>
        <a className={cx(c.chip, className)} href={pr.url} target="_blank" rel="noopener noreferrer">
          {glyph}
          <span style={{ color: state === 'open' ? t.sky : t.textLo, textDecoration: state === 'closed' ? 'line-through' : undefined }}>
            #{n ?? '?'}
          </span>
          {!done && pr.ci && <span className={c.dot} style={{ backgroundColor: ciColor(t, pr.ci) }} />}
          {word && <span style={{ color: word.tone === 'bad' ? t.bad : t.textLo }}>{word.text}</span>}
        </a>
      </Tooltip>
    );
  }

  const metaLine =
    meta ??
    [pr.repo, pr.ci ? `${pr.ci.passedChecks}/${pr.ci.totalChecks} checks` : undefined].filter(Boolean).join(' · ');
  return (
    <Tooltip title={pr.ci ? prDetail(pr) : undefined}>
      <a className={cx(c.card, className)} href={pr.url} target="_blank" rel="noopener noreferrer">
        {glyph}
        <span className={c.cardBody}>
          <span className={c.cardTop}>
            <span className={c.num} style={{ color: state === 'open' ? t.sky : t.textLo }}>
              {numText}
            </span>
            {pr.title && (
              <span className={c.title} style={{ color: done ? t.textLo : t.textHi }} title={pr.title}>
                {pr.title}
              </span>
            )}
          </span>
          {metaLine && <span className={c.meta}>{metaLine}</span>}
        </span>
        {!done && pr.ci && !word && <span className={c.dot} style={{ backgroundColor: ciColor(t, pr.ci) }} />}
        {word && (
          <span className={c.word} style={wordStyle(t, word)}>
            {word.text}
          </span>
        )}
        <span className={c.arrow}>↗</span>
      </a>
    </Tooltip>
  );
}

/**
 * What every "Open … PR" action ends in, in place of the form's actions: "PR #57 opened" (or "PR #55 was already
 * open · updated"), the PR as a card, and one line saying what happens next. No raw URL, no second dialog.
 */
export function PrReceipt({
  prUrl,
  title,
  alreadyOpen,
  updated,
  next,
  className,
}: {
  prUrl: string;
  title?: string;
  alreadyOpen?: boolean;
  /** With alreadyOpen: the open PR now carries this change too (a pin PR re-pointed, a branch pushed to). */
  updated?: boolean;
  /** What happens next, as a sentence. "Next: " is added. */
  next?: ReactNode;
  className?: string;
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const n = prNumberFromUrl(prUrl);
  const numText = n !== undefined ? `PR #${n}` : 'The PR';
  const box = alreadyOpen
    ? { backgroundColor: t.panel, borderColor: t.line }
    : { backgroundColor: t.goodSoft, borderColor: t.good };
  return (
    <div className={[c.receipt, className].filter(Boolean).join(' ')} style={box} role="status" data-testid="pr-receipt">
      <div className={c.receiptHead}>
        {alreadyOpen ? (
          <>
            <span style={{ color: t.sky, fontFamily: fontMono }}>○</span>
            {numText} was already open{updated ? ' · updated' : ''}
          </>
        ) : (
          <>
            <span style={{ color: t.good }}>✓</span>
            {numText} opened
          </>
        )}
      </div>
      <PrRef pr={{ url: prUrl, number: n, title }} size="card" meta="" />
      {next && <div className={c.receiptNext}>Next: {next}</div>}
    </div>
  );
}

/** The busy label on any button that opens a PR. */
export const OPENING_PR = 'Opening PR…';
