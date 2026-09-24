import type { KeyboardEvent, MouseEvent } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import CheckIcon from '@material-ui/icons/Check';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import SecurityIcon from '@material-ui/icons/Security';
import SyncIcon from '@material-ui/icons/Sync';
import TrendingUpIcon from '@material-ui/icons/TrendingUp';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import { relativeTime, formatDateTime } from '../shared/format';
import { fontMono, type HangarTokens } from '../brand/tokens';
import { keepScrollPosition } from './preventFocusScroll';
import { PrButton } from './PrButton';
import { parseGitopsPrTitle } from './useReleaseContext';
import type { CdDelivery, CdStep, CdStepKey, CdStepStatus } from './useCdDelivery';
import { imageTag as imageTagOf } from './types';
import type { PrCheckRun, PullRequestSummary } from '../pullRequests/usePullRequests';

// Shared CD-delivery rendering primitives - originally this file's own
// "Signal Rail" component (the 2026-09-11 CD-panel mockup option the user
// picked, "let's go with option A": the dot-and-connector visual language
// PipelineFlow.tsx already used for the Releases tab's supply-chain view,
// applied to the GitOps delivery flow instead). That top-level component
// was retired 2026-09-16 when the Deployments tab redesign
// (HANDOFF-tower-cicd-redesign.md, "Ground Control") replaced its whole
// per-env dual current/previous rail layout with a single-environment
// full-page view - but the pieces it was built from (Rail's dot/connector
// step renderer, GateLedger, DeliverySource, and the gate tone helpers)
// are still exactly what that new tab needs, so they live on here as named
// exports rather than being rewritten.

export const useSignalRailStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  '@keyframes pulse': {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.5 },
  },
  rail: { display: 'flex', alignItems: 'stretch', gap: 2, padding: '6px 4px 18px' },
  node: {
    flex: '1 1 0',
    minWidth: 96,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 7,
    position: 'relative',
    borderRadius: 10,
    padding: '4px 2px',
  },
  nodeClickable: {
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    '&:hover': { backgroundColor: ({ t }) => t.panelAlt },
  },
  nodeSelected: {
    backgroundColor: ({ t }) => t.skySoft,
    boxShadow: ({ t }) => `0 0 0 1px ${t.skyLine}`,
  },
  dot: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid transparent',
    fontSize: 15,
  },
  // A real arrow between DAG nodes (2026-09-16: "put arrows between the
  // stages", later "make them tall and skinny and perhaps our amber
  // colour") - just lays out the TallArrow glyph now; this used to also
  // paint a colored progress bar as its own background, but that bar sat
  // behind the glyph and stayed visible around its edges once the glyph
  // was made narrower than the connector's own width (2026-09-16 bug:
  // "the old green arrows are still visible underneath the new amber
  // chevrons"). The dot/icon colors at each node already carry the same
  // progress signal the bar duplicated.
  connector: {
    flex: '0 0 22px',
    alignSelf: 'center',
    height: 2,
    marginTop: -27,
    position: 'relative',
  },
  connectorArrow: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
  },
  dotCurrent: { animation: '$pulse 1.6s ease-in-out infinite' },
  label: {
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: ({ t }) => t.textFaint,
    textAlign: 'center',
  },
  meta: { fontFamily: fontMono, fontSize: 9.5, color: ({ t }) => t.textFaint, textAlign: 'center' },
  gatesTogglePulse: { animation: '$pulse 1.6s ease-in-out infinite' },
  // Real GitHub Check Runs on the release PR's head commit - this
  // platform's release guardrails (sast/image-scan/provenance/sbom/itsm/qa/
  // policy-validation/image-promotion, see glidepath-catalog's docs/admin/
  // release-guardrails.md) each post exactly one of these. `gatesTogglePulse`
  // above is this ledger's per-check pulsing dot while a check is still
  // running - `gateAggregateTone`'s own PR-title header treatment.
  gateLedger: {
    margin: '0 20px 14px',
    padding: '12px 14px',
    backgroundColor: ({ t }) => t.panelAlt,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 8,
  },
  ledgerHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  ledgerTitle: {
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: ({ t }) => t.textFaint,
  },
  ledgerCount: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textHi },
  gateRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '6px 0',
    borderBottom: ({ t }) => `1px dashed ${t.lineSoft}`,
  },
  gateRowLast: { borderBottom: 'none' },
  gateRowTop: { display: 'flex', alignItems: 'center', gap: 10 },
  gateRowDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  gateName: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textHi, flex: 1 },
  gateStatusText: { fontFamily: fontMono, fontSize: 10.5, whiteSpace: 'nowrap' },
  gateLink: {
    fontFamily: fontMono,
    fontSize: 10,
    color: ({ t }) => t.sky,
    textDecoration: 'none',
    marginLeft: 8,
    '&:hover': { textDecoration: 'underline' },
  },
  // The gate's own real output.summary/title (2026-09-12: "I'd also like to
  // see any message output of each gate") - indented under the dot to line
  // up with the name, not the dot itself.
  gateMessage: {
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.textFaint,
    paddingLeft: 18,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  commitRow: {
    display: 'inline-flex',
    fontFamily: fontMono,
    fontSize: 12,
    padding: '7px 12px',
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textFaint,
  },
}));

function dotStyle(t: HangarTokens, status: CdStepStatus) {
  switch (status) {
    case 'good':
      return { backgroundColor: t.goodSoft, borderColor: t.good, color: t.good };
    case 'current':
      return { backgroundColor: t.amberSoft, borderColor: t.amber, color: t.amberInk };
    case 'bad':
      return { backgroundColor: t.badSoft, borderColor: t.bad, color: t.bad };
    case 'pending':
    default:
      return { backgroundColor: t.panelAlt, borderColor: t.line, color: t.textFaint };
  }
}

// A typical git pull-request glyph (2026-09-16: "redesign the icon to be a
// typical git PR symbol") - GitHub's own Octicon "git-pull-request" shape
// (two circles joined by a branch line), not a generic Material icon, so
// the Created/Merged stages read as "PR" at a glance the way GitHub's own
// UI trained users to recognize. Same shape for both stages per feedback
// ("use the same or similar icon as PR Created") - status color (via
// dotStyle) is what tells created/open apart from merged/done, not the
// glyph itself.
export function GitPrIcon({ fontSize = 16 }: { fontSize?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={fontSize} height={fontSize} fill="currentColor">
      <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
    </svg>
  );
}

// A tall, skinny directional arrow (2026-09-16: "change the arrows, make
// them tall and skinny and perhaps our amber colour") - a plain "→"
// character reads wide and short at any font size; this is a real
// chevron shape instead, proportioned the way the user asked, colored via
// `currentColor` so callers set it with plain CSS `color`. `rotate` lets
// the same glyph serve the env picker's vertical Ground→Flight connector
// (90deg) without a second shape to maintain.
export function TallArrow({ size = 20, rotate = 0 }: { size?: number; rotate?: number }) {
  return (
    <svg
      viewBox="0 0 8 20"
      width={size * 0.4}
      height={size}
      fill="none"
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
    >
      <path d="M1 2 L7 10 L1 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Per-stage type glyph, shown regardless of status (color still comes from
// dotStyle) so each DAG node reads as "what kind of stage is this" at a
// glance, not just "did it pass" - a plain checkmark told every good step
// apart from every other good step identically (2026-09-16 feedback: "come
// up with new icons for App Sync, Rollout Started, Rollout Complete", plus
// the guardrails/created/merged icon requests). A failed step always shows
// the error glyph regardless of stage, since "this broke" matters more than
// "which kind of stage this is" once something's actually wrong.
function StepIcon({ stepKey, status }: { stepKey: CdStepKey; status: CdStepStatus }) {
  if (status === 'bad') return <ErrorOutlineIcon fontSize="inherit" />;
  if (stepKey === 'created') return <GitPrIcon />;
  if (stepKey === 'guardrails') return <SecurityIcon fontSize="inherit" />;
  if (stepKey === 'merged') return <GitPrIcon />;
  if (stepKey === 'synced') return <SyncIcon fontSize="inherit" />;
  if (stepKey === 'progressing') return <TrendingUpIcon fontSize="inherit" />;
  if (stepKey === 'healthy') return status === 'good' ? <CheckCircleIcon fontSize="inherit" /> : null;
  if (status === 'good') return <CheckIcon fontSize="inherit" />;
  return null;
}

function stepMetaText(step: CdStep, metaOverride?: { key: CdStepKey; text: string }): string {
  if (step.key === metaOverride?.key) return metaOverride.text;
  if (step.at) return `${relativeTime(step.at)} · ${formatDateTime(step.at)}`;
  return '—';
}

export function Rail({
  steps,
  classes,
  t,
  belowKey,
  below,
  metaOverride,
  labelOverride,
  selectedKey,
  onSelectKey,
}: {
  steps: CdStep[];
  classes: ReturnType<typeof useSignalRailStyles>;
  t: HangarTokens;
  // Renders `below` under whichever step matches `belowKey` (see the
  // `rolloutToggleBelow` style's own comment) rather than in the lane-label
  // row above the whole rail.
  belowKey?: CdStepKey;
  below?: JSX.Element;
  // Real canary step/weight text ("step 6/10 · 60% now") shown in place of
  // the usual "—" for whichever step matches `metaOverride.key` - a
  // multi-minute canary's real setWeight/pause/analysis steps mean
  // "Progressing" can legitimately glow for several real minutes with no
  // timestamp yet (it hasn't finished), which read as frozen/stuck rather
  // than actively moving (2026-09-12: "continuously shows the 'app health:
  // progressing' stage as still active... never updates with a
  // timestamp"). There's nothing to timestamp until it's actually done, but
  // there IS real live progress to show meanwhile.
  metaOverride?: { key: CdStepKey; text: string };
  // Dynamic label text for whichever step matches `labelOverride.key`,
  // replacing the step's static `label` entirely (2026-09-16: "remove the
  // small (x/8 guardrails) pill above the 'Guardrails Checked' stage, move
  // the x/8 part down to the stage name and make it dynamic like the pill
  // is today") - e.g. "Guardrails checked (6/8)" in place of the old
  // floating chip this replaces.
  labelOverride?: { key: CdStepKey; text: string };
  // Click-to-select (2026-09-16: Ground Control's DAG now drives a detail
  // panel below it from whichever stage is clicked, not a separate linear
  // "play by play" list) - `selectedKey` renders that node with a
  // `nodeSelected` ring, `onSelectKey` makes every node a real button.
  // Omit both to render a plain, non-interactive rail (unused today, but
  // keeps Rail usable for a future read-only context without a detail panel
  // to drive).
  selectedKey?: CdStepKey;
  onSelectKey?: (key: CdStepKey) => void;
}) {
  return (
    <div className={classes.rail}>
      {steps.map((step, i) => (
        <div key={step.key} style={{ display: 'contents' }}>
          <div
            className={`${classes.node} ${onSelectKey ? classes.nodeClickable : ''} ${
              step.key === selectedKey ? classes.nodeSelected : ''
            }`}
            {...(onSelectKey
              ? {
                  role: 'button',
                  tabIndex: 0,
                  onClick: (e: MouseEvent<HTMLElement>) => keepScrollPosition(e.currentTarget, () => onSelectKey(step.key)),
                  onKeyDown: (e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') keepScrollPosition(e.currentTarget as Element, () => onSelectKey(step.key));
                  },
                  // Suppresses the browser's default click-to-focus scroll
                  // (2026-09-16 bug: "when you click on a deployment stage,
                  // the page scrolls up to the top... it should stay
                  // focused on the DAG and details panel") - a focusable
                  // div's native click-focus can trigger scrollIntoView
                  // against the wrong ancestor in a nested-scroll layout
                  // like this page's. preventDefault on mousedown (which
                  // fires before focus is applied) stops that focus/scroll
                  // entirely without affecting the click handler above or
                  // keyboard activation (Tab+Enter never goes through
                  // mousedown).
                  onMouseDown: (e: MouseEvent) => e.preventDefault(),
                }
              : {})}
          >
            <span
              className={`${classes.dot} ${step.status === 'current' ? classes.dotCurrent : ''}`}
              style={dotStyle(t, step.status)}
            >
              <StepIcon stepKey={step.key} status={step.status} />
            </span>
            <span className={classes.label}>{step.key === labelOverride?.key ? labelOverride.text : step.label}</span>
            <span className={classes.meta} title={step.at ? formatDateTime(step.at) : undefined}>
              {stepMetaText(step, metaOverride)}
            </span>
            {step.key === belowKey && below}
          </div>
          {i < steps.length - 1 && (
            <div className={classes.connector}>
              <span className={classes.connectorArrow} style={{ color: t.amber }}>
                <TallArrow size={18} />
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// The release PR's own title is the only place the deployed image tag lives
// (`Release: appName to targetEnv @ imageTag`, see parseGitopsPrTitle) -
// PrButton's title text truncates at 40 chars, which this fixed-format title
// routinely exceeds, so the tag was effectively hidden. Surfaced explicitly
// in the lane label instead (2026-09-11: "is it possible to list the tag
// that's being deployed?"). A direct-commit delivery (Ground-tier, no PR)
// already carries its own tag straight off the deploy-history entry.
export function deliveryTag(delivery: CdDelivery): string | undefined {
  if (delivery.pr) return parseGitopsPrTitle(delivery.pr.title)?.imageTag;
  if (delivery.commit) return imageTagOf(delivery.commit.imageTag);
  return undefined;
}

// Aggregate tone for the toggle pill itself, from the PR's overall ci.state
// (already computed backend-side across every real check run).
export function gateAggregateTone(t: HangarTokens, state: string | undefined): { bg: string; border: string; fg: string; pulse: boolean } {
  if (state === 'success') return { bg: t.goodSoft, border: t.good, fg: t.good, pulse: false };
  if (state === 'failure') return { bg: t.badSoft, border: t.bad, fg: t.bad, pulse: false };
  if (state === 'pending') return { bg: t.amberSoft, border: t.amberLine, fg: t.amberInk, pulse: true };
  return { bg: t.panelAlt, border: t.line, fg: t.textFaint, pulse: false };
}

// Per-gate tone, from that one check run's own status/conclusion - GitHub's
// real vocabulary (queued/in_progress/completed, and a completed run's
// conclusion: success/failure/neutral/cancelled/skipped/timed_out/
// action_required/stale), not this platform's own.
export function gateCheckTone(t: HangarTokens, check: PrCheckRun): { label: string; color: string; pulse: boolean } {
  if (check.status !== 'completed') return { label: 'running', color: t.amberInk, pulse: true };
  if (check.conclusion === 'success') return { label: 'passed', color: t.good, pulse: false };
  if (check.conclusion === 'skipped' || check.conclusion === 'neutral' || check.conclusion === 'cancelled') {
    return { label: check.conclusion, color: t.textFaint, pulse: false };
  }
  return { label: check.conclusion ?? 'failed', color: t.bad, pulse: false };
}

// Pipelines-as-Code names every Check Run "Pipelines as Code CI / <gate>-"
// (confirmed live against a real gitops release PR's check-runs, 2026-09-12
// - the first attempt at this guessed "Pipelines as Code / <gate>" with a
// trailing slash, which doesn't match the real string at all: it's missing
// the "CI" and the real trailing character is a hyphen, not a slash - see
// docs/admin/naming-conventions.md's own PaC onboarding template naming for
// where the trailing "-<gate>-" segment comes from). Trimmed here rather
// than at the source (2026-09-12: "can we trim off the 'Pipelines as Code
// /' portion of the name? also the trailing slash"). Anything that doesn't
// match this real prefix (a gate reported some other way) passes through
// unchanged rather than being mangled by a looser guess.
export function formatGateName(name: string): string {
  return name.replace(/^Pipelines as Code(?:\s+CI)?\s*\/\s*/i, '').replace(/-+\s*$/, '');
}

// The real gate comment (comment-pr-check-result.yaml) is markdown - light
// stripping only (headings/bold/code-fence markers), not a full renderer,
// since this still lands in a plain pre-wrap <div>. Good enough to turn
// "### ❌ `sast` failed" into "❌ sast failed" rather than showing the raw
// markdown syntax verbatim.
function stripLightMarkdown(s: string): string {
  return s
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/`([^`]+)`/g, '$1');
}

export function GateLedger({
  ci,
  classes,
  t,
}: {
  ci: NonNullable<PullRequestSummary['ci']>;
  classes: ReturnType<typeof useSignalRailStyles>;
  t: HangarTokens;
}) {
  const checks = ci.checks ?? [];
  return (
    <div className={classes.gateLedger}>
      <div className={classes.ledgerHead}>
        <span className={classes.ledgerTitle}>Required checks on this PR</span>
        <span className={classes.ledgerCount}>
          {ci.passedChecks}/{ci.totalChecks} passed
        </span>
      </div>
      {checks.map((check, i) => {
        const tone = gateCheckTone(t, check);
        return (
          <div key={check.name} className={`${classes.gateRow} ${i === checks.length - 1 ? classes.gateRowLast : ''}`}>
            <div className={classes.gateRowTop}>
              <span
                className={`${classes.gateRowDot} ${tone.pulse ? classes.gatesTogglePulse : ''}`}
                style={{ backgroundColor: tone.color }}
              />
              <span className={classes.gateName}>{formatGateName(check.name)}</span>
              <span className={classes.gateStatusText} style={{ color: tone.color }}>
                {tone.label}
              </span>
              {check.commentUrl && (
                <a className={classes.gateLink} href={check.commentUrl} target="_blank" rel="noopener noreferrer">
                  PR comment →
                </a>
              )}
            </div>
            {check.message && <div className={classes.gateMessage}>{stripLightMarkdown(check.message)}</div>}
          </div>
        );
      })}
    </div>
  );
}

// Ground-tier envs have no PR to show - just the commit that landed on the
// gitops branch directly (2026-09-11: "the deploy pipeline for ground envs
// doesn't create a PR, it just pushes a commit direct to the branch").
// Mirrors PrButton's own compact pill treatment rather than introducing a
// visually distinct pattern for what's still fundamentally the same "here's
// what triggered this delivery" row.
export function DeliverySource({ delivery, classes }: { delivery: CdDelivery; classes: ReturnType<typeof useSignalRailStyles> }) {
  if (delivery.pr) return <PrButton pr={delivery.pr} showTarget />;
  if (delivery.commit) {
    return (
      <span className={classes.commitRow}>
        direct commit &middot; {delivery.commit.sha.slice(0, 7)} &middot; {formatDateTime(delivery.commit.date)}
      </span>
    );
  }
  return null;
}

