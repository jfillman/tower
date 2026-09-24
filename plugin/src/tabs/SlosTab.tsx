import { useState } from 'react';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Tooltip from '@material-ui/core/Tooltip';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { RefreshButton } from '../RefreshButton';
import { TowerEmptyState } from '../TowerEmptyState';
import { useSlos } from '../useSlos';
import { usePrometheusInstantQuery } from '../usePrometheusQuery';
import type { SloSummary } from '../types';

// Real Sloth-backed SLO burn-rate view, first built once a live SLO instance
// existed anywhere to verify against (see HANDOFF-tower-slos.md - the SLO
// XRD/composition/Sloth chain was installed but had zero real instances
// before this session added checkout-api's own). Covers every environment
// an app has (not flight-only like Config), matching Topology's scope - a
// user decision for this session, since burn-rate is exactly the kind of
// signal you want everywhere, not just upper envs.
//
// Queries Prometheus directly for two things per SLO, both via the shared
// usePrometheusInstantQuery hook (packages/app/src/modules/tower/
// usePrometheusQuery.ts) rather than a Grafana panel embed - deliberately a
// DIFFERENT mechanism from Overview's still-unbuilt "Grafana panels" section
// (see that tab's own placeholder): this renders Tower-native hand-drawn
// charts from raw PromQL, consistent with CanaryRampChart's existing style,
// not an iframe. A __name__=~ regex selector groups every meta/windowed
// recording rule for one SLO into a single query each, rather than one
// request per metric.
const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  eyebrow: {
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: '0.06em',
    color: ({ t }) => t.textFaint,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' },
  envGroup: { marginBottom: 26 },
  envGroupHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    padding: '7px 14px',
    borderRadius: 6,
    borderLeft: '4px solid',
    marginBottom: 12,
  },
  envGroupDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  envGroupName: {
    fontFamily: fontMono,
    fontWeight: 700,
    fontSize: 13,
    textTransform: 'lowercase',
    letterSpacing: '0.02em',
  },
  envGroupCount: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint, marginLeft: 'auto' },
  grid: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: '14px 18px',
  },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  name: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi },
  sub: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, marginTop: 2 },
  explainer: { fontSize: 13, lineHeight: 1.5, color: ({ t }) => t.textLo, margin: '2px 0 14px' },
  windowsCaption: { fontSize: 11.5, lineHeight: 1.4, color: ({ t }) => t.textFaint, margin: '2px 0 6px' },
  chip: {
    display: 'inline-flex',
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: '2px 8px',
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.skyLine}`,
    backgroundColor: ({ t }) => t.skySoft,
    color: ({ t }) => t.sky,
  },
  headRight: { display: 'flex', alignItems: 'center', gap: 8 },
  verdictChip: {
    display: 'inline-flex',
    fontFamily: fontMono,
    fontSize: 10.5,
    fontWeight: 700,
    padding: '3px 9px',
    borderRadius: 3,
    border: '1px solid',
  },
  statsRow: { display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 },
  stat: { minWidth: 140 },
  statLabel: { fontFamily: fontMono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: ({ t }) => t.textFaint, marginBottom: 4 },
  statValue: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 22 },
  statNote: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint, marginTop: 2 },
  budgetTrack: { height: 8, borderRadius: 4, backgroundColor: ({ t }) => t.panelAlt, overflow: 'hidden', marginTop: 6 },
  budgetFill: { height: '100%', borderRadius: 4 },
  // alignItems left at its 'stretch' default (not 'flex-end') - .windowBar
  // needs to actually receive this container's 60px height so its own
  // flex:1 child can resolve a real pixel height for the bar-fill's
  // percentage height to size against. 'flex-end' here would size every
  // .windowBar to its own content height instead (near-zero), silently
  // collapsing every bar to nothing regardless of real data - confirmed
  // live 2026-09-13 on checkout-api-liveness-latency: real Prometheus data
  // was arriving (verified via the actual network response), the chart
  // area was just empty.
  windows: { display: 'flex', gap: 6, height: 60, marginTop: 4, marginBottom: 4 },
  windowBar: { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 1 0', gap: 4 },
  windowBarFill: { width: '100%', maxWidth: 22, borderRadius: '2px 2px 0 0' },
  windowLabel: { fontFamily: fontMono, fontSize: 9, color: ({ t }) => t.textFaint },
  detailsToggle: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.sky, marginTop: 4 },
  query: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint, backgroundColor: ({ t }) => t.panelAlt, padding: '6px 8px', borderRadius: 4, marginTop: 8, overflowX: 'auto', whiteSpace: 'pre' },
  note: { fontSize: 12, fontStyle: 'italic', color: ({ t }) => t.textLo },
}));

const WINDOWS = ['5m', '30m', '1h', '2h', '6h', '1d', '3d', '30d'] as const;

// 2026-09-15: a single flat violet (the old ENV_ACCENT) marked cards as
// "environment-flavored" but didn't distinguish *which* environment - two
// same-named SLO cards for prod vs proofing both got the identical chip
// color, so the only real cue was the small text label itself ("at the
// moment they all share the same coloured small chip"). This is a per-NAME
// palette instead: each distinct env seen in the current SLO set gets its
// own hue, assigned by index once envs are sorted (see envAccentFor below) -
// stable as long as the same set of envs is on screen, and guaranteed
// non-colliding for however many envs are actually present (cycling past 6
// only if a single app ever has more than 6 environments' worth of SLOs,
// which no real app on this platform does yet). Deliberately avoids
// amber/sky/good/bad - those already carry tier/health meaning elsewhere in
// Tower (EnvironmentTopology's TIER_ACCENT, STATUS_COLOR) - reusing one here
// would misread as tier or status rather than plain env identity.
const ENV_GROUP_PALETTE: Array<{ light: { fg: string; bg: string }; dark: { fg: string; bg: string } }> = [
  { light: { fg: '#6E5FA8', bg: '#EAE6F6' }, dark: { fg: '#B3A6E0', bg: '#292140' } }, // violet
  { light: { fg: '#B0466E', bg: '#F7E3EC' }, dark: { fg: '#E08FB0', bg: '#3A1B29' } }, // rose
  { light: { fg: '#1E7F91', bg: '#DCEEF1' }, dark: { fg: '#6FC7D6', bg: '#16323A' } }, // teal
  { light: { fg: '#7A7A1F', bg: '#F1F1D6' }, dark: { fg: '#C9C96B', bg: '#2E2E12' } }, // olive
  { light: { fg: '#4C5FA6', bg: '#E4E7F7' }, dark: { fg: '#96A8E3', bg: '#1C2140' } }, // indigo
  { light: { fg: '#B25A2E', bg: '#F6E6DA' }, dark: { fg: '#E29A6F', bg: '#3A2416' } }, // terracotta
];

// Bucket key for SLOs missing the hangar.io/env label (shouldn't happen in
// practice - see useSlos.ts's own comment on how every SLO gets it via the
// shared airframe-application.labels chart helper - but the old per-card
// chip already defensively guarded on `slo.env` being present, so this
// grouping keeps that same defensiveness rather than silently dropping
// unlabeled SLOs from the tab).
const UNKNOWN_ENV_KEY = '(no environment)';
const UNKNOWN_ENV_ACCENT = {
  light: { fg: '#5B6570', bg: '#E8ECEF' },
  dark: { fg: '#96A2AC', bg: '#1A1F26' },
};

function envAccentFor(env: string, envOrder: string[], isDark: boolean): { fg: string; bg: string } {
  if (env === UNKNOWN_ENV_KEY) return isDark ? UNKNOWN_ENV_ACCENT.dark : UNKNOWN_ENV_ACCENT.light;
  const idx = Math.max(0, envOrder.indexOf(env));
  const palette = ENV_GROUP_PALETTE[idx % ENV_GROUP_PALETTE.length];
  return isDark ? palette.dark : palette.light;
}

// 2026-09-15: sloth_slo alone is no longer a unique series selector once
// the same SLO name/service is promoted to more than one environment
// (deliberately allowed - see the XRD's own environmentRef comment).
//
// FIRST attempt at this fix matched on a separate `namespace` label
// instead of the `/`-suffix below - airframe's composition added it as a
// Sloth `labels` field on each generated rule. That correctly disambiguated
// the leaf recording rules, but broke every rule Sloth computes by DIVIDING
// two of its own recording rules together (slo:current_burn_rate:ratio,
// slo:sli_error:ratio_rate30d): confirmed live, both went health=err
// ("many-to-many matching not allowed") - Sloth's own generated PromQL
// joins strictly on(sloth_id,sloth_service,sloth_slo), so a label outside
// that fixed set doesn't disambiguate its OWN internal arithmetic, it just
// rides along on what Prometheus still sees as two equally-valid matches
// for that three-label key.
//
// Real fix, matching airframe's composition template (prometheusservicelevel.yaml's
// own comment has the full story): the value INSIDE that fixed match key -
// sloth_slo itself - now differs per environment, built the identical way
// the composition does (`<name>_<namespace>`). `_`, not `/` - a SECOND
// attempt used `/` (safe against Kubernetes' own naming rules) but Sloth
// v0.16.0 rejects `/` in its own SLO name validation, confirmed live:
// every SLO using it got stuck at Ready: False, promOpRulesGenerated:
// false, rather than the softer "wrong data" failure mode `namespace` as
// a label caused. `_` is in Sloth's own allowed charset (alphanumeric,
// '.', '_', '-') and - like `/` - still guaranteed never to appear in a
// Kubernetes namespace name, so it satisfies both constraints at once.
function selectorFor(slo: SloSummary): string {
  return `sloth_service="${slo.service}",sloth_slo="${slo.name}_${slo.namespace}"`;
}

function metaValue(samples: ReturnType<typeof usePrometheusInstantQuery>['samples'], metric: string): number | undefined {
  return samples.find(s => s.metric.__name__ === metric)?.value;
}

// Simple two-tier severity, not Sloth/Alertmanager's real multi-window-
// multi-burn-rate alert pairing (that logic already lives server-side in the
// generated PrometheusRule's alert group - see HANDOFF-tower-slos.md) - this
// is a glance-value for the dashboard, not a re-implementation of the
// alerting policy. >1 means consuming budget faster than the compliance
// period allows; >2 is a blunt "clearly bad" threshold on top of that.
function burnRateTone(t: HangarTokens, rate: number | undefined): string {
  if (rate === undefined) return t.textFaint;
  if (rate > 2) return t.bad;
  if (rate > 1) return t.amberInk;
  return t.good;
}

function budgetTone(t: HangarTokens, remaining: number | undefined): string {
  if (remaining === undefined) return t.textFaint;
  if (remaining < 0.2) return t.bad;
  if (remaining < 0.5) return t.amberInk;
  return t.good;
}

function verdictTone(t: HangarTokens, meeting: boolean | undefined): { bg: string; border: string; fg: string } {
  if (meeting === undefined) return { bg: t.panelAlt, border: t.line, fg: t.textFaint };
  return meeting
    ? { bg: t.goodSoft, border: t.good, fg: t.good }
    : { bg: t.badSoft, border: t.bad, fg: t.bad };
}

// A plain-language reading of the same numbers the stat grid below already
// shows in full precision - 2026-09-14: "the SLO tab is number/metrics
// heavy... a fuzzy human explainer on what you're looking at would be
// helpful". Deliberately generated from the same real fields already
// fetched (no new query) rather than a canned template per SLO - stays
// honest for an indicator this hasn't been hand-written for yet (falls back
// to the raw metric name instead of guessing a friendly noun).
function humanSummary(slo: SloSummary, currentSli: number | undefined, meetingObjective: boolean | undefined, periodDays: number | undefined): string {
  if (currentSli === undefined) return '';
  const probeMatch = slo.indicator.totalFilter.match(/probe_type="(\w+)"/);
  const subject = probeMatch ? `${slo.service}'s ${probeMatch[1].toLowerCase()} probe` : `${slo.service}'s ${slo.indicator.metric}`;
  let verb: string;
  if (slo.indicator.type === 'latency' && slo.indicator.latencyThreshold) {
    const seconds = Number(slo.indicator.latencyThreshold);
    const thresholdText = seconds < 1 ? `${Math.round(seconds * 1000)}ms` : `${seconds}s`;
    verb = `responded within ${thresholdText}`;
  } else {
    verb = 'succeeded';
  }
  const period = periodDays !== undefined ? ` over the last ${periodDays} days` : '';
  let verdict = '';
  if (meetingObjective === true) verdict = ` — comfortably inside the ${slo.objective}% target.`;
  else if (meetingObjective === false) {
    verdict = ` — short of the ${slo.objective}% target, so this SLO is breaching its objective and burning through its error budget.`;
  }
  return `${currentSli.toFixed(1)}% of ${subject} checks${period} ${verb}${verdict}`;
}

// Per-bar hover text for "SLI error ratio by window" - 2026-09-14: "what is
// the actual value that the chart represents? maybe a hover over can
// explain?". Each bar is Sloth's own slo:sli_error:ratio_rate<window>
// recording rule: the fraction of events in that trailing window alone
// that were "bad" (over the latency threshold, or errored for an
// availability indicator) - NOT compared against the 30d compliance period
// the headline SLI/verdict use, just that one window's own local error
// rate. A window's own bar turns red when ITS ratio alone already exceeds
// the error budget - a quick way to spot whether badness is recent (short
// windows red, long windows fine) or historical (the reverse).
function windowTooltip(window: string, ratio: number | undefined, errorBudgetRatio: number | undefined): string {
  if (ratio === undefined) return `${window}: no data for this window yet`;
  const pct = (ratio * 100).toFixed(3);
  if (errorBudgetRatio === undefined) return `${window}: ${pct}% of checks were bad in this window`;
  const budgetPct = (errorBudgetRatio * 100).toFixed(2);
  const verdict = ratio > errorBudgetRatio ? 'over' : 'within';
  return `${window}: ${pct}% of checks were bad in this window - ${verdict} the ${budgetPct}% budget this objective allows`;
}

function SloCard({
  slo,
  refreshNonce,
  accentColor,
}: {
  slo: SloSummary;
  refreshNonce: number;
  accentColor: string;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [showDetails, setShowDetails] = useState(false);
  const selector = selectorFor(slo);

  const meta = usePrometheusInstantQuery(
    slo.cluster,
    // time_period (not time_period_days) - the real recording rule is named
    // slo:time_period:days (confirmed live 2026-09-14: the underscore
    // version never matched anything, silently leaving periodDays
    // undefined on every SLO card - masked on the working one since it only
    // blanks a small caption, not the core numbers).
    `{__name__=~"slo:(objective|current_burn_rate|period_burn_rate|period_error_budget_remaining|time_period):.+",${selector}}`,
    refreshNonce,
  );
  const windowed = usePrometheusInstantQuery(
    slo.cluster,
    `{__name__=~"slo:sli_error:ratio_rate.+",${selector}}`,
    refreshNonce,
  );

  const objectiveRatio = metaValue(meta.samples, 'slo:objective:ratio');
  const currentBurnRate = metaValue(meta.samples, 'slo:current_burn_rate:ratio');
  const periodBurnRate = metaValue(meta.samples, 'slo:period_burn_rate:ratio');
  const budgetRemaining = metaValue(meta.samples, 'slo:period_error_budget_remaining:ratio');
  const periodDays = metaValue(meta.samples, 'slo:time_period:days');

  const errorBudgetRatio = objectiveRatio !== undefined ? 1 - objectiveRatio : undefined;
  const windowValues = new Map(
    windowed.samples.map(s => [s.metric.sloth_window, s.value] as const),
  );
  const maxWindowValue = Math.max(0.0001, ...WINDOWS.map(w => windowValues.get(w) ?? 0));

  // The actual "are we meeting the objective" answer - derived from Sloth's
  // own period_burn_rate/objective meta rules rather than a new query.
  // Sloth defines period_burn_rate = (error ratio over the compliance
  // period) / error_budget, so working backwards: periodErrorRatio =
  // period_burn_rate * error_budget, and the period's real SLI is
  // 1 - periodErrorRatio. period_burn_rate <= 1 (equivalently
  // budgetRemaining >= 0) is exactly Sloth's own definition of "within
  // budget for the full compliance window" - not a judgment call, just
  // restating the same math the burn-rate stat already uses in the more
  // direct terms this tab was missing (2026-09-13: "I don't see the current
  // SLI. do we meet the objective or not?").
  const periodErrorRatio =
    periodBurnRate !== undefined && errorBudgetRatio !== undefined ? periodBurnRate * errorBudgetRatio : undefined;
  const currentSli = periodErrorRatio !== undefined ? (1 - periodErrorRatio) * 100 : undefined;
  const meetingObjective = periodBurnRate !== undefined ? periodBurnRate <= 1 : undefined;
  const summary = humanSummary(slo, currentSli, meetingObjective, periodDays);

  const loading = meta.loading || windowed.loading;
  const anyError = meta.error ?? windowed.error;
  const noDataYet = !loading && !anyError && meta.samples.length === 0;

  return (
    <div className={classes.card} style={{ borderLeftColor: accentColor }}>
      <div className={classes.head}>
        <div>
          <Typography className={classes.name}>{slo.name}</Typography>
          <Typography className={classes.sub}>
            service={slo.service} &middot; {slo.cluster}
            {slo.environmentRefName ? ` · ${slo.environmentRefName}` : ''}
          </Typography>
        </div>
        <div className={classes.headRight}>
          {meetingObjective !== undefined && (
            <span
              className={classes.verdictChip}
              style={{
                backgroundColor: verdictTone(t, meetingObjective).bg,
                borderColor: verdictTone(t, meetingObjective).border,
                color: verdictTone(t, meetingObjective).fg,
              }}
            >
              {meetingObjective ? 'meeting objective' : 'breaching objective'}
            </span>
          )}
          <span className={classes.chip}>{slo.indicator.type}</span>
        </div>
      </div>

      {loading && meta.samples.length === 0 && <Progress />}
      {anyError && (
        <Typography className={classes.note}>Couldn't query Prometheus: {anyError}</Typography>
      )}
      {noDataYet && (
        <Typography className={classes.note}>
          No burn-rate data yet - Sloth's generated recording rules may not have loaded into
          Prometheus yet (this can lag several minutes after an SLO is first created).
        </Typography>
      )}

      {!noDataYet && !anyError && (
        <>
          {summary && <Typography className={classes.explainer}>{summary}</Typography>}
          <div className={classes.statsRow}>
            <div className={classes.stat}>
              <div className={classes.statLabel}>Current SLI</div>
              <div className={classes.statValue} style={{ color: verdictTone(t, meetingObjective).fg }}>
                {currentSli !== undefined ? `${currentSli.toFixed(3)}%` : '—'}
              </div>
              <div className={classes.statNote}>
                {periodDays !== undefined ? `over the last ${periodDays}d` : ' '}
              </div>
            </div>
            <div className={classes.stat}>
              <div className={classes.statLabel}>Objective</div>
              <div className={classes.statValue} style={{ color: t.textHi }}>
                {slo.objective}%
              </div>
              {periodDays !== undefined && (
                <div className={classes.statNote}>{periodDays}d compliance window</div>
              )}
            </div>
            <div className={classes.stat}>
              <div className={classes.statLabel}>Current burn rate</div>
              <div className={classes.statValue} style={{ color: burnRateTone(t, currentBurnRate) }}>
                {currentBurnRate !== undefined ? `${currentBurnRate.toFixed(2)}×` : '—'}
              </div>
              <div className={classes.statNote}>
                {periodBurnRate !== undefined ? `${periodBurnRate.toFixed(2)}× over full period` : ' '}
              </div>
            </div>
            <div className={classes.stat} style={{ flex: '1 1 220px' }}>
              <div className={classes.statLabel}>Error budget remaining</div>
              <div className={classes.statValue} style={{ color: budgetTone(t, budgetRemaining) }}>
                {budgetRemaining !== undefined ? `${(budgetRemaining * 100).toFixed(1)}%` : '—'}
              </div>
              <div className={classes.budgetTrack}>
                <div
                  className={classes.budgetFill}
                  style={{
                    width: `${Math.max(0, Math.min(100, (budgetRemaining ?? 0) * 100))}%`,
                    backgroundColor: budgetTone(t, budgetRemaining),
                  }}
                />
              </div>
            </div>
          </div>

          <div className={classes.statLabel}>SLI error ratio by window</div>
          <Typography className={classes.windowsCaption}>
            Each bar is the share of checks that were bad within that trailing window alone (not the
            30-day figure above) - red means that window's own error rate already exceeds the budget.
            Hover a bar for the exact number.
          </Typography>
          <div className={classes.windows}>
            {WINDOWS.map(w => {
              const v = windowValues.get(w);
              const heightPct = v !== undefined ? Math.max(2, (v / maxWindowValue) * 100) : 0;
              const overBudget = errorBudgetRatio !== undefined && v !== undefined && v > errorBudgetRatio;
              let barColor = t.sky;
              if (v === undefined) barColor = t.lineSoft;
              else if (overBudget) barColor = t.bad;
              return (
                <Tooltip key={w} title={windowTooltip(w, v, errorBudgetRatio)} arrow>
                  <div className={classes.windowBar}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                      <div
                        className={classes.windowBarFill}
                        style={{
                          height: `${heightPct}%`,
                          backgroundColor: barColor,
                        }}
                      />
                    </div>
                    <span className={classes.windowLabel}>{w}</span>
                  </div>
                </Tooltip>
              );
            })}
          </div>

          <button type="button" className={classes.detailsToggle} onClick={() => setShowDetails(s => !s)}>
            {showDetails ? 'hide' : 'show'} indicator definition
          </button>
          {showDetails && (
            <div className={classes.query}>
              metric: {slo.indicator.metric}
              {'\n'}totalFilter: {slo.indicator.totalFilter}
              {slo.indicator.errorFilter ? `\nerrorFilter: ${slo.indicator.errorFilter}` : ''}
              {slo.indicator.latencyThreshold ? `\nlatencyThreshold: ${slo.indicator.latencyThreshold}s` : ''}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function SlosTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const isDark = useTheme().palette.type === 'dark';
  const { slos, loading, refreshing, error } = useSlos();
  const [refreshNonce, setRefreshNonce] = useState(0);

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={new Error(error)} />;
  if (slos.length === 0) {
    return (
      <TowerEmptyState
        title="No SLOs declared"
        description="Add an `slos:` entry to this app's gitops values.yaml (airframe's slos.catalog.idp.io XRD) to get burn-rate views here. There is currently no in-Tower way to author one - see this app's Config tab for what is and isn't editable there yet."
      />
    );
  }

  // Group by env (2026-09-15, "I'd like to see the SLOs grouped by env...
  // there needs to be a better distinction between the environments") -
  // envOrder is sorted once so envAccentFor's index-based color assignment
  // is stable across re-renders regardless of the underlying slos array's
  // own name-first sort order (useSlos.ts).
  const envOrder = Array.from(new Set(slos.map(s => s.env ?? UNKNOWN_ENV_KEY))).sort();
  const groups = envOrder.map(env => ({
    env,
    slos: slos.filter(s => (s.env ?? UNKNOWN_ENV_KEY) === env),
  }));

  return (
    <div>
      <div className={classes.toolbar}>
        <Typography className={classes.eyebrow}>
          {slos.length} SLO{slos.length === 1 ? '' : 's'} across {envOrder.length} environment
          {envOrder.length === 1 ? '' : 's'}
          {refreshing ? ' · refreshing…' : ''}
        </Typography>
        <RefreshButton onClick={() => setRefreshNonce(n => n + 1)} />
      </div>
      {groups.map(group => {
        const accent = envAccentFor(group.env, envOrder, isDark);
        return (
          <div key={group.env} className={classes.envGroup}>
            <div
              className={classes.envGroupHeader}
              style={{ borderLeftColor: accent.fg, backgroundColor: accent.bg }}
            >
              <span className={classes.envGroupDot} style={{ backgroundColor: accent.fg }} />
              <span className={classes.envGroupName} style={{ color: accent.fg }}>
                {group.env}
              </span>
              <span className={classes.envGroupCount}>
                {group.slos.length} SLO{group.slos.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className={classes.grid}>
              {group.slos.map(slo => (
                <SloCard
                  key={`${slo.cluster}/${slo.namespace}/${slo.name}`}
                  slo={slo}
                  refreshNonce={refreshNonce}
                  accentColor={accent.fg}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
